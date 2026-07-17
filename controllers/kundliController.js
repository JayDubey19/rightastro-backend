/**
 * controllers/kundliController.js
 *
 * POST /api/kundli/generate
 * Body: { name, dob, timeOfBirth, placeOfBirth }
 *
 * ⚠️ Kundli kahin DB me save NAHI hoti — sirf compute karke response me
 * bhej di jaati hai. Har baar astrologer icon tap karega to fresh compute
 * hoga (halka-fulka calculation hai, koi issue nahi).
 */

const { generateKundli } = require('../utils/kundliCalculator');

const generateKundliHandler = async (req, res) => {
  try {
    const { name, dob, timeOfBirth, placeOfBirth } = req.body;

    if (!dob || !placeOfBirth) {
      return res.status(400).json({ message: 'dob aur placeOfBirth required hain' });
    }

    const chart = await generateKundli({ name, dob, timeOfBirth, placeOfBirth });
    return res.status(200).json({ name: name || '', ...chart });
  } catch (error) {
    console.error('generateKundli Error:', error);
    return res.status(500).json({ message: error.message || 'Kundli generate nahi ho saki' });
  }
};

module.exports = { generateKundliHandler };