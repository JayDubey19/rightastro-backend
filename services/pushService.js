const { isFirebaseReady } = require('../config/firebaseAdmin');
const { getMessaging } = require('firebase-admin/messaging');
const Astrologer = require('../models/Astrologer'); // ✅ NEW

// ✅ NEW — FCM error codes meaning the token is permanently dead
// (uninstalled app, or replaced by a newer token). Clearing it stops
// getCallToken from retrying a dead token forever and lets it correctly
// fall back to the "no fcmToken" path.
const DEAD_TOKEN_ERRORS = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
];

const clearStaleToken = async (fcmToken) => {
  try {
    await Astrologer.updateMany({ fcmToken }, { fcmToken: null });
    console.log('🧹 Cleared stale fcmToken from DB');
  } catch (e) {
    console.warn('Could not clear stale fcmToken:', e.message);
  }
};

const sendIncomingCallPush = async (fcmToken, payload) => {
  if (!fcmToken) {
    console.log('⏭️ No fcmToken on astrologer — skipping incoming-call push');
    return false;
  }
  if (!isFirebaseReady()) {
    console.log('⏭️ firebase-admin not initialized — skipping incoming-call push');
    return false;
  }

  try {
    await getMessaging().send({
      token: fcmToken,
      android: {
        priority: 'high',
      },
      data: {
        type: 'incoming_call',
        sessionId: String(payload.sessionId),
        channelName: String(payload.channelName || ''),
        astrologerToken: String(payload.astrologerToken || ''),
        appId: String(payload.appId || ''),
        userId: String(payload.userId || ''),
        durationMinutes: String(payload.durationMinutes ?? 10),
        callerName: String(payload.callerName || 'Client'),
        birthDetails: JSON.stringify(payload.birthDetails || {}),
        consultationTopic: String(payload.consultationTopic || ''),
      },
    });
    console.log('✅ FCM incoming_call push sent to astrologer');
    return true;
  } catch (e) {
    console.error('❌ FCM incoming_call push failed:', e.code || e.message);
    if (DEAD_TOKEN_ERRORS.includes(e.code)) {
      await clearStaleToken(fcmToken); // ✅ NEW
    }
    return false;
  }
};

const sendCallCancelledPush = async (fcmToken, sessionId) => {
  if (!fcmToken || !isFirebaseReady()) return false;

  try {
    await getMessaging().send({
      token: fcmToken,
      android: { priority: 'high' },
      data: {
        type: 'call_cancelled',
        sessionId: String(sessionId),
      },
    });
    console.log('✅ FCM call_cancelled push sent');
    return true;
  } catch (e) {
    console.error('❌ FCM call_cancelled push failed:', e.code || e.message);
    if (DEAD_TOKEN_ERRORS.includes(e.code)) {
      await clearStaleToken(fcmToken); // ✅ NEW
    }
    return false;
  }
};

module.exports = { sendIncomingCallPush, sendCallCancelledPush };