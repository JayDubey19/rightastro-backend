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
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);