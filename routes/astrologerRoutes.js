const express = require('express');
const router = express.Router();
const Astrologer = require('../models/Astrologer');
const { protect, requireRole } = require('../middleware/auth');

const VALID_CATEGORIES = ['vedic', 'tarot', 'palmistry', 'vastu', 'numerology', 'kp'];

// ─── Helper: map raw Mongoose doc → clean API response shape ────────────────
// Frontend `Astrologer` type now expects `imageUrl` (avatar) + `category`
// (drives the card's gradient/pattern theme on the frontend).
//
// ⚠️ backgroundImageUrl is intentionally NOT included anymore — the
// category-based theme system replaced it. Even if some old documents
// still have that field sitting in Mongo, we simply never read/return it.
const formatAstrologer = (a) => ({
  id: a._id,
  name: a.name,
  imageUrl: a.profileImage,
  // Falls back to 'vedic' for any older document that predates the
  // category field, so the card always has a valid theme to render.
  category: a.category || 'vedic',
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

// ─── PATCH astrologer (online status + images + category) ─────────────────
// dashboard ka toggleOnline() ye route call karta hai.
// Ab profileImage, images, aur category bhi update kiye ja sakte hain.
//
// ⚠️ backgroundImageUrl update support REMOVED — category-based theme
// system replaced it. Agar purana client abhi bhi backgroundImageUrl
// bhejta hai, ye route usse silently ignore kar dega.
//
// ✅ SECURITY: sirf wahi astrologer apna khud ka profile update kar sakta
// hai (JWT se verify).
router.patch('/:id', protect, requireRole('astrologer'), async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id !== id) {
      return res.status(403).json({ message: 'Forbidden — you can only update your own profile' });
    }

    const { isOnline, profileImage, images, category } = req.body;

    const updateData = {};
    if (isOnline !== undefined) updateData.isOnline = !!isOnline;
    if (profileImage !== undefined) updateData.profileImage = profileImage;
    if (images !== undefined) updateData.images = images;
    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        });
      }
      updateData.category = category;
    }

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