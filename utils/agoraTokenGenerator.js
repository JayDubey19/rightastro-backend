const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

const generateAgoraToken = (channelName, uid = 0, role = 'publisher') => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    throw new Error('AGORA_APP_ID aur AGORA_APP_CERTIFICATE .env mein set karo');
  }

  const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const expirationTimeInSeconds = 3600;
  const privilegeExpiredTs = Math.floor(Date.now() / 1000) + expirationTimeInSeconds;

  return RtcTokenBuilder.buildTokenWithUid(
    appId, appCertificate, channelName, uid, rtcRole, privilegeExpiredTs,
  );
};

module.exports = { generateAgoraToken };
