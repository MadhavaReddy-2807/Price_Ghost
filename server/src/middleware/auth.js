import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { UserModel } from '../models/User.js';

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
    req.user = decoded; // Contains: { userId, email, name, role, hasAccess }

    // Automatically ensure ADMIN_EMAILS have admin role
    if (decoded.email && ENV.ADMIN_EMAILS.includes(decoded.email.toLowerCase())) {
      req.user.role = 'admin';
      req.user.hasAccess = true;
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.', details: err.message });
  }
}

/**
 * Middleware that enforces that the user has been granted access.
 * If user has no access, protected operations (tracking, dashboard) are blocked with 403.
 */
export async function requireAccessMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admins always bypass access restrictions
  if (req.user.role === 'admin' || (req.user.email && ENV.ADMIN_EMAILS.includes(req.user.email.toLowerCase()))) {
    return next();
  }

  try {
    const user = await UserModel.findById(req.user.userId).select('hasAccess role email');
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    if (user.role === 'admin' || (user.email && ENV.ADMIN_EMAILS.includes(user.email.toLowerCase()))) {
      req.user.role = 'admin';
      req.user.hasAccess = true;
      return next();
    }

    if (user.hasAccess !== true) {
      return res.status(403).json({
        error: 'Extension Access Restricted: Your account has not been approved for Chrome Extension access by an administrator.',
        accessRestricted: true,
        extensionAccessRequired: true,
        message: 'An administrator must approve your account before you can use the Price Ghost Chrome Extension.',
      });
    }

    req.user.hasAccess = true;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify account access status', details: err.message });
  }
}

/**
 * Explicit alias for Extension Access enforcement.
 */
export const requireExtensionAccessMiddleware = requireAccessMiddleware;

/**
 * Middleware that restricts route to administrators only.
 */
export async function adminOnlyMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.email && ENV.ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    req.user.role = 'admin';
    req.user.hasAccess = true;
    return next();
  }

  try {
    const user = await UserModel.findById(req.user.userId).select('role email');
    if (user && (user.role === 'admin' || (user.email && ENV.ADMIN_EMAILS.includes(user.email.toLowerCase())))) {
      req.user.role = 'admin';
      req.user.hasAccess = true;
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden: Administrator privileges required to access this resource.',
      adminRequired: true,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify administrator privileges', details: err.message });
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
    if (decoded.email && ENV.ADMIN_EMAILS.includes(decoded.email.toLowerCase())) {
      req.user.role = 'admin';
      req.user.hasAccess = true;
    }
  } catch {
    // Silently ignore invalid optional tokens
  }

  next();
}
