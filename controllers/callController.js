const { generateAgoraToken } = require('../utils/agoraTokenGenerator');
const CallSession = require('../models/CallSession');
const Astrologer = require('../models/Astrologer');

/**
 * POST /api/calls/token
 * User call karne se pehle token maangta hai
 * Body: { astrologerId, userId }
 */
const getCallToken = async (req, res) => {
  try {
    const { astrologerId, userId } = req.body;

    if (!astrologerId || !userId) {
      return res.status(400).json({
        message: 'astrologerId aur userId dono chahiye',
      });
    }

    // Astrologer online hai ya nahi check karo
    const astrologer = await Astrologer.findById(astrologerId);
    if (!astrologer) {
      return res.status(404).json({ message: 'Astrologer nahi mila' });
    }

    if (!astrologer.isOnline) {
      return res.status(400).json({ message: 'Astrologer abhi offline hai' });
    }

    // Unique channel name banao
    const channelName = `call_${userId}_${astrologerId}_${Date.now()}`;

    // Agora token generate karo
    const token = generateAgoraToken(channelName, 0, 'publisher');

    // DB mein call session save karo
    const session = await CallSession.create({
      channelName,
      userId,
      astrologerId,
      status: 'pending',
    });

    return res.status(200).json({
      token,
      channelName,
      appId: process.env.AGORA_APP_ID,
      sessionId: session._id,
    });
  } catch (error) {
    console.error('getCallToken Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/calls/start
 * Jab dono join ho jayein tab call active mark karo
 * Body: { sessionId }
 */
const startCall = async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'active', startedAt: new Date() },
      { new: true },
    );

    if (!session) {
      return res.status(404).json({ message: 'Session nahi mila' });
    }

    return res.status(200).json({ message: 'Call active', session });
  } catch (error) {
    console.error('startCall Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/calls/end
 * Call khatam hone pe duration aur cost calculate karo
 * Body: { sessionId }
 */
const endCall = async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = await CallSession.findById(sessionId).populate('astrologerId');

    if (!session) {
      return res.status(404).json({ message: 'Session nahi mila' });
    }

    if (session.status === 'ended') {
      return res.status(400).json({ message: 'Call pehle se end ho chuki hai' });
    }

    const endedAt = new Date();
    const startedAt = session.startedAt || endedAt;
    const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

    const pricePerMinute = session.astrologerId?.pricePerMinute || 0;
    const durationMinutes = durationSeconds / 60;
    const totalCost = parseFloat((durationMinutes * pricePerMinute).toFixed(2));

    const updatedSession = await CallSession.findByIdAndUpdate(
      sessionId,
      {
        status: 'ended',
        endedAt,
        durationSeconds,
        totalCost,
      },
      { new: true },
    );

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
 * GET /api/calls/history/:userId
 * User ki past calls
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
    console.error('getCallHistory Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { getCallToken, startCall, endCall, getCallHistory };
