const express = require('express');
const router = express.Router();
const Astrologer = require('../models/Astrologer');

router.get('/', async (req, res) => {
  try {
    const astrologers = await Astrologer.find();

    res.json(astrologers);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

// ✅ NEW — dashboard ka toggleOnline() ye route call karta hai lekin ye
// pehle exist hi nahi karta tha (404 → silently caught in frontend).
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isOnline } = req.body;
    const astrologer = await Astrologer.findByIdAndUpdate(
      id,
      { isOnline: !!isOnline },
      { new: true },
    );
    if (!astrologer) return res.status(404).json({ message: 'Astrologer not found' });
    res.json(astrologer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;