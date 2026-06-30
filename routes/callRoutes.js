/**
 * callRoutes.js — UPDATED
 * Added routes for:
 *   GET /api/calls/stats/today?astrologerId=xxx  → getTodayStats
 *   GET /api/calls/astrologer/:astrologerId      → getAstrologerCallHistory
 *
 * Add this file to replace your existing routes/callRoutes.js
 * Make sure callController exports the new functions.
 */

const express = require('express');
const router = express.Router();
const {
  getCallToken,
  startCall,
  endCall,
  rejectCall,
  getCallHistory,
  getAstrologerCallHistory,
  getTodayStats,
} = require('../controllers/callController');

// Existing
router.post('/token', getCallToken);
router.post('/start', startCall);
router.post('/end', endCall);
router.post('/reject', rejectCall);
router.get('/history/:userId', getCallHistory);

// New — dashboard data
router.get('/stats/today', getTodayStats);                        // ?astrologerId=xxx
router.get('/astrologer/:astrologerId', getAstrologerCallHistory); // last 20 calls

module.exports = router;
