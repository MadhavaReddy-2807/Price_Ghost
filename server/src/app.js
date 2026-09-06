import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { ENV } from './config/env.js';
import { connectDB, getSanitizedUri } from './config/db.js';
import { startPollerScheduler } from './services/poller.js';
import { createRateLimiter } from './middleware/rateLimiter.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import itemRoutes from './routes/items.js';
import dashboardRoutes from './routes/dashboard.js';
import pollerRoutes from './routes/poller.js';
import adminRoutes from './routes/admin.js';
import healthRoutes from './routes/health.js';
import { UserModel } from './models/User.js';
import { SystemSettingModel } from './models/SystemSetting.js';
import { startPollerScheduler, updatePollerConfig } from './services/poller.js';

const app = express();

// Configure CORS for Web Dashboard and Chrome Extension
const allowedOriginsList = [
  'https://price-ghost.netlify.app',
  ...(ENV.CLIENT_URL ? ENV.CLIENT_URL.split(',').map((u) => u.trim().replace(/\/+$/, '')) : []),
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, extension background service worker)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');

    // 1. Explicitly configured client URLs
    if (allowedOriginsList.includes(cleanOrigin)) {
      return callback(null, true);
    }

    // 2. Allow Netlify production and deploy preview domains (*.netlify.app)
    if (cleanOrigin.endsWith('.netlify.app')) {
      return callback(null, true);
    }

    // 3. Allow Render cloud domains (*.onrender.com)
    if (cleanOrigin.endsWith('.onrender.com')) {
      return callback(null, true);
    }

    // 4. Allow Chrome Extension environments
    if (cleanOrigin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }

    // 5. Allow localhost and 127.0.0.1 in development mode
    if (
      ENV.NODE_ENV === 'development' ||
      cleanOrigin.includes('localhost') ||
      cleanOrigin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    }

    // Safely reject origin without throwing a 500 error
    console.warn(`[CORS Blocked] Origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours preflight cache
};

app.use(cors(corsOptions));
// Handle preflight OPTIONS explicitly across all routes
app.options('*', cors(corsOptions));

app.use(express.json());

// Health & Upstream Monitor Endpoints
// (Mounted BEFORE rate limiters & database blocker so monitors are never throttled or blocked)
app.use('/api/health', healthRoutes);
app.use('/health', healthRoutes);
app.use('/healthz', healthRoutes);
app.get('/ping', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).json({ pong: true, timestamp: new Date().toISOString() });
});

// Apply sliding-window rate limiters
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many API requests from this IP. Please try again in a few minutes.',
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// Guard API endpoints when database is disconnected (prevents 10s buffering timeouts)
app.use('/api', (req, res, next) => {
  // Always let preflight OPTIONS through
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Database Unavailable',
      message: 'MongoDB connection is not established yet. Please verify MongoDB service or Atlas IP whitelist.',
    });
  }
  next();
});

// Mount API Routers
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/poller', pollerRoutes);
app.use('/api/admin', adminRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Uncaught Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: ENV.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred.',
  });
});

async function bootstrap() {
  console.log('[Server] Starting Price Ghost Backend...');
  connectDB()
    .then(async () => {
      // Ensure all admin emails have role 'admin' and hasAccess true
      if (ENV.ADMIN_EMAILS && ENV.ADMIN_EMAILS.length > 0) {
        for (const email of ENV.ADMIN_EMAILS) {
          await UserModel.updateMany(
            { email: email.toLowerCase() },
            { $set: { role: 'admin', hasAccess: true } }
          );
        }
      }

      // Restore persisted default poller settings if configured by admin
      try {
        const pollerSetting = await SystemSettingModel.findOne({ key: 'pollerConfig' });
        if (pollerSetting && pollerSetting.value) {
          updatePollerConfig({
            enabled: pollerSetting.value.autoPollEnabled,
            intervalMinutes: pollerSetting.value.intervalMinutes,
          });
          console.log(
            `[Poller Scheduler] Restored admin config: every ${pollerSetting.value.intervalMinutes}m, enabled=${pollerSetting.value.autoPollEnabled}`
          );
        }
      } catch (err) {
        console.warn('[Poller Config Restore Notice]', err.message);
      }
    })
    .catch((err) => console.error('[Database Startup Notice]', err.message));

  startPollerScheduler();

  app.listen(ENV.PORT, () => {
    console.log(`\n======================================================`);
    console.log(`👻 Price Ghost API Server running on port ${ENV.PORT}`);
    console.log(`📡 URL: http://localhost:${ENV.PORT}`);
    console.log(`🩺 Health: http://localhost:${ENV.PORT}/api/health`);
    console.log(`🩺 Upstream Monitor: http://localhost:${ENV.PORT}/api/health/upstream`);
    console.log(`======================================================\n`);
  });
}

bootstrap();

export default app;
