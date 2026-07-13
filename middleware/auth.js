const jwt = require('jsonwebtoken');

/**
 * protect
 * Verifies the JWT Bearer token sent in the Authorization header.
 * Attaches { id, role } to req.user on success.
 * Use this on any route that requires a logged-in user/astrologer.
 */
exports.protect = (req, res, next) => {
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