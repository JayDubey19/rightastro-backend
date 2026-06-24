const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const astrologerRoutes = require('./routes/astrologerRoutes');
const callRoutes = require('./routes/callRoutes'); // ✅ VOIP routes

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/astrologers', astrologerRoutes);
app.use('/api/calls', callRoutes); // ✅ VOIP routes register

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Mongo Connected');

    app.listen(process.env.PORT || 5000, () => {
      console.log(`✅ Server Running on port ${process.env.PORT || 5000}`);
    });
  } catch (error) {
    console.error('❌ Mongo Connection Error');
    console.error(error);
  }
}

startServer();
