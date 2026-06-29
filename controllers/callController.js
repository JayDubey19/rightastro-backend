/**
 * callController.js — FIXED
 *
 * Bug fixes:
 * 1. Token generation errors properly catch karo — crash nahi hona chahiye
 * 2. Agar token empty string aaya toh 500 return karo (nahi ki empty token pass karo)
 * 3. Debug logs add kiye taaki Railway logs mein dikh sake exactly kya ho raha hai
 * 4. Double "incoming_call" emit fix — ab ek hi baar emit hoga
 */

const { generateAgoraToken } = require('../utils/agoraTokenGenerator');
const CallSession = require('../models/CallSession');
const Astrologer = require('../models/Astrologer');
const User = require('../models/User');

/**
 * POST /api/calls/token
 * User call karta hai — token generate karo + astrologer ko socket se notify karo
 * Body: { astrologerId, userId, durationMinutes (10/20/30) }
 */
const getCallToken = async (req, res) => {
  try {
    const { astrologerId, userId, durationMinutes = 10 } = req.body;

    console.log(`📞 getCallToken called — userId: ${userId}, astrologerId: ${astrologerId}, duration: ${durationMinutes}min`);

    if (!astrologerId || !userId) {
      return res.status(400).json({ message: 'astrologerId aur userId dono chahiye' });
    }

    // Validate duration
    const allowedDurations = [10, 20, 30];
    const duration = allowedDurations.includes(Number(durationMinutes))
      ? Number(durationMinutes)
      : 10;

    const astrologer = await Astrologer.findById(astrologerId);
    if (!astrologer) {
      return res.status(404).json({ message: 'Astrologer nahi mila' });
    }

    if (!astrologer.isOnline) {
      return res.status(400).json({ message: 'Astrologer abhi offline hai' });
    }

    // User ka naam fetch karo (callerName ke liye)
    let callerName = 'User';
    try {
      const user = await User.findById(userId).select('name');
      if (user?.name) callerName = user.name;
    } catch {
      // non-critical
    }

    // Unique channel name
    const channelName = `call_${userId}_${astrologerId}_${Date.now()}`;
    console.log(`📡 Channel: ${channelName}`);

    // ─── Token Generation ──────────────────────────────────────────────────────
    let userToken, astrologerToken;
    try {
      userToken = generateAgoraToken(channelName, 0, 'publisher');
      astrologerToken = generateAgoraToken(channelName, 0, 'publisher');
    } catch (tokenErr) {
      console.error('❌ Token generation failed:', tokenErr.message);
      return res.status(500).json({
        message: `Token generation failed: ${tokenErr.message}`,
        hint: 'AGORA_APP_ID aur AGORA_APP_CERTIFICATE Railway env variables mein set karo',
      });
    }

    if (!userToken || !astrologerToken) {
      console.error('❌ Token is empty string — App Certificate check karo');
      return res.status(500).json({
        message: 'Agora token empty aaya — App Certificate Agora Console mein enable karo',
      });
    }

    // DB mein save
    const session = await CallSession.create({
      channelName,
      userId,
      astrologerId,
      durationMinutes: duration,
      status: 'pending',
    });
    console.log(`✅ Session created: ${session._id}`);

    // ─── Socket se astrologer ko notify karo ──────────────────────────────────
    const io = req.app.get('io');
    const astrologerSockets = req.app.get('astrologerSockets');
    const astrologerSocketId = astrologerSockets[astrologerId.toString()];

    console.log(`🔌 Astrologer socket lookup: ${astrologerId} → ${astrologerSocketId ?? 'NOT FOUND'}`);
    console.log(`🔌 All connected sockets:`, Object.keys(astrologerSockets));

    if (astrologerSocketId) {
      // ✅ FIX: sirf ek baar emit karo
      io.to(astrologerSocketId).emit('incoming_call', {
        sessionId: session._id,
        channelName,
        astrologerToken,
        appId: process.env.AGORA_APP_ID,
        userId,
        durationMinutes: duration,
        callerName,
      });
      console.log(`✅ incoming_call emitted to astrologer ${astrologerId} (socket: ${astrologerSocketId})`);
    } else {
      console.log(`⚠️ Astrologer ${astrologerId} ka socket nahi mila — offline ho sakta hai`);
      // Session miss mark karo
      await CallSession.findByIdAndUpdate(session._id, { status: 'missed' });
      return res.status(400).json({ message: 'Astrologer abhi available nahi hai (socket disconnected)' });
    }

    return res.status(200).json({
      token: userToken,
      channelName,
      appId: process.env.AGORA_APP_ID,
      sessionId: session._id,
      durationMinutes: duration,
    });
  } catch (error) {
    console.error('getCallToken Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/calls/start
 * Astrologer accept kare tab call active karo
 */
const startCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    console.log(`▶️ startCall: ${sessionId}`);

    const session = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'active', startedAt: new Date() },
      { new: true },
    );

    if (!session) return res.status(404).json({ message: 'Session nahi mila' });

    console.log(`✅ Call active: ${sessionId}`);
    return res.status(200).json({ message: 'Call active', session });
  } catch (error) {
    console.error('startCall Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/calls/end
 * Call khatam — duration aur cost calculate
 */
const endCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    console.log(`⏹️ endCall: ${sessionId}`);

    const session = await CallSession.findById(sessionId).populate('astrologerId');
    if (!session) return res.status(404).json({ message: 'Session nahi mila' });

    if (session.status === 'ended') {
      // Already ended — same data return karo (idempotent)
      return res.status(200).json({
        message: 'Call already ended',
        durationSeconds: session.durationSeconds,
        totalCost: session.totalCost,
        session,
      });
    }

    const endedAt = new Date();
    const startedAt = session.startedAt || endedAt;
    const durationSeconds = Math.floor((endedAt - startedAt) / 1000);
    const pricePerMinute = session.astrologerId?.pricePerMinute || 0;
    const totalCost = parseFloat(((durationSeconds / 60) * pricePerMinute).toFixed(2));

    const updatedSession = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'ended', endedAt, durationSeconds, totalCost },
      { new: true },
    );

    console.log(`✅ Call ended: ${sessionId}, duration: ${durationSeconds}s, cost: ₹${totalCost}`);
    return res.status(200).json({
      message: 'Call ended',
      durationSeconds,
      totalCost,
      session: updatedSession,
    });
  } catch (error) {
    console.error('endCall Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/calls/reject
 * Astrologer ne reject kiya
 */
const rejectCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    console.log(`❌ rejectCall: ${sessionId}`);

    const session = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'missed' },
      { new: true },
    );

    return res.status(200).json({ message: 'Call rejected', session });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/calls/history/:userId
 */
const getCallHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const calls = await CallSession.find({ userId })
      .populate('astrologerId', 'name pricePerMinute')
      .sort({ createdAt: -1 })
      .limit(20);

    return res.status(200).json(calls);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { getCallToken, startCall, endCall, rejectCall, getCallHistory };
