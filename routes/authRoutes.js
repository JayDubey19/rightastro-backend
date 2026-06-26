const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  loginAstrologer, // ✅ naya
} = require('../controllers/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/astrologer-login', loginAstrologer); // ✅ naya route

module.exports = router;
