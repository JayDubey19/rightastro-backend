const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const astrologerRoutes = require('./routes/astrologerRoutes');
const callRoutes = require('./routes/callRoutes');

const app = express();
const server = http.createServer(app); // ✅ http server banao socket ke liye

// ✅ Socket.io setup
const io = new Server(server, {
  cors: { origin: '*' },
});

// Astrologer ka socketId store karo (memory mein — production mein Redis use karna)
// Format: { astrologerId: socketId }
const astrologerSockets = {};

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // Astrologer apna ID register karta hai jab dashboard khule
  socket.on('register_astrologer', (astrologerId) => {
    astrologerSockets[astrologerId] = socket.id;
    console.log(`✅ Astrologer ${astrologerId} registered with socket ${socket.id}`);
  });

  // Disconnect pe remove karo
  socket.on('disconnect', () => {
    for (const [astId, sockId] of Object.entries(astrologerSockets)) {
      if (sockId === socket.id) {
        delete astrologerSockets[astId];
        console.log(`❌ Astrologer ${astId} disconnected`);
        break;
      }
    }
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

// io aur astrologerSockets ko routes mein use karne ke liye
app.set('io', io);
app.set('astrologerSockets', astrologerSockets);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/astrologers', astrologerRoutes);
app.use('/api/calls', callRoutes);

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Mongo Connected');

    server.listen(process.env.PORT || 5000, () => {
      console.log(`✅ Server Running on port ${process.env.PORT || 5000}`);
    });
  } catch (error) {
    console.error('❌ Mongo Connection Error:', error);
  }
}

startServer();
