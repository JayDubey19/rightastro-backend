const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Astrologer = require("./models/Astrologer");
require("dotenv").config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const hash = await bcrypt.hash("123456", 10);

  await Astrologer.create({
    name: "Pandit Rahul",
    email: "rahul@gmail.com",
    password: hash,
    role: "astrologer",
    skills: ["Vedic", "Tarot"],
    experience: 5,
    pricePerMinute: 20,
    isOnline: false,
  });

  console.log("Astrologer Added");
  process.exit();
}

run();