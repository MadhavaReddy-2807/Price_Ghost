import { ENV } from '../config/env.js';

/**
 * In-memory sliding-window rate limiter middleware.
 * @param {Object} options
 * @param {number} options.windowMs Window duration in milliseconds (default 15 minutes)
 * @param {number} options.max Maximum allowed requests per window per IP (default 100)
 * @param {string} options.message Custom error message
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = 'Too many requests. Please try again later.',
} = {}) {
  const ipRequests = new Map();

  // Periodic cleanup of stale IPs every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of ipRequests.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        ipRequests.delete(ip);
      } else {
        ipRequests.set(ip, valid);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req, res, next) => {
    // In development mode, do not block localhost requests
    if (ENV.NODE_ENV === 'development') {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (ip === '127.0.0.1' || ip === '::1' || ip.includes('127.0.0.1')) {
      return next();
    }

    const now = Date.now();

    const timestamps = ipRequests.get(ip) || [];
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= max) {
      return res.status(429).json({
        error: message,
        retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000),
      });
    }

    recent.push(now);
    ipRequests.set(ip, recent);
    next();
  };
}
