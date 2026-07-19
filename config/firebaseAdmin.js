/**
 * firebaseAdmin.js
 *
 * UPDATED for firebase-admin v12+ (you have v14.2.0) — this version
 * REMOVED the old namespaced API (admin.apps, admin.credential.cert(),
 * admin.messaging()). It now only exposes flat modular functions via
 * subpath imports: 'firebase-admin/app', 'firebase-admin/messaging', etc.
 * That's why the old code crashed with "Cannot read properties of
 * undefined (reading 'length')" -- admin.apps was undefined.
 *
 * SETUP (one-time) -- same as before:
 * 1. Firebase Console -> Project Settings -> Service Accounts ->
 *    "Generate new private key" -> downloads a serviceAccount.json
 * 2. Base64-encode it:
 *      base64 -w 0 serviceAccount.json
 * 3. .env:
 *      FIREBASE_SERVICE_ACCOUNT_BASE64=<paste here>
 */

const { initializeApp, getApps, cert } = require('firebase-admin/app');

let firebaseReady = false;

if (!getApps().length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    console.warn(
      '⚠️ FIREBASE_SERVICE_ACCOUNT_BASE64 not set — incoming-call FCM push will NOT work. ' +
      'Socket.IO-only calling will still work when the astrologer app is open.',
    );
  } else {
    try {
      const json = Buffer.from(
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
        'base64',
      ).toString('utf-8');
      const serviceAccount = JSON.parse(json);

      initializeApp({
        credential: cert(serviceAccount),
      });
      firebaseReady = true;
      console.log('✅ firebase-admin initialized');
    } catch (e) {
      console.error('❌ firebase-admin init failed — check FIREBASE_SERVICE_ACCOUNT_BASE64:', e.message);
    }
  }
} else {
  firebaseReady = true;
}

module.exports = { isFirebaseReady: () => firebaseReady || getApps().length > 0 };