import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { UserModel } from '../models/User.js';
import { getPollerStatus, runPollerCycle, updatePollerConfig, checkUserPrices } from '../services/poller.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/poller/status
 * Fetches current poller status, running state, last cycle statistics, and auto-poll schedule.
 */
router.get('/status', (req, res) => {
  try {
    const status = getPollerStatus(req.user?.userId);
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

    if (mode === 'user') {
      // User-specific isolated price check: checks only this user's tracked items without locking out others
      const result = await checkUserPrices(req.user.userId, {
        itemDelayMs: 1000,
      });

      if (!result.success && result.isRunning) {
        return res.status(409).json(result);
      }

      return res.json({
        ...result,
        mode: 'user',
      });
    } else {
      // Full queue poll across all tracked items - restricted to administrators
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only administrators can trigger full-queue global polling.',
        });
      }

      const currentStatus = getPollerStatus();
      if (currentStatus.isRunning) {
        return res.status(409).json({
          success: false,
          isRunning: true,
          message: 'A global polling cycle is already actively executing. Please wait for it to complete.',
        });
      }

      const result = await runPollerCycle({
        all: true,
        itemDelayMs: 2500,
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
 * Updates automatic background polling schedule or pauses/resumes it (Admin only).
 * Body:
 *   - enabled: boolean (optional)
 *   - intervalMinutes: number (optional, e.g. 15, 30, 60, 180, 360, 720)
 */
router.post('/config', (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can configure background polling schedules.',
      });
    }

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
