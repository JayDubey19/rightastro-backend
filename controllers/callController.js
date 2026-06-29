/**
 * callController.js — FIXED
 * Bug: channelName 68 chars tha, Agora max 64 allow karta hai → error -102
 * Fix: short channel name — max 40 chars
 */

const { generateAgoraToken } = require('../utils/agoraTokenGenerator');
const CallSession = require('../models/CallSession');
const Astrologer = require('../models/Astrologer');
const User = require('../models/User');

/**
 * Short unique channel name — max 40 chars, Agora safe
 * Format: ch + last6(userId) + last6(astrologerId) + last8(timestamp)
 * Example: ch4ba031222ca273537914  → 22 chars ✅
 */
const makeChannelName = (userId, astrologerId) => {
  const ts = Date.now().toString().slice(-8);
  const u = userId.toString().slice(-6);
  const a = astrologerId.toString().slice(-6);
  return `ch${u}${a}${ts}`; // ~22 chars, always < 64 ✅
};

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
    if (!astrologer) return res.status(404).json({ message: 'Astrologer nahi mila' });
    if (!astrologer.isOnline) return res.status(400).json({ message: 'Astrologer abhi offline hai' });

    let callerName = 'User';
    try {
      const user = await User.findById(userId).select('name');
      if (user?.name) callerName = user.name;
    } catch {}

    // ✅ SHORT channel name — max ~22 chars
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
      return res.status(400).json({ message: 'Astrologer abhi available nahi hai' });
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

const startCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'active', startedAt: new Date() },
      { new: true },
    );
    if (!session) return res.status(404).json({ message: 'Session nahi mila' });
    console.log(`✅ Call active: ${sessionId}`);
    return res.status(200).json({ message: 'Call active', session });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const endCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await CallSession.findById(sessionId).populate('astrologerId');
    if (!session) return res.status(404).json({ message: 'Session nahi mila' });

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

    console.log(`✅ Call ended: ${sessionId} | ${durationSeconds}s | ₹${totalCost}`);
    return res.status(200).json({ message: 'Call ended', durationSeconds, totalCost, session: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const rejectCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    await CallSession.findByIdAndUpdate(sessionId, { status: 'missed' });
    return res.status(200).json({ message: 'Call rejected' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

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
