const User = require('../models/User');
const Astrologer = require('../models/Astrologer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email aur password dono chahiye' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) return res.status(400).json({ message: 'Invalid Credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid Credentials' });

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'JWT_SECRET not set on server' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' },
    );

    res.json({
      token,
      role: user.role,
      userId: user._id.toString(), // ✅ always string
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('loginUser error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.loginAstrologer = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email aur password dono chahiye' });
    }

    const astrologer = await Astrologer.findOne({ email: email.trim().toLowerCase() });
    if (!astrologer) return res.status(400).json({ message: 'Invalid Credentials' });

    const match = await bcrypt.compare(password, astrologer.password);
    if (!match) return res.status(400).json({ message: 'Invalid Credentials' });

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'JWT_SECRET not set on server' });
    }

    const token = jwt.sign(
      { id: astrologer._id, role: 'astrologer' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' },
    );

    res.json({
      token,
      role: 'astrologer',
      astrologerId: astrologer._id.toString(), // ✅ always string
      astrologer: {
        _id: astrologer._id,
        name: astrologer.name,
        email: astrologer.email,
      },
    });
  } catch (error) {
    console.error('loginAstrologer error:', error);
    res.status(500).json({ message: error.message });
  }
};
