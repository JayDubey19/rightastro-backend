const User = require('../models/User');

const getMyBirthDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('birthDetails name');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({
      name: user.birthDetails?.name || user.name || '',
      dob: user.birthDetails?.dob || '',
      timeOfBirth: user.birthDetails?.timeOfBirth || '',
      placeOfBirth: user.birthDetails?.placeOfBirth || '',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateMyBirthDetails = async (req, res) => {
  try {
    const { name, dob, timeOfBirth, placeOfBirth } = req.body;
    if (!name || !dob || !placeOfBirth) {
      return res.status(400).json({ message: 'name, dob aur placeOfBirth required hain' });
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { birthDetails: { name, dob, timeOfBirth: timeOfBirth || '', placeOfBirth } },
      { new: true },
    ).select('birthDetails');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json(user.birthDetails);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { getMyBirthDetails, updateMyBirthDetails };