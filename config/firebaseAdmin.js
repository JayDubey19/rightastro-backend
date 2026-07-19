/**
 * firebaseAdmin.js
 *
 * Initializes firebase-admin ONCE so we can send FCM data pushes from the
 * backend (needed for incoming-call ringing even when the astrologer's app
 * is killed — Socket.IO alone can't reach a dead JS process, FCM can).
 *
 * SETUP (one-time):
 * 1. Firebase Console → Project Settings → Service Accounts →
 *    "Generate new private key" → downloads a serviceAccount.json
 * 2. Base64-encode it so it fits safely in a single .env line:
 *      base64 -w 0 serviceAccount.json > sa.b64      (Linux)
 *      base64 -i serviceAccount.json -o sa.b64        (Mac)
 * 3. Copy the contents of sa.b64 into your .env as:
 *      FIREBASE_SERVICE_ACCOUNT_BASE64=<paste here, no quotes needed>
 * 4. npm install firebase-admin --save
 *
 * Never commit serviceAccount.json or the .env value to git.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
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

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ firebase-admin initialized');
    } catch (e) {
      console.error('❌ firebase-admin init failed — check FIREBASE_SERVICE_ACCOUNT_BASE64:', e.message);
    }
  }
}

module.exports = admin;