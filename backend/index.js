// backend/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { admin, db } = require('./firebaseAdmin');

const app = express();

/* ========= Config ========= */
const PORT = process.env.PORT || 3001;

// Orígenes permitidos
function parseAllowedOrigins() {
  const raw =
    process.env.ALLOWED_ORIGINS ||
    process.env.ALLOWED_ORIGIN ||
    'http://localhost:3000';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}
const allowedOrigins = parseAllowedOrigins();

// CORS
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origen no permitido: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400,
};

app.set('trust proxy', true);
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.options('*', cors(corsOptions));

/* ========= Rutas ========= */
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Admin routes (opcional, si existen)
try {
  const adminRoutes = require('./routes/admin');
  app.use('/api/admin', adminRoutes);
} catch {}

/* ========= Healthcheck ========= */
app.get('/api/health', async (_req, res) => {
  try {
    const snap = await db.collection('usuarios').limit(1).get();
    res.json({
      ok: true,
      foundUsuarios: snap.size,
      projectId: admin.app().options.projectId || 'unknown',
      allowedOrigins,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Root
app.get('/', (_req, res) => {
  res.send('Bienvenido a SistemaFinanzas API');
});

/* ========= 404 y errores ========= */
app.use((_req, res) => {
  res.status(404).json({ ok: false, message: 'Ruta no encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error('❌ Error:', err && err.stack ? err.stack : err);
  res.status(err.status || 500).json({
    ok: false,
    message: err.message || 'Error interno del servidor',
  });
});

/* ========= Server ========= */
const server = http.createServer({ maxHeaderSize: 65536 }, app);
server.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🌐 Orígenes permitidos: ${allowedOrigins.join(', ')}`);
});
