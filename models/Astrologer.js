const mongoose = require('mongoose');

const astrologerSchema = new mongoose.Schema(
  {
    name: String,

    email: {
      type: String,
      unique: true,
    },

    password: String,

    role: {
      type: String,
      default: 'astrologer',
    },

    skills: [String],

    experience: Number,

    pricePerMinute: Number,

    isOnline: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  'Astrologer',
  astrologerSchema
);