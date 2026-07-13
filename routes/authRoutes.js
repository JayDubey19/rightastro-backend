const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  loginAstrologer,
  adminCreateAstrologer,
  updateFcmToken,
  legacyLoginUser,
  legacyLoginAstrologer,
  completeMigration,
} = require('../controllers/authController');
const { protect, requireAdmin } = require('../middleware/auth');
const { loginRateLimiter } = require('../middleware/rateLimiter');

// User — mobile + PIN
router.post('/register', loginRateLimiter, registerUser);
router.post('/login', loginRateLimiter, loginUser);

// Astrologer — mobile + PIN login only (no self-signup)
router.post('/astrologer-login', loginRateLimiter, loginAstrologer);

// One-time migration for old email+password accounts → mobile+PIN
// (keeps the same account _id, so wallet/history is preserved)
router.post('/legacy-login', loginRateLimiter, legacyLoginUser);
router.post('/astrologer-legacy-login', loginRateLimiter, legacyLoginAstrologer);
router.post('/complete-migration', loginRateLimiter, completeMigration);

// Admin only — create astrologer account (mobile + PIN set by admin)
// Send header: x-admin-secret: <ADMIN_SECRET from env>
router.post('/admin/create-astrologer', requireAdmin, adminCreateAstrologer);

// Logged-in user/astrologer — update FCM token (e.g. on refresh)
router.post('/fcm-token', protect, updateFcmToken);

module.exports = router;