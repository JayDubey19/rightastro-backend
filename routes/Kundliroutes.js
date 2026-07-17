const express = require('express');
const router = express.Router();
const { generateKundliHandler } = require('../controllers/kundliController');
const { protect, requireRole } = require('../middleware/auth');

// Sirf logged-in astrologer hi kundli generate kar sake — random log call
// karke kisi bhi user ka data na nikal paye.
router.post('/generate', protect, requireRole('astrologer'), generateKundliHandler);

module.exports = router;