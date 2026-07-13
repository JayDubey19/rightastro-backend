const rateLimit = require('express-rate-limit');

// 15 requests per 15 minutes per IP on login/PIN endpoints.
// This is IP-based and works alongside the per-account lockout already in
// authController.js (failedPinAttempts/lockUntil) — that one stops someone
// hammering ONE account, this one stops someone hammering the endpoint
// itself from one IP across many accounts.
exports.loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts from this device. Please try again later.' },
});