const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Astrologer = require('../models/Astrologer');

/**
 * protect
 * Verifies the JWT Bearer token sent in the Authorization header.
 * Attaches { id, role } to req.user on success.
 * Use this on any route that requires a logged-in user/astrologer.
 *
 * ✅ UPDATED — single active session enforcement.
 * The token now carries `sv` (sessionVersion) as of when it was issued.
 * We fetch the current sessionVersion from the DB and compare. If they
 * don't match, a newer login has happened elsewhere (or the account was
 * force-logged-out), so this token is treated as stale/invalid — even
 * though it hasn't technically expired yet.
 *
 * NOTE: this adds one DB read to every protected request (previously
 * `protect` was a pure in-memory JWT verify with no DB hit). This is a
 * deliberate, normal trade-off for enforcing single-session login.
 */
exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({ message: 'Not authorized, token missing' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'JWT_SECRET not set on server' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Migration tokens (purpose: 'migrate') are short-lived and scoped to
    // /auth/complete-migration only — they should never pass through here.
    if (decoded.purpose === 'migrate') {
      return res.status(401).json({ message: 'Not authorized, invalid token' });
    }

    const Model = decoded.role === 'astrologer' ? Astrologer : User;
    const doc = await Model.findById(decoded.id).select('sessionVersion');

    if (!doc) {
      return res.status(401).json({ message: 'Not authorized, account not found' });
    }

    // `decoded.sv` may be undefined on tokens issued before this change
    // rolled out — treat that as version 0 so old-but-still-valid tokens
    // aren't force-logged-out the moment this deploy goes live.
    const tokenSv = decoded.sv ?? 0;
    if (tokenSv !== (doc.sessionVersion ?? 0)) {
      return res
        .status(401)
        .json({ message: 'Session expired — logged in from another device', sessionExpired: true });
    }

    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, invalid or expired token' });
  }
};

/**
 * requireRole
 * Use after `protect` to restrict a route to a specific role,
 * e.g. requireRole('astrologer') or requireRole('user').
 */
exports.requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};

/**
 * requireAdmin
 * Simple shared-secret guard for admin-only routes (e.g. creating
 * astrologer accounts). Set ADMIN_SECRET in your env vars and send it
 * as header: x-admin-secret: <value>
 *
 * NOTE: this is a minimal guard, good enough for a small internal admin
 * panel / script. If you build a real admin dashboard later, replace this
 * with proper admin-user auth.
 */
exports.requireAdmin = (req, res, next) => {
  const secret = req.headers['x-admin-secret'];

  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ message: 'ADMIN_SECRET not set on server' });
  }

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ message: 'Forbidden — invalid admin secret' });
  }

  next();
};