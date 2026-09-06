import { Router } from 'express';
import { UserModel } from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { getUserMailQueue, processUserMailQueue, retryFailedUserQueue } from '../services/mailQueueService.js';

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

// GET /api/user/mail-queue — Inspect current user's mailing queue history and status
router.get('/mail-queue', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const queueData = await getUserMailQueue(req.user.userId, limit);
    return res.json({
      success: true,
      ...queueData,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch user mail queue', details: error.message });
  }
});

// POST /api/user/mail-queue/process — Trigger immediate processing of pending mail queue
router.post('/mail-queue/process', authMiddleware, async (req, res) => {
  try {
    const result = await processUserMailQueue(req.user.userId, { force: true });
    return res.json({
      success: true,
      message: `Processed ${result.processed} email(s): ${result.sent} sent, ${result.failed} failed.`,
      result,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to process mail queue', details: error.message });
  }
});

// POST /api/user/mail-queue/retry — Retry failed email alerts in user's queue
router.post('/mail-queue/retry', authMiddleware, async (req, res) => {
  try {
    const { queueItemId } = req.body || {};
    const result = await retryFailedUserQueue(req.user.userId, queueItemId);
    return res.json({
      success: true,
      message: `Retried ${result.resetCount} failed email(s): ${result.sent} sent, ${result.failed} failed.`,
      result,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retry mail queue', details: error.message });
  }
});

export default router;
