import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { UserModel } from '../models/User.js';
import { ENV } from '../config/env.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const googleClient = ENV.GOOGLE_CLIENT_ID ? new OAuth2Client(ENV.GOOGLE_CLIENT_ID) : null;

function generateUserToken(user) {
  const isAdmin = user.role === 'admin' || (user.email && ENV.ADMIN_EMAILS.includes(user.email.toLowerCase()));
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: isAdmin ? 'admin' : (user.role || 'user'),
      hasAccess: isAdmin ? true : (user.hasAccess === true),
    },
    ENV.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// GET /api/auth/config — Provides Google Client ID to frontends
router.get('/config', (req, res) => {
  return res.json({
    googleClientId: ENV.GOOGLE_CLIENT_ID || '',
  });
});

// POST /api/auth/google — Verify Google ID Token & Authenticate
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential token is required' });
    }

    let payload = null;

    if (googleClient && ENV.GOOGLE_CLIENT_ID) {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: ENV.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else {
      // Fallback base64 decoder if client ID is undergoing initial configuration
      const parts = credential.split('.');
      if (parts.length === 3) {
        payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      }
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Could not verify Google ID token.' });
    }

    const googleId = payload.sub || payload.id || `google_${payload.email}`;
    const email = payload.email.toLowerCase().trim();
    const name = payload.name || payload.given_name || email.split('@')[0];
    const avatarUrl = payload.picture || '';
    const isAdmin = ENV.ADMIN_EMAILS.includes(email);

    // Find user by either googleId or email
    let user = await UserModel.findOne({
      $or: [{ googleId }, { email }],
    });

    if (!user) {
      user = await UserModel.create({
        googleId,
        email,
        name,
        avatarUrl,
        role: isAdmin ? 'admin' : 'user',
        hasAccess: isAdmin ? true : false,
        notifications: {
          email: true,
          frequency: 'realtime',
          defaultThreshold: 10,
        },
      });
    } else {
      user.googleId = googleId;
      if (name) user.name = name;
      if (avatarUrl) user.avatarUrl = avatarUrl;
      if (isAdmin) {
        user.role = 'admin';
        user.hasAccess = true;
      }
      await user.save();
    }

    const token = generateUserToken(user);

    return res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        hasAccess: user.hasAccess,
        notifications: user.notifications,
        extensionInstalled: user.extensionInstalled,
      },
    });
  } catch (error) {
    console.error('[Auth Error] Google login failed:', error.message);
    return res.status(500).json({ error: 'Google authentication failed', details: error.message });
  }
});

// GET /api/auth/me — Current User Profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.userId).select('-__v');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.email && ENV.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      if (user.role !== 'admin' || user.hasAccess !== true) {
        user.role = 'admin';
        user.hasAccess = true;
        await user.save();
      }
    }
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// POST /api/auth/logout — Logout
router.post('/logout', (req, res) => {
  return res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
