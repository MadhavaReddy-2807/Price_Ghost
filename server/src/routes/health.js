import { Router } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { ENV } from '../config/env.js';
import { connectDB, getSanitizedUri } from '../config/db.js';
import { getPollerStatus } from '../services/poller.js';
import { checkEmailStatus } from '../services/emailService.js';

const router = Router();

// In-memory cache for upstream external target checks to prevent overloading external sites
let cachedTargetsHealth = null;
let lastTargetsCheckTime = 0;
const TARGETS_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

// Target e-commerce platforms monitored upstream
const UPSTREAM_TARGETS = [
  { platform: 'amazon', name: 'Amazon India', url: 'https://www.amazon.in' },
  { platform: 'flipkart', name: 'Flipkart', url: 'https://www.flipkart.com' },
  { platform: 'myntra', name: 'Myntra', url: 'https://www.myntra.com' },
];

/**
 * Format uptime seconds into human-readable string.
 * @param {number} totalSeconds 
 * @returns {string} e.g. "2d 4h 12m 30s"
 */
function formatUptime(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Collect process and runtime metrics.
 */
function getSystemMetrics() {
  const uptimeSeconds = Math.floor(process.uptime());
  const mem = process.memoryUsage();
  return {
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
    memory: {
      rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      externalMb: Math.round((mem.external / 1024 / 1024) * 100) / 100,
    },
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
  };
}

/**
 * Probes upstream e-commerce targets to check external network reachability and latency.
 * Uses in-memory cache to keep response times fast for high-frequency monitors.
 * @param {boolean} forceRefresh - If true, bypasses the 60s cache
 */
async function checkUpstreamTargets(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedTargetsHealth && now - lastTargetsCheckTime < TARGETS_CACHE_TTL_MS) {
    return {
      cached: true,
      cacheAgeSeconds: Math.floor((now - lastTargetsCheckTime) / 1000),
      targets: cachedTargetsHealth,
    };
  }

  const results = await Promise.all(
    UPSTREAM_TARGETS.map(async (target) => {
      const startTime = Date.now();
      try {
        const response = await axios.get(target.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PriceGhost-Monitor/1.0',
            'Accept': 'text/html,*/*',
          },
          timeout: 4000,
          maxRedirects: 3,
          validateStatus: () => true, // Any HTTP response (200, 301, 403, 503 bot check) proves network path is live
        });

        const latencyMs = Date.now() - startTime;
        return {
          platform: target.platform,
          name: target.name,
          url: target.url,
          reachable: true,
          httpStatus: response.status,
          latencyMs,
          status: latencyMs > 2500 ? 'slow' : 'healthy',
        };
      } catch (err) {
        return {
          platform: target.platform,
          name: target.name,
          url: target.url,
          reachable: false,
          httpStatus: err.response?.status || null,
          latencyMs: Date.now() - startTime,
          error: err.code || err.message,
          status: 'unreachable',
        };
      }
    })
  );

  cachedTargetsHealth = results;
  lastTargetsCheckTime = now;

  return {
    cached: false,
    cacheAgeSeconds: 0,
    targets: results,
  };
}

/**
 * Checks MongoDB database connectivity and ping latency.
 */
async function checkDatabaseHealth() {
  const readyState = mongoose.connection.readyState;
  const isConnected = readyState === 1;

  const dbInfo = {
    connected: isConnected,
    readyState,
    readyStateDescription: ['disconnected', 'connected', 'connecting', 'disconnecting'][readyState] || 'unknown',
    target: getSanitizedUri(ENV.MONGODB_URI),
    host: mongoose.connection.host || null,
    database: mongoose.connection.name || null,
    latencyMs: null,
    status: isConnected ? 'healthy' : readyState === 2 ? 'connecting' : 'disconnected',
  };

  if (isConnected) {
    try {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      dbInfo.latencyMs = Date.now() - start;
      dbInfo.status = 'healthy';
    } catch (err) {
      dbInfo.status = 'degraded';
      dbInfo.error = err.message;
    }
  } else {
    // Proactively initiate background reconnection on monitor ping
    connectDB().catch(() => {});
  }

  return dbInfo;
}

/**
 * Helper to build the comprehensive upstream monitor diagnostic report.
 */
