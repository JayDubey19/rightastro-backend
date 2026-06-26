const mongoose = require('mongoose');

const callSessionSchema = new mongoose.Schema(
  {
    channelName: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Astrologer', required: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'ended', 'missed'],
      default: 'pending',
    },
    durationMinutes: { type: Number, default: 10 }, // ✅ user ne select kiya 10/20/30
    durationSeconds: { type: Number, default: 0 },  // actual duration
    totalCost: { type: Number, default: 0 },
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = mongoose.model('CallSession', callSessionSchema);
