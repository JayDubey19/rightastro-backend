/**
 * debugRoutes.js
 * SIRF DEVELOPMENT MEIN USE KARO — production mein remove kar dena
 * 
 * Add to server.js:
 *   const debugRoutes = require('./routes/debugRoutes');
 *   app.use('/api/debug', debugRoutes);
 * 
 * Then browser mein kholo:
 *   https://rightastro-backend-production.up.railway.app/api/debug/agora
 */

const express = require('express');
const router = express.Router();

router.get('/agora', (req, res) => {
  const appId = process.env.AGORA_APP_ID;
  const appCert = process.env.AGORA_APP_CERTIFICATE;

  const status = {
    AGORA_APP_ID: appId
      ? `✅ SET (${appId.substring(0, 6)}...${appId.slice(-4)})`
      : '❌ MISSING',
    AGORA_APP_CERTIFICATE: appCert
      ? `✅ SET (${appCert.substring(0, 6)}...${appCert.slice(-4)})`
      : '❌ MISSING — Agora Console mein enable karo',
    tokenTestResult: null,
    error: null,
  };

  // Token generate karke test karo
  if (appId && appCert) {
    try {
      const { generateAgoraToken } = require('../utils/agoraTokenGenerator');
      const token = generateAgoraToken('test_channel_debug', 0, 'publisher');
      status.tokenTestResult = token
        ? `✅ Token generated successfully (${token.length} chars)`
        : '❌ Empty token — certificate invalid?';
    } catch (e) {
      status.tokenTestResult = '❌ FAILED';
      status.error = e.message;
    }
  } else {
    status.tokenTestResult = '⏭️ Skipped (env vars missing)';
  }

  res.json(status);
});

// Check connected astrologer sockets
router.get('/sockets', (req, res) => {
  const astrologerSockets = req.app.get('astrologerSockets') || {};
  res.json({
    connectedAstrologers: Object.keys(astrologerSockets).length,
    sockets: astrologerSockets,
  });
});

module.exports = router;
