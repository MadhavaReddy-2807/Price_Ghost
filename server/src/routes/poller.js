import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { UserModel } from '../models/User.js';
import { getPollerStatus, runPollerCycle, updatePollerConfig } from '../services/poller.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/poller/status
 * Fetches current poller status, running state, last cycle statistics, and auto-poll schedule.
 */
router.get('/status', (req, res) => {
  try {
    const status = getPollerStatus();
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get poller status', details: error.message });
  }
});

/**
 * POST /api/poller/trigger
 * Manually or automatically triggers a polling cycle.
 * Body:
 *   - mode: 'user' (default) | 'all'
 */
router.post('/trigger', async (req, res) => {
  try {
    const mode = req.body?.mode || 'user';
    const currentStatus = getPollerStatus();

    if (currentStatus.isRunning) {
      return res.status(409).json({
        success: false,
        isRunning: true,
        message: 'A price checking cycle is already actively running. Please wait for it to complete.',
      });
    }

    if (mode === 'user') {
      const user = await UserModel.findById(req.user.userId);
      if (!user || !user.trackedItems || user.trackedItems.length === 0) {
        return res.json({
          success: true,
          itemsChecked: 0,
          priceChangesDetected: 0,
          alertsSent: 0,
          message: 'You have no tracked products to check yet.',
        });
      }

      const itemIds = user.trackedItems.map((t) => t.itemId).filter(Boolean);

      // Trigger cycle with reduced delay for instant user feedback
      const result = await runPollerCycle({
        itemIds,
        itemDelayMs: 1200,
      });

      return res.json({
        ...result,
        mode: 'user',
        totalUserItems: itemIds.length,
      });
    } else {
      // Full queue poll across all oldest items
      const result = await runPollerCycle({
        itemDelayMs: 3000,
      });

      return res.json({
        ...result,
        mode: 'all',
      });
    }
  } catch (error) {
    console.error('[Poller Trigger Route Error]', error);
    return res.status(500).json({ error: 'Failed to trigger poller cycle', details: error.message });
  }
});

/**
 * POST /api/poller/config
 * Updates automatic background polling schedule or pauses/resumes it.
 * Body:
 *   - enabled: boolean (optional)
 *   - intervalMinutes: number (optional, e.g. 15, 30, 60, 180, 360, 720)
 */
router.post('/config', (req, res) => {
  try {
    const { enabled, intervalMinutes } = req.body || {};
    const updatedStatus = updatePollerConfig({
      enabled: typeof enabled === 'boolean' ? enabled : undefined,
      intervalMinutes: typeof intervalMinutes === 'number' ? intervalMinutes : undefined,
    });

    return res.json({
      success: true,
      status: updatedStatus,
      message: updatedStatus.autoPollEnabled
        ? `Automatic polling enabled. Running every ${updatedStatus.intervalMinutes} minutes.`
        : 'Automatic background polling has been paused.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update poller config', details: error.message });
  }
});

export default router;
