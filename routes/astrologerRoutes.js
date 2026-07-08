const express = require('express');
const router = express.Router();
const Astrologer = require('../models/Astrologer');

// ─── Helper: map raw Mongoose doc → clean API response shape ────────────────
// Frontend `Astrologer` type expects `imageUrl` (avatar) and
// `backgroundImageUrl` (card background) as separate string fields.
const formatAstrologer = (a) => ({
  id: a._id,
  name: a.name,
  imageUrl: a.profileImage,
  // Agar backgroundImageUrl set nahi hai to hi profileImage pe fallback karo
  backgroundImageUrl: a.backgroundImageUrl || a.profileImage,
  images: a.images || [],
  rating: a.rating,
  reviewCount: a.reviews?.length || 0,
  experienceYears: a.experience,
  languages: a.languages,
  pricePerMin: a.pricePerMinute,
  isOnline: a.isOnline,
  isMostChoice: a.isMostChoice || false,
  supportsCall: a.supportsCall ?? true,
  supportsChat: a.supportsChat ?? true,
  expertise: a.expertise || [],
  bio: a.bio,
  totalConsultations: a.totalConsultations || 0,
  followersCount: a.followersCount || 0,
  consultationStyle: a.consultationStyle,
  spiritualBackground: a.spiritualBackground,
  whyConsultMe: a.whyConsultMe || [],
  reviews: a.reviews || [],
});

// ─── GET all astrologers ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const astrologers = await Astrologer.find();
    res.json(astrologers.map(formatAstrologer));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── GET single astrologer ────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const astrologer = await Astrologer.findById(req.params.id);

    if (!astrologer) {
      return res.status(404).json({ message: 'Astrologer not found' });
    }

    res.json(formatAstrologer(astrologer));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── PATCH astrologer (online status + images) ────────────────────────────
// dashboard ka toggleOnline() ye route call karta hai.
// Ab profileImage aur backgroundImageUrl bhi update kiye ja sakte hain.
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isOnline, profileImage, backgroundImageUrl, images } = req.body;

    const updateData = {};
    if (isOnline !== undefined) updateData.isOnline = !!isOnline;
    if (profileImage !== undefined) updateData.profileImage = profileImage;
    if (backgroundImageUrl !== undefined) updateData.backgroundImageUrl = backgroundImageUrl;
    if (images !== undefined) updateData.images = images;

    const astrologer = await Astrologer.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!astrologer) {
      return res.status(404).json({ message: 'Astrologer not found' });
    }

    res.json(formatAstrologer(astrologer));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;