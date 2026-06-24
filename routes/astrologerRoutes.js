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

module.exports = router;