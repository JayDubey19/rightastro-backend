const mongoose = require('mongoose');

/**
 * CallSession - har ek voice call ka record
 * status: pending → active → ended / missed
 */
const callSessionSchema = new mongoose.Schema(
  {
    channelName: {
      type: String,
      required: true,
      unique: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    astrologerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Astrologer',
      required: true,
    },

    status: {
      type: String,
      enum: ['pending', 'active', 'ended', 'missed'],
      default: 'pending',
    },

    // Call duration seconds mein (end hone pe update hoga)
    durationSeconds: {
      type: Number,
      default: 0,
    },

    // Kitna charge hua total
    totalCost: {
      type: Number,
      default: 0,
    },

    startedAt: {
      type: Date,
    },

    endedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('CallSession', callSessionSchema);
