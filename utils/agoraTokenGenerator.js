const { RtcTokenBuilder, RtcRole } = require('agora-token');

/**
 * Agora RTC Token generate karta hai
 * @param {string} channelName - unique call channel name
 * @param {string|number} uid - user ID (0 = any)
 * @param {string} role - 'publisher' ya 'subscriber'
 */
const generateAgoraToken = (channelName, uid = 0, role = 'publisher') => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    throw new Error('AGORA_APP_ID aur AGORA_APP_CERTIFICATE .env mein set karo');
  }

  const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  // Token 1 ghante ke liye valid rahega
  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    rtcRole,
    privilegeExpiredTs,
  );

  return token;
};

module.exports = { generateAgoraToken };
