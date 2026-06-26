const User = require('../models/User');
const Astrologer = require('../models/Astrologer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── User Register ───────────────────────────────────────────────────────────
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword });

    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── User Login ──────────────────────────────────────────────────────────────
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid Credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid Credentials' });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' },
    );

    res.json({
      token,
      role: user.role,
      userId: user._id, // ✅ frontend AsyncStorage ke liye
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Astrologer Login ────────────────────────────────────────────────────────
exports.loginAstrologer = async (req, res) => {
  try {
    const { email, password } = req.body;

    const astrologer = await Astrologer.findOne({ email });
    if (!astrologer) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const match = await bcrypt.compare(password, astrologer.password);
    if (!match) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const token = jwt.sign(
      { id: astrologer._id, role: 'astrologer' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' },
    );

    res.json({
      token,
      role: 'astrologer',
      astrologerId: astrologer._id, // ✅ frontend AsyncStorage ke liye
      astrologer,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
