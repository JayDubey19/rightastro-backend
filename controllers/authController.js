const User = require('../models/User');
const Astrologer = require('../models/Astrologer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MOBILE_REGEX = /^[6-9]\d{9}$/; // Indian 10-digit mobile
const PIN_REGEX = /^\d{6}$/; // 6-digit PIN

const MAX_PIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

// ✅ UPDATED — token now embeds `sv` (sessionVersion) so `protect` can
// detect stale tokens from a previous login. See auth.js for the check.
const signToken = (id, role, sv) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not set on server');
  }
  return jwt.sign({ id, role, sv }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// ✅ NEW — call this at the moment of a successful login. Bumps the
// account's sessionVersion by 1, saves it, and signs a token carrying
// that new value. Any token issued before this point now has a stale
// `sv` and will be rejected by `protect` — i.e. only the device that
// just logged in stays authenticated; all older sessions die instantly.
const issueSession = async (doc, role) => {
  doc.sessionVersion = (doc.sessionVersion || 0) + 1;
  await doc.save();
  return signToken(doc._id, role, doc.sessionVersion);
};

const isLocked = (doc) => doc.lockUntil && doc.lockUntil.getTime() > Date.now();

const registerFailedAttempt = async (doc) => {
  doc.failedPinAttempts = (doc.failedPinAttempts || 0) + 1;
  if (doc.failedPinAttempts >= MAX_PIN_ATTEMPTS) {
    doc.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
    doc.failedPinAttempts = 0;
  }
  await doc.save();
};

const resetAttempts = async (doc) => {
  if (doc.failedPinAttempts || doc.lockUntil) {
    doc.failedPinAttempts = 0;
    doc.lockUntil = null;
    await doc.save();
  }
};

// ─────────────────────────────────────────────────────────────────────────
// USER — mobile + PIN signup
// ─────────────────────────────────────────────────────────────────────────
exports.registerUser = async (req, res) => {
  try {
    const { name, mobile, pin, fcmToken } = req.body;

    if (!name || !mobile || !pin) {
      return res.status(400).json({ message: 'Name, mobile aur PIN zaroori hai' });
    }
    if (!MOBILE_REGEX.test(mobile)) {
      return res.status(400).json({ message: 'Valid 10-digit mobile number daalo' });
    }
    if (!PIN_REGEX.test(pin)) {
      return res.status(400).json({ message: 'PIN 6 digit ka hona chahiye' });
    }

    const exists = await User.findOne({ mobile });
    if (exists) {
      return res.status(400).json({ message: 'Is mobile number se account pehle se hai' });
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    const user = await User.create({
      name: name.trim(),
      mobile,
      pin: hashedPin,
      fcmToken: fcmToken || null,
    });

    // Brand-new account, nothing to invalidate — just sign at sv=0.
    const token = signToken(user._id, user.role, user.sessionVersion);

    res.status(201).json({
      token,
      role: user.role,
      userId: user._id.toString(),
      user: { _id: user._id, name: user.name, mobile: user.mobile, role: user.role },
    });
  } catch (error) {
    console.error('registerUser error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// USER — mobile + PIN login
// ─────────────────────────────────────────────────────────────────────────
exports.loginUser = async (req, res) => {
  try {
    const { mobile, pin, fcmToken } = req.body;

    if (!mobile || !pin) {
      return res.status(400).json({ message: 'Mobile aur PIN dono chahiye' });
    }

    const user = await User.findOne({ mobile: mobile.trim() });
    // Generic message on purpose — don't reveal whether the mobile exists.
    if (!user) return res.status(400).json({ message: 'Invalid mobile number or PIN' });

    if (isLocked(user)) {
      const minsLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return res
        .status(429)
        .json({ message: `Too many attempts. Try again in ${minsLeft} min(s).` });
    }

    const match = await bcrypt.compare(pin, user.pin);
    if (!match) {
      await registerFailedAttempt(user);
      return res.status(400).json({ message: 'Invalid mobile number or PIN' });
    }

    await resetAttempts(user);

    if (fcmToken) {
      user.fcmToken = fcmToken;
      await user.save();
    }

    // ✅ Bumps sessionVersion → any older token (other device) instantly
    // stops working next time it's used against `protect`.
    const token = await issueSession(user, user.role);

    res.json({
      token,
      role: user.role,
      userId: user._id.toString(),
      user: { _id: user._id, name: user.name, mobile: user.mobile, role: user.role },
    });
  } catch (error) {
    console.error('loginUser error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// ASTROLOGER — mobile + PIN login only (account is created by admin)
// ─────────────────────────────────────────────────────────────────────────
exports.loginAstrologer = async (req, res) => {
  try {
    const { mobile, pin, fcmToken } = req.body;

    if (!mobile || !pin) {
      return res.status(400).json({ message: 'Mobile aur PIN dono chahiye' });
    }

    const astrologer = await Astrologer.findOne({ mobile: mobile.trim() });
    if (!astrologer) return res.status(400).json({ message: 'Invalid mobile number or PIN' });

    if (isLocked(astrologer)) {
      const minsLeft = Math.ceil((astrologer.lockUntil.getTime() - Date.now()) / 60000);
      return res
        .status(429)
        .json({ message: `Too many attempts. Try again in ${minsLeft} min(s).` });
    }

    const match = await bcrypt.compare(pin, astrologer.pin);
    if (!match) {
      await registerFailedAttempt(astrologer);
      return res.status(400).json({ message: 'Invalid mobile number or PIN' });
    }

    await resetAttempts(astrologer);

    if (fcmToken) {
      astrologer.fcmToken = fcmToken;
      await astrologer.save();
    }

    // ✅ Bumps sessionVersion → kicks any other logged-in device for this
    // astrologer account.
    const token = await issueSession(astrologer, 'astrologer');

    res.json({
      token,
      role: 'astrologer',
      astrologerId: astrologer._id.toString(),
      astrologer: {
        _id: astrologer._id,
        name: astrologer.name,
        mobile: astrologer.mobile,
      },
    });
  } catch (error) {
    console.error('loginAstrologer error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// ADMIN ONLY — create an astrologer account (mobile + PIN set by admin)
// Protect this route with the `requireAdmin` middleware.
// ─────────────────────────────────────────────────────────────────────────
exports.adminCreateAstrologer = async (req, res) => {
  try {
    const { name, mobile, pin, ...rest } = req.body;

    if (!name || !mobile || !pin) {
      return res.status(400).json({ message: 'Name, mobile aur PIN zaroori hai' });
    }
    if (!MOBILE_REGEX.test(mobile)) {
      return res.status(400).json({ message: 'Valid 10-digit mobile number daalo' });
    }
    if (!PIN_REGEX.test(pin)) {
      return res.status(400).json({ message: 'PIN 6 digit ka hona chahiye' });
    }

    const exists = await Astrologer.findOne({ mobile });
    if (exists) {
      return res.status(400).json({ message: 'Is mobile number se astrologer pehle se hai' });
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    const astrologer = await Astrologer.create({
      ...rest,
      name: name.trim(),
      mobile,
      pin: hashedPin,
    });

    res.status(201).json({
      id: astrologer._id,
      name: astrologer.name,
      mobile: astrologer.mobile,
    });
  } catch (error) {
    console.error('adminCreateAstrologer error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// ACCOUNT MIGRATION (one-time)
// Old accounts (created before mobile+PIN existed) only have email+password
// and no `mobile` field yet. We can't silently invent a mobile number for
// them, so instead: they log in ONCE with their old email+password, then
// set a mobile+PIN which gets attached to that SAME document — so their
// _id, wallet, call history etc. are all preserved.
//
// Flow:
//   1. POST /auth/legacy-login        { email, password, role }
//        → if valid & mobile not yet set: returns { migrationRequired: true, migrationToken }
//        → if valid & mobile already set: tells them to just use mobile+PIN login
//   2. POST /auth/complete-migration  { migrationToken, mobile, pin }
//        → sets mobile+PIN on the existing doc, returns a normal full session token
// ─────────────────────────────────────────────────────────────────────────

const signMigrationToken = (id, role) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not set on server');
  // Short-lived and scoped — this token can ONLY be used to complete migration,
  // it is not a full session token.
  return jwt.sign({ id, role, purpose: 'migrate' }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

exports.legacyLoginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email aur password dono chahiye' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !user.password) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid Credentials' });

    if (user.mobile) {
      return res.status(400).json({
        message: 'This account already uses mobile + PIN login. Please log in with your mobile number.',
        migrationRequired: false,
      });
    }

    const migrationToken = signMigrationToken(user._id, 'user');
    res.json({ migrationRequired: true, migrationToken });
  } catch (error) {
    console.error('legacyLoginUser error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.legacyLoginAstrologer = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email aur password dono chahiye' });
    }

    const astrologer = await Astrologer.findOne({ email: email.trim().toLowerCase() });
    if (!astrologer || !astrologer.password) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const match = await bcrypt.compare(password, astrologer.password);
    if (!match) return res.status(400).json({ message: 'Invalid Credentials' });

    if (astrologer.mobile) {
      return res.status(400).json({
        message: 'This account already uses mobile + PIN login. Please log in with your mobile number.',
        migrationRequired: false,
      });
    }

    const migrationToken = signMigrationToken(astrologer._id, 'astrologer');
    res.json({ migrationRequired: true, migrationToken });
  } catch (error) {
    console.error('legacyLoginAstrologer error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.completeMigration = async (req, res) => {
  try {
    const { migrationToken, mobile, pin } = req.body;

    if (!migrationToken || !mobile || !pin) {
      return res.status(400).json({ message: 'migrationToken, mobile aur PIN zaroori hai' });
    }
    if (!MOBILE_REGEX.test(mobile)) {
      return res.status(400).json({ message: 'Valid 10-digit mobile number daalo' });
    }
    if (!PIN_REGEX.test(pin)) {
      return res.status(400).json({ message: 'PIN 6 digit ka hona chahiye' });
    }

    let decoded;
    try {
      decoded = jwt.verify(migrationToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: 'Migration session expired, please login again' });
    }
    if (decoded.purpose !== 'migrate') {
      return res.status(401).json({ message: 'Invalid migration token' });
    }

    const Model = decoded.role === 'astrologer' ? Astrologer : User;
    const doc = await Model.findById(decoded.id);
    if (!doc) return res.status(404).json({ message: 'Account not found' });

    if (doc.mobile) {
      return res.status(400).json({ message: 'Account already migrated. Please use mobile + PIN login.' });
    }

    const mobileTaken = await Model.findOne({ mobile, _id: { $ne: doc._id } });
    if (mobileTaken) {
      return res.status(400).json({ message: 'Is mobile number se already ek account hai' });
    }

    doc.mobile = mobile;
    doc.pin = await bcrypt.hash(pin, 10);
    // Old password no longer needed once migrated to PIN login.
    doc.password = undefined;

    // ✅ issueSession() below does doc.save() itself (it bumps
    // sessionVersion + saves), so we don't need a separate save() call
    // here — the mobile/pin/password changes above get persisted in
    // that same save.
    const token = await issueSession(doc, decoded.role);

    if (decoded.role === 'astrologer') {
      return res.json({
        token,
        role: 'astrologer',
        astrologerId: doc._id.toString(),
        astrologer: { _id: doc._id, name: doc.name, mobile: doc.mobile },
      });
    }

    res.json({
      token,
      role: doc.role,
      userId: doc._id.toString(),
      user: { _id: doc._id, name: doc.name, mobile: doc.mobile, role: doc.role },
    });
  } catch (error) {
    console.error('completeMigration error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Update FCM token for an already-logged-in user/astrologer.
// Call this whenever Firebase issues a new/refreshed token, not just at login.
// Protect this route with `protect` middleware — req.user comes from the JWT.
// ─────────────────────────────────────────────────────────────────────────
exports.updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ message: 'fcmToken required' });

    const Model = req.user.role === 'astrologer' ? Astrologer : User;
    await Model.findByIdAndUpdate(req.user.id, { fcmToken });

    res.json({ success: true });
  } catch (error) {
    console.error('updateFcmToken error:', error);
    res.status(500).json({ message: error.message });
  }
};