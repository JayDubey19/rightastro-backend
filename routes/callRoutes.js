const express = require('express');
const router = express.Router();
const {
  getCallToken,
  startCall,
  endCall,
  getCallHistory,
} = require('../controllers/callController');

// Agora token lo — call shuru karne se pehle
router.post('/token', getCallToken);

// Call active mark karo (dono join ho gaye)
router.post('/start', startCall);

// Call end karo + cost calculate karo
router.post('/end', endCall);

// User ki call history
router.get('/history/:userId', getCallHistory);

module.exports = router;
