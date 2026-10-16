const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config');
const db = require('./database/db');
const seedDatabase = require('./database/seed');
const setupSocketHandler = require('./signaling/socketHandler');

const authRoutes = require('./routes/authRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const residentRoutes = require('./routes/residentRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const server = http.createServer(app);

// Socket.io initialization
const io = new Server(server, {
  cors: {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/visitor', visitorRoutes);
app.use('/api/resident', residentRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Setup signaling socket
setupSocketHandler(io);

async function start() {
  // Sincronizar com o banco Supabase se configurado
  await db.init();

  // Auto-seed if empty
  const orgs = db.find('organizations');
  if (orgs.length === 0) {
    console.log('[STARTUP] No organizations found. Running seed...');
    seedDatabase();
  }

  server.listen(config.PORT, '0.0.0.0', () => {
    console.log(`
  ======================================================
  🔔 INTERFONE DIGITAL - SERVIDOR BACKEND E WEBRTC
  ======================================================
  🚀 Servidor rodando na porta: ${config.PORT}
  🌐 Health Check: http://localhost:${config.PORT}/api/health
  🏢 Condomínio Demo: Residencial Jardim
  📱 QR Code Demo Token: qr-demo-jardim-principal
  🔑 Admin Demo: admin@interfone.com / admin123
  🔑 Moradores: morador.casa1..6@interfone.com / morador123
  ======================================================
    `);
  });
}

start();

module.exports = { app, server };
