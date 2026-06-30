/**
 * callController.js — UPDATED
 *
 * Changes from last version:
 * 1. endCall now emits  'call_ended'  to the user's socket so their
 *    CallScreen auto-disconnects when the astrologer ends the call.
 *    Requires:  userSockets map  on the server (same pattern as astrologerSockets).
 *
 * 2. getTodayStats and getAstrologerCallHistory unchanged.
 *
 * ─── Socket setup needed in server.js (if not already) ───────────────────
 *
 *   const userSockets = {};          // userId → socketId
 *   app.set('userSockets', userSockets);
 *
 *   io.on('connection', (socket) => {
 *     socket.on('register_user', (userId) => {
 *       userSockets[userId] = socket.id;
 *     });
 *     socket.on('disconnect', () => {
 *       // clean up — optional but good practice
 *       for (const [id, sid] of Object.entries(userSockets)) {
 *         if (sid === socket.id) { delete userSockets[id]; break; }
 *       }
 *     });
 *   });
 * ─────────────────────────────────────────────────────────────────────────
 */

const { generateAgoraToken } = require('../utils/agoraTokenGenerator');
const CallSession = require('../models/CallSession');
const Astrologer = require('../models/Astrologer');
const User = require('../models/User');

/**
 * Short unique channel name — max ~22 chars, Agora safe
 */
const makeChannelName = (userId, astrologerId) => {
  const ts = Date.now().toString().slice(-8);
  const u = userId.toString().slice(-6);
  const a = astrologerId.toString().slice(-6);
  return `ch${u}${a}${ts}`;
};

// ─── getCallToken ────────────────────────────────────────────────────────────

const getCallToken = async (req, res) => {
  try {
    const { astrologerId, userId, durationMinutes = 10 } = req.body;

    console.log(`📞 getCallToken — userId: ${userId}, astrologerId: ${astrologerId}, duration: ${durationMinutes}min`);

    if (!astrologerId || !userId) {
      return res.status(400).json({ message: 'astrologerId aur userId dono chahiye' });
    }

    const allowedDurations = [10, 20, 30];
    const duration = allowedDurations.includes(Number(durationMinutes))
      ? Number(durationMinutes)
      : 10;

    const astrologer = await Astrologer.findById(astrologerId);
    if (!astrologer) return res.status(404).json({ message: 'Astrologer not found' });
    if (!astrologer.isOnline) return res.status(400).json({ message: 'Astrologer is currently offline' });

    let callerName = 'Client';
    try {
      const user = await User.findById(userId).select('name');
      if (user?.name) callerName = user.name;
    } catch {}

    const channelName = makeChannelName(userId, astrologerId);
    console.log(`📡 Channel: "${channelName}" (${channelName.length} chars)`);

    let userToken, astrologerToken;
    try {
      userToken = generateAgoraToken(channelName, 0, 'publisher');
      astrologerToken = generateAgoraToken(channelName, 0, 'publisher');
    } catch (tokenErr) {
      console.error('❌ Token generation failed:', tokenErr.message);
      return res.status(500).json({ message: `Token error: ${tokenErr.message}` });
    }

    const session = await CallSession.create({
      channelName,
      userId,
      astrologerId,
      durationMinutes: duration,
      status: 'pending',
    });
    console.log(`✅ Session created: ${session._id}`);

    const io = req.app.get('io');
    const astrologerSockets = req.app.get('astrologerSockets');
    const astrologerSocketId = astrologerSockets[astrologerId.toString()];

    if (!astrologerSocketId) {
      await CallSession.findByIdAndUpdate(session._id, { status: 'missed' });
      return res.status(400).json({ message: 'Astrologer is not available right now' });
    }

    io.to(astrologerSocketId).emit('incoming_call', {
      sessionId: session._id,
      channelName,
      astrologerToken,
      appId: process.env.AGORA_APP_ID,
      userId,
      durationMinutes: duration,
      callerName,
    });
    console.log(`✅ incoming_call emitted → socket ${astrologerSocketId}`);

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

// ─── startCall ───────────────────────────────────────────────────────────────

const startCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'active', startedAt: new Date() },
      { new: true },
    );
    if (!session) return res.status(404).json({ message: 'Session not found' });
    console.log(`✅ Call active: ${sessionId}`);
    return res.status(200).json({ message: 'Call active', session });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── endCall ─────────────────────────────────────────────────────────────────

const endCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await CallSession.findById(sessionId).populate('astrologerId');
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (session.status === 'ended') {
      return res.status(200).json({
        message: 'Already ended',
        durationSeconds: session.durationSeconds,
        totalCost: session.totalCost,
      });
    }

    const endedAt = new Date();
    const startedAt = session.startedAt || endedAt;
    const durationSeconds = Math.floor((endedAt - startedAt) / 1000);
    const pricePerMinute = session.astrologerId?.pricePerMinute || 0;
    const totalCost = parseFloat(((durationSeconds / 60) * pricePerMinute).toFixed(2));

    const updated = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'ended', endedAt, durationSeconds, totalCost },
      { new: true },
    );

    // Update astrologer totals
    try {
      await Astrologer.findByIdAndUpdate(session.astrologerId._id, {
        $inc: {
          totalEarnings: totalCost,
          totalConsultations: 1,
        },
      });
    } catch (e) {
      console.warn('Could not update astrologer totals:', e.message);
    }

    // ✅ NEW: Notify user's socket so CallScreen auto-disconnects
    try {
      const io = req.app.get('io');
      const userSockets = req.app.get('userSockets'); // map: userId → socketId
      const userSocketId = userSockets?.[session.userId?.toString()];
      if (io && userSocketId) {
        io.to(userSocketId).emit('call_ended', { sessionId });
        console.log(`✅ call_ended emitted → user socket ${userSocketId}`);
      } else {
        console.log(`ℹ️ User socket not found for userId: ${session.userId}`);
      }
    } catch (socketErr) {
      console.warn('Could not emit call_ended to user:', socketErr.message);
    }

    console.log(`✅ Call ended: ${sessionId} | ${durationSeconds}s | ₹${totalCost}`);
    return res.status(200).json({ message: 'Call ended', durationSeconds, totalCost, session: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── rejectCall ──────────────────────────────────────────────────────────────

const rejectCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    await CallSession.findByIdAndUpdate(sessionId, { status: 'missed' });
    return res.status(200).json({ message: 'Call rejected' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── getCallHistory (user side) ───────────────────────────────────────────────

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

// ─── getAstrologerCallHistory ─────────────────────────────────────────────────

const getAstrologerCallHistory = async (req, res) => {
  try {
    const { astrologerId } = req.params;
    const calls = await CallSession.find({ astrologerId })
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .limit(20);
    return res.status(200).json(calls);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── getTodayStats ────────────────────────────────────────────────────────────

const getTodayStats = async (req, res) => {
  try {
    const { astrologerId } = req.query;
    if (!astrologerId) {
      return res.status(400).json({ message: 'astrologerId required' });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sessions = await CallSession.find({
      astrologerId,
      status: 'ended',
      createdAt: { $gte: todayStart },
    });

    const todayEarnings = sessions.reduce((sum, s) => sum + (s.totalCost ?? 0), 0);
    const todaySeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
    const todayMinutes = Math.round(todaySeconds / 60);
    const todaySessions = sessions.length;

    return res.status(200).json({
      todayEarnings: parseFloat(todayEarnings.toFixed(2)),
      todayMinutes,
      todaySessions,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCallToken,
  startCall,
  endCall,
  rejectCall,
  getCallHistory,
  getAstrologerCallHistory,
  getTodayStats,
};
