import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';

/**
 * Middleware that requires a valid Bearer JWT.
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. Bearer authentication token required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET);
    req.user = decoded; // Contains: { userId, email, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.', details: err.message });
  }
}

/**
 * Optional middleware that attaches user if Bearer token is provided, but allows public access if not.
 */
export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET);
    req.user = decoded;
  } catch {
    // Silently ignore invalid optional tokens
  }

  next();
}
