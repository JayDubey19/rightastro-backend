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

    profileImage: String,

    images: [String],

    rating: {
      type: Number,
      default: 0,
    },

    totalConsultations: {
      type: Number,
      default: 0,
    },

    followersCount: {
      type: Number,
      default: 0,
    },
backgroundImageUrl:[String],
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
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  'Astrologer',
  astrologerSchema
);