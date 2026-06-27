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
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// astrologerId → socketId mapping
const astrologerSockets = {};

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('register_astrologer', (astrologerId) => {
    if (!astrologerId) return;
    astrologerSockets[astrologerId.toString()] = socket.id;
    console.log(`✅ Astrologer ${astrologerId} → socket ${socket.id}`);
  });

  socket.on('disconnect', () => {
    for (const [id, sid] of Object.entries(astrologerSockets)) {
      if (sid === socket.id) {
        delete astrologerSockets[id];
        console.log(`❌ Astrologer ${id} disconnected`);
        break;
      }
    }
  });
});

app.set('io', io);
app.set('astrologerSockets', astrologerSockets);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/astrologers', astrologerRoutes);
app.use('/api/calls', callRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Mongo Connected');
    server.listen(process.env.PORT || 5000, () => {
      console.log(`✅ Server on port ${process.env.PORT || 5000}`);
    });
  } catch (err) {
    console.error('❌ Startup error:', err);
    process.exit(1);
  }
}

startServer();
