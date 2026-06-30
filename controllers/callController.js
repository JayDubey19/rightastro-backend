/**
 * callController.js — FINAL
 *
 * Fix: endCall → emits 'call_ended' to user's socket so CallScreen auto-disconnects
 * Requires userSockets map in server.js (now added)
 */

const { generateAgoraToken } = require('../utils/agoraTokenGenerator');
const CallSession = require('../models/CallSession');
const Astrologer = require('../models/Astrologer');
const User = require('../models/User');

const makeChannelName = (userId, astrologerId) => {
  const ts = Date.now().toString().slice(-8);
  const u = userId.toString().slice(-6);
  const a = astrologerId.toString().slice(-6);
  return `ch${u}${a}${ts}`;
};

// ─── getCallToken ─────────────────────────────────────────────────────────────

const getCallToken = async (req, res) => {
  try {
    const { astrologerId, userId, durationMinutes = 10 } = req.body;

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

    let userToken, astrologerToken;
    try {
      userToken = generateAgoraToken(channelName, 0, 'publisher');
      astrologerToken = generateAgoraToken(channelName, 0, 'publisher');
    } catch (tokenErr) {
      return res.status(500).json({ message: `Token error: ${tokenErr.message}` });
    }

    const session = await CallSession.create({
      channelName,
      userId,
      astrologerId,
      durationMinutes: duration,
      status: 'pending',
    });

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

    return res.status(200).json({
      token: userToken,
      channelName,
      appId: process.env.AGORA_APP_ID,
      sessionId: session._id,  // ✅ returned so CallScreen can register for call_ended
      durationMinutes: duration,
    });
  } catch (error) {
    console.error('getCallToken Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

// ─── startCall ────────────────────────────────────────────────────────────────

const startCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'active', startedAt: new Date() },
      { new: true },
    );
    if (!session) return res.status(404).json({ message: 'Session not found' });
    return res.status(200).json({ message: 'Call active', session });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── endCall ──────────────────────────────────────────────────────────────────

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

    try {
      await Astrologer.findByIdAndUpdate(session.astrologerId._id, {
        $inc: { totalEarnings: totalCost, totalConsultations: 1 },
      });
    } catch (e) {
      console.warn('Could not update astrologer totals:', e.message);
    }

    // ✅ KEY FIX: emit call_ended to user so their screen auto-disconnects
    try {
      const io = req.app.get('io');
      const userSockets = req.app.get('userSockets');
      const userSocketId = userSockets?.[session.userId?.toString()];

      if (io && userSocketId) {
        io.to(userSocketId).emit('call_ended', {
          sessionId,
          durationSeconds,
          totalCost,
        });
        console.log(`✅ call_ended emitted → user socket ${userSocketId}`);
      } else {
        console.log(`⚠️ User socket not found for userId: ${session.userId} — Agora onUserOffline will handle it`);
      }
    } catch (socketErr) {
      console.warn('Socket emit failed:', socketErr.message);
    }

    console.log(`✅ Call ended: ${sessionId} | ${durationSeconds}s | ₹${totalCost}`);
    return res.status(200).json({ message: 'Call ended', durationSeconds, totalCost, session: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── rejectCall ───────────────────────────────────────────────────────────────

const rejectCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    await CallSession.findByIdAndUpdate(sessionId, { status: 'missed' });
    return res.status(200).json({ message: 'Call rejected' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── getCallHistory ───────────────────────────────────────────────────────────

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
    if (!astrologerId) return res.status(400).json({ message: 'astrologerId required' });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sessions = await CallSession.find({
      astrologerId,
      status: 'ended',
      createdAt: { $gte: todayStart },
    });

    const todayEarnings = sessions.reduce((sum, s) => sum + (s.totalCost ?? 0), 0);
    const todaySeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);

    return res.status(200).json({
      todayEarnings: parseFloat(todayEarnings.toFixed(2)),
      todayMinutes: Math.round(todaySeconds / 60),
      todaySessions: sessions.length,
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
