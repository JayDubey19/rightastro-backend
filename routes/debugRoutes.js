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
  const userSockets = req.app.get('userSockets') || {};
  res.json({
    connectedAstrologers: Object.keys(astrologerSockets).length,
    astrologerSockets,
    connectedUsers: Object.keys(userSockets).length,
    userSockets,
  });
});

// ✅ NEW — DB isOnline vs live socket cross-check
// Isse exactly wo mismatch dikhega jo "astrologer is not available" error deta hai
router.get('/online-status', async (req, res) => {
  try {
    const Astrologer = require('../models/Astrologer');
    const astrologerSockets = req.app.get('astrologerSockets') || {};
    const connectedIds = Object.keys(astrologerSockets);

    const dbOnline = await Astrologer.find({ isOnline: true }).select('_id name isOnline');

    const mismatched = dbOnline
      .filter((a) => !connectedIds.includes(a._id.toString()))
      .map((a) => ({ _id: a._id, name: a.name, issue: 'DB says online, NO live socket' }));

    res.json({
      liveSocketIds: connectedIds,
      dbOnlineAstrologers: dbOnline,
      mismatched, // ⚠️ ye array khali honi chahiye, agar khali nahi hai to yahi bug ka proof hai
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
