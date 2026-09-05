import { Router } from 'express';
import { UserModel } from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/user/preferences — Get Notification Preferences
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      notifications: user.notifications,
      extensionInstalled: user.extensionInstalled,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// PUT /api/user/preferences — Update Notification Preferences
router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const { email, frequency, defaultThreshold, quietHoursStart, quietHoursEnd } = req.body;
    const user = await UserModel.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (email !== undefined) user.notifications.email = Boolean(email);
    if (frequency && ['realtime', '6h', '12h', '24h'].includes(frequency)) {
      user.notifications.frequency = frequency;
    }
    if (defaultThreshold !== undefined) {
      user.notifications.defaultThreshold = Math.max(1, Math.min(95, Number(defaultThreshold)));
    }
    if (quietHoursStart !== undefined) user.notifications.quietHoursStart = quietHoursStart;
    if (quietHoursEnd !== undefined) user.notifications.quietHoursEnd = quietHoursEnd;

    await user.save();

    return res.json({
      success: true,
      notifications: user.notifications,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// PUT /api/user/extension-status — Sync Chrome Extension Status
router.put('/extension-status', authMiddleware, async (req, res) => {
  try {
    const { installed } = req.body;
    const user = await UserModel.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.extensionInstalled = Boolean(installed);
    await user.save();

    return res.json({
      success: true,
      installed: user.extensionInstalled,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update extension status' });
  }
});

// POST /api/user/unsubscribe — One-click email unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (user) {
      user.notifications.email = false;
      await user.save();
    }

    return res.json({
      success: true,
      message: 'You have been successfully unsubscribed from price drop email alerts.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to process unsubscribe request' });
  }
});

export default router;
