/**
 * callController.js — UPDATED (FCM incoming-call push added)
 *
 * NEW in this round:
 * - getCallToken now ALSO sends an FCM data push to the astrologer's
 *   fcmToken, in addition to the existing Socket.IO `incoming_call` emit.
 *   This is what makes the astrologer's phone ring even when their app is
 *   fully killed (Socket.IO can't reach a dead JS process; FCM can).
 * - If there's no live socket for the astrologer (app backgrounded/killed)
 *   we no longer hard-fail with 400 as long as we have a fcmToken to push
 *   to — we rely on the push to wake the app instead.
 * - endCall / rejectCall now also send a `call_cancelled` push so the
 *   native incoming-call UI on the astrologer's phone gets dismissed if
 *   the caller hangs up / it times out before being answered.
 *
 * Everything else (Agora token gen, channelName, birthDetails/topic
 * storage) is unchanged from before.
 */

const { generateAgoraToken } = require('../utils/agoraTokenGenerator');
const CallSession = require('../models/CallSession');
const Astrologer = require('../models/Astrologer');
const User = require('../models/User');
const { sendIncomingCallPush, sendCallCancelledPush } = require('../services/pushService');

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
    const {
      astrologerId,
      userId,
      durationMinutes = 10,
      birthDetails,
      consultationTopic,
    } = req.body;

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

    const io = req.app.get('io');
    const astrologerSockets = req.app.get('astrologerSockets') || {};
    const astrologerSocketId = astrologerSockets[astrologerId.toString()];
    const hasLiveSocket = !!astrologerSocketId;
    const hasFcmToken = !!astrologer.fcmToken;

    // ✅ CHANGED: previously this hard-required `astrologer.isOnline` AND a
    // live socket. Now: allow the call to go through if EITHER the socket
    // is live OR we have an fcmToken to push to (app may be killed but
    // still reachable via FCM). Only reject if we have neither.
    if (!astrologer.isOnline) {
      return res.status(400).json({ message: 'Astrologer is currently offline' });
    }
    if (!hasLiveSocket && !hasFcmToken) {
      await Astrologer.findByIdAndUpdate(astrologerId, { isOnline: false });
      return res.status(400).json({ message: 'Astrologer is not available right now' });
    }

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

    const safeBirthDetails = {
      name: birthDetails?.name || '',
      dob: birthDetails?.dob || '',
      timeOfBirth: birthDetails?.timeOfBirth || '',
      placeOfBirth: birthDetails?.placeOfBirth || '',
    };
    const safeTopic = typeof consultationTopic === 'string' ? consultationTopic : '';

    const session = await CallSession.create({
      channelName,
      userId,
      astrologerId,
      durationMinutes: duration,
      status: 'pending',
      birthDetails: safeBirthDetails,
      consultationTopic: safeTopic,
    });
    console.log(`✅ Session created: ${session._id}`);

    const incomingCallPayload = {
      sessionId: session._id,
      channelName,
      astrologerToken,
      appId: process.env.AGORA_APP_ID,
      userId,
      durationMinutes: duration,
      callerName,
      birthDetails: safeBirthDetails,
      consultationTopic: safeTopic,
    };

    // Fast path: astrologer app is open + socket alive → instant delivery.
    if (hasLiveSocket) {
      io.to(astrologerSocketId).emit('incoming_call', incomingCallPayload);
      console.log(`✅ incoming_call emitted → socket ${astrologerSocketId}`);
    }

    // Always ALSO send FCM — this is the path that rings the phone when
    // the app is backgrounded or fully killed. Fire-and-forget; we don't
    // want a slow/failed push to block the caller's response.
    sendIncomingCallPush(astrologer.fcmToken, incomingCallPayload).catch(() => {});

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

    try {
      const io = req.app.get('io');
      const astrologerSockets = req.app.get('astrologerSockets') || {};
      const userSockets = req.app.get('userSockets') || {};

      const astrologerSocketId = astrologerSockets[session.astrologerId._id.toString()];
      if (astrologerSocketId) {
        io.to(astrologerSocketId).emit('call_ended', { sessionId, durationSeconds, totalCost });
      }

      const userSocketId = userSockets[session.userId.toString()];
      if (userSocketId) {
        io.to(userSocketId).emit('call_ended', { sessionId, durationSeconds, totalCost });
      }
    } catch (e) {
      console.warn('Could not emit call_ended:', e.message);
    }

    // ✅ NEW: dismiss the native incoming-call UI if it was never answered
    // and one side ended it via /calls/end instead of the accept flow
    // (e.g. the session was force-ended while still ringing).
    sendCallCancelledPush(session.astrologerId?.fcmToken, sessionId).catch(() => {});

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
    const session = await CallSession.findByIdAndUpdate(
      sessionId,
      { status: 'missed' },
      { new: true },
    ).populate('astrologerId', 'fcmToken');

    // ✅ NEW — dismiss ringing UI on the astrologer's phone (covers the
    // case where the CALLER cancels before the astrologer answers, or the
    // 30s auto-decline countdown on IncomingCallScreen fires).
    if (session?.astrologerId?.fcmToken) {
      sendCallCancelledPush(session.astrologerId.fcmToken, sessionId).catch(() => {});
    }

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
      .populate('astrologerId', 'name pricePerMinute profileImage expertise')
      .sort({ createdAt: -1 })
      .limit(20);
    return res.status(200).json(calls);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── getAstrologerCallHistory ──────────────────────────────────────────────

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

// ─── getTodayStats ─────────────────────────────────────────────────────────

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