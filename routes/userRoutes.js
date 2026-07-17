const express = require('express');
const router = express.Router();
const { getMyBirthDetails, updateMyBirthDetails } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.get('/me/birth-details', protect, getMyBirthDetails);
router.put('/me/birth-details', protect, updateMyBirthDetails);

module.exports = router;