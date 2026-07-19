/**
 * pushService.js
 *
 * UPDATED for firebase-admin v14's modular API — messaging is now its own
 * subpath import (`firebase-admin/messaging`) instead of `admin.messaging()`.
 *
 * Sends DATA-ONLY (no `notification` block) high-priority FCM messages to
 * the astrologer's device. Data-only is intentional:
 *  - It lets our own `setBackgroundMessageHandler` in the RN app run even
 *    when the app is killed, so WE decide how to ring (CallKeep native UI)
 *    instead of a generic Android notification banner.
 *  - A `notification` block would show Android's default tray notification
 *    AND our custom one — double notification / no ringtone control.
 */

const { isFirebaseReady } = require('../config/firebaseAdmin');
const { getMessaging } = require('firebase-admin/messaging');

/**
 * Fired when a new call is created (getCallToken) — this is what makes the
 * astrologer's phone ring even if the app is killed.
 */
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
        priority: 'high', // wakes the device / delivers even in Doze
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
    console.error('❌ FCM incoming_call push failed:', e.message);
    return false;
  }
};

/**
 * Fired when a call is ended/rejected/timed-out BEFORE the astrologer
 * answered — tells the native CallKeep UI on the astrologer's phone to
 * stop ringing / dismiss, since the caller already hung up or it expired.
 */
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
    console.error('❌ FCM call_cancelled push failed:', e.message);
    return false;
  }
};

module.exports = { sendIncomingCallPush, sendCallCancelledPush };