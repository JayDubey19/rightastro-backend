/**
 * agoraTokenGenerator.js
 * 
 * IMPORTANT: Railway pe yeh env variables set karo:
 *   AGORA_APP_ID      = your Agora App ID
 *   AGORA_APP_CERTIFICATE = your Agora App Certificate
 * 
 * App Certificate kaise milta hai:
 *   Agora Console → Project → Edit → App Certificate → Enable → Copy
 * 
 * Agar App Certificate enable nahi hai toh token empty string return hoga
 * aur Agora channel join nahi karega!
 */

const { RtcTokenBuilder, RtcRole } = require('agora-token');

const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Agora RTC token generate karo
 * @param {string} channelName
 * @param {number} uid - 0 means any uid allowed
 * @param {'publisher'|'subscriber'} role
 * @returns {string} token
 */
const generateAgoraToken = (channelName, uid = 0, role = 'publisher') => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  // ─── Validation ─────────────────────────────────────────────────────────────
  if (!appId) {
    console.error('❌ AGORA_APP_ID env variable missing!');
    throw new Error('AGORA_APP_ID not configured on server');
  }

  if (!appCertificate) {
    console.error('❌ AGORA_APP_CERTIFICATE env variable missing!');
    throw new Error('AGORA_APP_CERTIFICATE not configured — Agora Console mein enable karo');
  }

  if (!channelName) {
    throw new Error('channelName required for token generation');
  }

  // ─── Token Generate ─────────────────────────────────────────────────────────
  const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + TOKEN_EXPIRY_SECONDS;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    agoraRole,
    privilegeExpiredTs,
    privilegeExpiredTs,
  );

  if (!token) {
    console.error('❌ Token generation returned empty — App Certificate check karo');
    throw new Error('Token generation failed — empty token returned');
  }

  console.log(`✅ Agora token generated for channel: ${channelName} (expires in ${TOKEN_EXPIRY_SECONDS}s)`);
  return token;
};

module.exports = { generateAgoraToken };
