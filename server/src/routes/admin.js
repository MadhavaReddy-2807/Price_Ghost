import { Router } from 'express';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { UserModel } from '../models/User.js';
import { ItemModel } from '../models/Item.js';
import { SystemSettingModel } from '../models/SystemSetting.js';
import { getPollerStatus, updatePollerConfig, runPollerCycle } from '../services/poller.js';

const router = Router();

// Protect all admin routes
router.use(authMiddleware);
router.use(adminOnlyMiddleware);

/**
 * GET /api/admin/stats
 * Overview dashboard metrics for administrators.
 */
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      approvedUsers,
      pendingUsers,
      adminUsers,
      totalItems,
      pollerStatus,
    ] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ hasAccess: true }),
      UserModel.countDocuments({ hasAccess: false }),
      UserModel.countDocuments({ role: 'admin' }),
      ItemModel.countDocuments(),
      Promise.resolve(getPollerStatus()),
    ]);

    const pollerConfigSetting = await SystemSettingModel.findOne({ key: 'pollerConfig' });

    return res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          approved: approvedUsers,
          pending: pendingUsers,
          admins: adminUsers,
        },
        items: {
          total: totalItems,
        },
        poller: {
          ...pollerStatus,
          persistedConfig: pollerConfigSetting?.value || null,
        },
        system: {
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        },
      },
    });
  } catch (error) {
    console.error('[Admin Stats Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve admin statistics', details: error.message });
  }
});

/**
 * GET /api/admin/users
 * Paginated and searchable list of users with access status.
 */
router.get('/users', async (req, res) => {
  try {
    const { search = '', filter = 'all', page = 1, limit = 50 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (filter === 'pending') {
      query.hasAccess = false;
    } else if (filter === 'approved') {
      query.hasAccess = true;
    } else if (filter === 'admin') {
      query.role = 'admin';
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [users, total] = await Promise.all([
      UserModel.find(query)
        .select('name email avatarUrl role hasAccess createdAt updatedAt trackedItems mailQueue extensionInstalled')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
      UserModel.countDocuments(query),
    ]);

    const mappedUsers = users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      role: u.role || 'user',
      hasAccess: u.hasAccess === true,
      trackedItemsCount: u.trackedItems ? u.trackedItems.length : 0,
      mailQueueCount: u.mailQueue ? u.mailQueue.length : 0,
      extensionInstalled: u.extensionInstalled || false,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    return res.json({
      success: true,
      users: mappedUsers,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('[Admin Get Users Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve users', details: error.message });
  }
});

/**
 * PATCH /api/admin/users/:userId/access
 * Grant or revoke user access to the platform.
 */
router.patch('/users/:userId/access', async (req, res) => {
  try {
    const { userId } = req.params;
    const { hasAccess } = req.body;

    if (typeof hasAccess !== 'boolean') {
      return res.status(400).json({ error: 'hasAccess must be a boolean (true or false)' });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.hasAccess = hasAccess;
    await user.save();

    console.log(`[Admin] User ${user.email} access changed to: ${hasAccess ? 'GRANTED' : 'REVOKED'} by admin`);

    return res.json({
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasAccess: user.hasAccess,
      },
      message: hasAccess
        ? `Access granted to ${user.email}. User can now track items and use the platform.`
        : `Access revoked for ${user.email}. User can no longer track items.`,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update user access', details: error.message });
  }
});

/**
 * PATCH /api/admin/users/:userId/role
 * Promote user to admin or demote to standard user.
 */
router.patch('/users/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: "role must be either 'admin' or 'user'" });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.role = role;
    if (role === 'admin') {
      user.hasAccess = true; // Admins always have access
    }
    await user.save();

    console.log(`[Admin] User ${user.email} role updated to: ${role}`);

    return res.json({
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasAccess: user.hasAccess,
      },
      message: `User role updated to ${role}.`,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update user role', details: error.message });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Deletes a user account.
 */
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.userId === userId) {
      return res.status(400).json({ error: 'Cannot delete your own administrator account.' });
    }

    const user = await UserModel.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[Admin] Deleted user: ${user.email}`);

    return res.json({
      success: true,
      message: `User ${user.email} deleted successfully.`,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
});

/**
 * GET /api/admin/poller
 * Detailed poller configuration and live operational state.
 */
router.get('/poller', async (req, res) => {
  try {
    const status = getPollerStatus();
    const persisted = await SystemSettingModel.findOne({ key: 'pollerConfig' });

    return res.json({
      success: true,
      poller: status,
      persistedConfig: persisted?.value || null,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get poller information', details: error.message });
  }
});

/**
 * POST /api/admin/poller/config
 * Updates default polling schedule, interval, and auto-poll state.
 * Body:
 *   - enabled: boolean (optional)
 *   - intervalMinutes: number (optional, e.g. 5, 15, 30, 60, 180, 360, 720, 1440)
 */
router.post('/poller/config', async (req, res) => {
  try {
    const { enabled, intervalMinutes } = req.body || {};

    const updatedStatus = updatePollerConfig({
      enabled: typeof enabled === 'boolean' ? enabled : undefined,
      intervalMinutes: typeof intervalMinutes === 'number' ? intervalMinutes : undefined,
    });

    // Persist configuration in MongoDB SystemSetting
    await SystemSettingModel.findOneAndUpdate(
      { key: 'pollerConfig' },
      {
        key: 'pollerConfig',
        value: {
          autoPollEnabled: updatedStatus.autoPollEnabled,
          intervalMinutes: updatedStatus.intervalMinutes,
          updatedAt: new Date(),
        },
        description: 'Global price polling scheduler configuration',
        updatedBy: req.user.email || 'admin',
      },
      { upsert: true, new: true }
    );

    console.log(
      `[Admin] Poller configured by ${req.user.email}: autoPoll=${updatedStatus.autoPollEnabled}, interval=${updatedStatus.intervalMinutes}m`
    );

    return res.json({
      success: true,
      status: updatedStatus,
      message: updatedStatus.autoPollEnabled
        ? `Default polling updated: active every ${updatedStatus.intervalMinutes} minutes.`
        : 'Default background polling has been paused.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to configure poller', details: error.message });
  }
});

/**
 * POST /api/admin/poller/trigger
 * Manually trigger an immediate price check cycle across all items.
 */
router.post('/poller/trigger', async (req, res) => {
  try {
    const currentStatus = getPollerStatus();
    if (currentStatus.isRunning) {
      return res.status(409).json({
        success: false,
        isRunning: true,
        message: 'A polling cycle is already actively executing. Please wait for it to complete.',
      });
    }

    console.log(`[Admin] Poller cycle manually triggered by admin ${req.user.email}`);

    // Trigger cycle across all items with 2s polite delay
    const result = await runPollerCycle({
      itemDelayMs: 2000,
    });

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to trigger poller cycle', details: error.message });
  }
});

export default router;