async function buildUpstreamReport(req) {
  const startTime = Date.now();
  const skipTargets = req.query.skipTargets === 'true';
  const forceRefreshTargets = req.query.fresh === 'true';
  const verifySmtp = req.query.verifySmtp === 'true';

  const [dbHealth, targetsHealth, emailHealth] = await Promise.all([
    checkDatabaseHealth(),
    skipTargets ? Promise.resolve(null) : checkUpstreamTargets(forceRefreshTargets),
    checkEmailStatus(verifySmtp),
  ]);

  const pollerHealth = getPollerStatus();
  const systemMetrics = getSystemMetrics();
  const totalResponseTimeMs = Date.now() - startTime;

  // Determine overall status
  let overallStatus = 'healthy';
  let httpStatusCode = 200;

  if (!dbHealth.connected) {
    overallStatus = 'down';
    httpStatusCode = 503;
  } else if (
    dbHealth.status === 'degraded' ||
    (targetsHealth && targetsHealth.targets.some((t) => !t.reachable))
  ) {
    overallStatus = 'degraded';
    // Return 200 for degraded so non-critical target flakiness doesn't falsely mark server down
    httpStatusCode = 200;
  }

  return {
    httpStatusCode,
    body: {
      status: overallStatus,
      service: 'Price Ghost API',
      timestamp: new Date().toISOString(),
      responseTimeMs: totalResponseTimeMs,
      environment: ENV.NODE_ENV,
      port: ENV.PORT,
      dependencies: {
        database: dbHealth,
        poller: {
          status: pollerHealth.isRunning ? 'running' : pollerHealth.autoPollEnabled ? 'healthy' : 'paused',
          isRunning: pollerHealth.isRunning,
          autoPollEnabled: pollerHealth.autoPollEnabled,
          intervalMinutes: pollerHealth.intervalMinutes,
          cronExpression: pollerHealth.cronExpression,
          lastCycleStartedAt: pollerHealth.lastCycleStartedAt,
          lastCycleFinishedAt: pollerHealth.lastCycleFinishedAt,
          lastCycleStats: pollerHealth.lastCycleStats,
          nextRunEstimate: pollerHealth.nextRunEstimate,
        },
        email: emailHealth,
        upstreamTargets: targetsHealth,
      },
      system: systemMetrics,
    },
  };
}

// Middleware: Set strict anti-caching headers on all health monitor responses
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

/**
 * GET & HEAD /api/health
 * Fast liveness check and primary upstream heartbeat endpoint.
 * Supports ?upstream=true or ?detailed=true to run full upstream check.
 */
router.all('/', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // If detailed upstream diagnostics requested
  if (
    req.query.upstream === 'true' ||
    req.query.detailed === 'true' ||
    req.query.check === 'upstream'
  ) {
    const report = await buildUpstreamReport(req);
    return res.status(report.httpStatusCode).json(report.body);
  }

  // Trigger background reconnect if database is down
  if (mongoose.connection.readyState !== 1) {
    connectDB().catch(() => {});
  }

  const poller = getPollerStatus();
  const uptimeSeconds = Math.floor(process.uptime());

  // Return standard lightweight health check (compatible with previous schema)
  return res.json({
    status: 'ok',
    service: 'Price Ghost API',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptimeSeconds,
      formatted: formatUptime(uptimeSeconds),
    },
    environment: ENV.NODE_ENV,
    port: ENV.PORT,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    readyState: mongoose.connection.readyState,
    dbTarget: getSanitizedUri(ENV.MONGODB_URI),
    poller: {
      isRunning: poller.isRunning,
      autoPollEnabled: poller.autoPollEnabled,
    },
  });
});

/**
 * GET & HEAD /api/health/upstream
 * Dedicated upstream dependency health monitor endpoint.
 * Checks MongoDB connection & latency, Poller engine status,
 * external scrapers reachability (Amazon, Flipkart, Myntra), SMTP config, and system resources.
 */
router.all('/upstream', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const report = await buildUpstreamReport(req);
  return res.status(report.httpStatusCode).json(report.body);
});

/**
 * GET & HEAD /api/health/ready
 * Standard Cloud / Kubernetes Readiness Probe.
 * Returns HTTP 200 only if MongoDB is connected and ready to serve requests.
 * Returns HTTP 503 if MongoDB is disconnected.
 */
router.all('/ready', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const isConnected = mongoose.connection.readyState === 1;

  if (!isConnected) {
    connectDB().catch(() => {});
    return res.status(503).json({
      status: 'not_ready',
      ready: false,
      timestamp: new Date().toISOString(),
      service: 'Price Ghost API',
      error: 'Database connection is not ready',
      readyState: mongoose.connection.readyState,
    });
  }

  return res.status(200).json({
    status: 'ready',
    ready: true,
    timestamp: new Date().toISOString(),
    service: 'Price Ghost API',
    readyState: mongoose.connection.readyState,
  });
});

/**
 * GET & HEAD /api/health/live
 * Standard Cloud / Kubernetes Liveness Probe.
 * Verifies that the server process is alive and event loop is responsive.
 */
router.all('/live', (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const uptimeSeconds = Math.floor(process.uptime());
  return res.status(200).json({
    status: 'alive',
    alive: true,
    timestamp: new Date().toISOString(),
    service: 'Price Ghost API',
    uptime: {
      seconds: uptimeSeconds,
      formatted: formatUptime(uptimeSeconds),
    },
  });
});

/**
 * GET & HEAD /api/health/ping
 * Ultra-lightweight heartbeat ping with minimal CPU and payload overhead.
 */
router.all('/ping', (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  return res.status(200).json({
    pong: true,
    timestamp: new Date().toISOString(),
  });
});

export default router;
