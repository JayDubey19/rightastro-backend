const mongoose = require('mongoose');

const astrologerSchema = new mongoose.Schema(
  {
    name: String,

    // Legacy — admin can still record an email for contact/reference,
    // but it is NOT used for login anymore.
    email: {
      type: String,
      unique: true,
      sparse: true,
    },

    // ✅ Primary login identifier — account created by admin only
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // ✅ Hashed 6-digit PIN (bcrypt)
    pin: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: false, // legacy, unused
    },

    role: {
      type: String,
      default: 'astrologer',
    },

    skills: [String],
    experience: Number,
    pricePerMinute: Number,
    profileImage: String,
    images: [String],

    rating: { type: Number, default: 0 },
    totalConsultations: { type: Number, default: 0 },
    followersCount: { type: Number, default: 0 },

    // Drives the card/hero background theme on the frontend (gradient +
    // SVG pattern + pill colors — see theme/categoryTheme.tsx). Replaces
    // the old backgroundImageUrl field: the backend no longer stores or
    // serves a background image, only this category string.
    category: {
      type: String,
      enum: ['vedic', 'tarot', 'palmistry', 'vastu', 'numerology', 'kp'],
      default: 'vedic',
      required: true,
    },

    expertise: [String],
    languages: [String],
    bio: String,
    consultationStyle: String,
    spiritualBackground: String,
    whyConsultMe: [String],

    reviews: [
      {
        id: String,
        userName: String,
        userImageUrl: String,
        rating: Number,
        comment: String,
        date: String,
      },
    ],

    isOnline: {
      type: Boolean,
      default: false,
    },

    // ✅ For push notifications (incoming call alerts etc.)
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

    // ✅ NEW — single active session enforcement (see User.js for the
    // full explanation). Same mechanism applies to astrologer accounts.
    sessionVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Astrologer', astrologerSchema);