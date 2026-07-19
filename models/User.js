const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    // ✅ Primary login identifier now
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // ✅ Hashed 6-digit PIN (bcrypt) — never store plain text
    pin: {
      type: String,
      required: true,
    },

    // Legacy fields — kept optional so old email/password accounts
    // don't break anything else that may still reference them.
    email: {
      type: String,
      unique: true,
      sparse: true, // allows many docs with no email
    },
    password: {
      type: String,
      required: false,
    },

    birthDetails: {
  name: { type: String, default: '' },
  dob: { type: String, default: '' },
  timeOfBirth: { type: String, default: '' },
  placeOfBirth: { type: String, default: '' },
},

    role: {
      type: String,
      default: 'user',
    },

    wallet: {
      type: Number,
      default: 0,
    },

    // ✅ For push notifications
    fcmToken: {
      type: String,
      default: null,
    },

    // ✅ Brute-force protection on PIN login
    failedPinAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },

    // ✅ NEW — single active session enforcement.
    // Bumped by +1 every time this account logs in successfully.
    // The JWT issued at login embeds this exact value as `sv`. The
    // `protect` middleware compares token.sv against this DB value on
    // every request — a mismatch means a newer login has happened
    // elsewhere since this token was issued, so the token is rejected.
    // This is what makes "only the latest device stays logged in" work.
    sessionVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);