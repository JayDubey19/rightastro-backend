const express = require('express');
const router = express.Router();
const {
  getCallToken,
  startCall,
  endCall,
  rejectCall,
  getCallHistory,
} = require('../controllers/callController');

router.post('/token', getCallToken);
router.post('/start', startCall);
router.post('/end', endCall);
router.post('/reject', rejectCall);       // ✅ naya
router.get('/history/:userId', getCallHistory);

module.exports = router;
