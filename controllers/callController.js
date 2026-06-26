const { generateAgoraToken } = require('../utils/agoraTokenGenerator');
const CallSession = require('../models/CallSession');
const Astrologer = require('../models/Astrologer');

/**
 * POST /api/calls/token
 * User call karta hai — token generate karo + astrologer ko socket se notify karo
 * Body: { astrologerId, userId, durationMinutes (10/20/30) }
 */
const getCallToken = async (req, res) => {
  try {
    const { astrologerId, userId, durationMinutes = 10 } = req.body;

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

    // Unique channel name
    const channelName = `call_${userId}_${astrologerId}_${Date.now()}`;

    // Agora tokens — user aur astrologer dono ke liye
    const userToken = generateAgoraToken(channelName, 0, 'publisher');
    const astrologerToken = generateAgoraToken(channelName, 0, 'publisher');

    // DB mein save
    const session = await CallSession.create({
      channelName,
      userId,
      astrologerId,
      durationMinutes: duration,
      status: 'pending',
    });

    // ✅ Socket se astrologer ko incoming call notify karo
    const io = req.app.get('io');
    const astrologerSockets = req.app.get('astrologerSockets');
    const astrologerSocketId = astrologerSockets[astrologerId.toString()];

    if (astrologerSocketId) {
      io.to(astrologerSocketId).emit('incoming_call', {
        sessionId: session._id,
        channelName,
        astrologerToken,
        appId: process.env.AGORA_APP_ID,
        userId,
        durationMinutes: duration,
        callerName: 'User', // baad mein User model se naam la sakte ho
      });
      console.log(`📞 Incoming call sent to astrologer ${astrologerId}`);
    } else {
      console.log(`⚠️ Astrologer ${astrologerId} ka socket nahi mila — offline ho sakta hai`);
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

    const session = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'active', startedAt: new Date() },
      { new: true },
    );

    if (!session) return res.status(404).json({ message: 'Session nahi mila' });

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

    const session = await CallSession.findById(sessionId).populate('astrologerId');
    if (!session) return res.status(404).json({ message: 'Session nahi mila' });
    if (session.status === 'ended') {
      return res.status(400).json({ message: 'Call pehle se end ho chuki hai' });
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

    return res.status(200).json({ message: 'Call ended', durationSeconds, totalCost, session: updatedSession });
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

    const session = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'missed' },
      { new: true },
    );

    // ✅ User ko bhi notify karo ki astrologer ne reject kiya
    const io = req.app.get('io');
    // Future: user socket se bhi notify kar sakte ho

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
