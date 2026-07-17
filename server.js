const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const astrologerRoutes = require('./routes/astrologerRoutes');
const callRoutes = require('./routes/callRoutes');
const debugRoutes = require('./routes/debugRoutes');
const Astrologer = require('./models/Astrologer'); // ✅ NEW — isOnline sync ke liye
const userRoutes = require('./routes/userRoutes');
const kundliRoutes = require('./routes/kundliRoutes'); // ✅ NEW — free kundli generator


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// astrologerId → socketId
const astrologerSockets = {};
// userId → socketId
const userSockets = {};

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('register_astrologer', async (astrologerId) => {
    if (!astrologerId) return;
    astrologerSockets[astrologerId.toString()] = socket.id;
    socket.astrologerId = astrologerId.toString(); // ✅ disconnect cleanup ke liye store
    console.log(`✅ Astrologer ${astrologerId} → socket ${socket.id}`);

    // ✅ FIX: socket register hote hi DB me bhi isOnline = true karo
    try {
      await Astrologer.findByIdAndUpdate(astrologerId, { isOnline: true });
    } catch (e) {
      console.error('❌ isOnline=true update failed:', e.message);
    }
  });

  socket.on('register_user', (userId) => {
    if (!userId) return;
    userSockets[userId.toString()] = socket.id;
    socket.userId = userId.toString(); // ✅ disconnect cleanup ke liye store
    console.log(`✅ User ${userId} → socket ${socket.id}`);
  });

  socket.on('disconnect', async () => {
    // Astrologer cleanup
    // ✅ FIX: sirf tab hi map/DB clear karo jab ye disconnecting socket hi
    // abhi bhi is astrologerId ke liye "current" registered socket ho.
    // Warna race condition: purane socket ka delayed disconnect event
    // naye (already-reconnected) socket ki registration ko wipe kar deta tha.
    if (socket.astrologerId) {
      if (astrologerSockets[socket.astrologerId] === socket.id) {
        delete astrologerSockets[socket.astrologerId];
        console.log(`❌ Astrologer ${socket.astrologerId} disconnected`);

        try {
          await Astrologer.findByIdAndUpdate(socket.astrologerId, { isOnline: false });
        } catch (e) {
          console.error('❌ isOnline=false update failed:', e.message);
        }
      } else {
        console.log(`⏭️ Stale disconnect ignored for astrologer ${socket.astrologerId} (already replaced by newer socket)`);
      }
    }

    // User cleanup
    // Same guard for users, same race condition possible
    if (socket.userId) {
      if (userSockets[socket.userId] === socket.id) {
        delete userSockets[socket.userId];
        console.log(`❌ User ${socket.userId} disconnected`);
      }
    }
  });
});

app.set('io', io);
app.set('astrologerSockets', astrologerSockets);
app.set('userSockets', userSockets);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/astrologers', astrologerRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/users', userRoutes);
app.use('/api/kundli', kundliRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Mongo Connected');

    console.log('─── ENV CHECK ───────────────────────────────');
    console.log(`AGORA_APP_ID:          ${process.env.AGORA_APP_ID ? '✅ SET' : '❌ MISSING'}`);
    console.log(`AGORA_APP_CERTIFICATE: ${process.env.AGORA_APP_CERTIFICATE ? '✅ SET' : '❌ MISSING'}`);
    console.log(`JWT_SECRET:            ${process.env.JWT_SECRET ? '✅ SET' : '❌ MISSING'}`);
    console.log('─────────────────────────────────────────────');

    // ✅ OPTIONAL SAFETY NET: server restart hote hi purani "stuck online" states clear kar do
    // (kyunki restart pe astrologerSockets khali ho jata hai, but DB me isOnline true reh sakta hai)
    await Astrologer.updateMany({}, { isOnline: false });
    console.log('✅ Reset all astrologers to offline on startup');

    server.listen(process.env.PORT || 5000, () => {
      console.log(`✅ Server on port ${process.env.PORT || 5000}`);
    });
  } catch (err) {
    console.error('❌ Startup error:', err);
    process.exit(1);
  }
}

startServer();
