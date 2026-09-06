import { Router } from 'express';
import { UserModel } from '../models/User.js';
import { authMiddleware, requireAccessMiddleware } from '../middleware/auth.js';
import { calculateDropPercentage } from '../services/priceEngine.js';

const router = Router();
router.use(authMiddleware);
router.use(requireAccessMiddleware);

// GET /api/dashboard/summary — High-level statistics
router.get('/summary', async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.userId).populate('trackedItems.itemId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validTracked = user.trackedItems.filter((t) => t.itemId != null);

    let activeAlerts = 0;
    let recentDrops = 0;
    let totalSavingsPotential = 0;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const t of validTracked) {
      const item = t.itemId;
      const baselinePrice = t.baseline === 'mrp' && item.mrpPrice > 0 ? item.mrpPrice : t.baselinePrice;
      const drop = calculateDropPercentage(baselinePrice, item.currentPrice);

      if (drop >= t.targetPercentageDrop) {
        activeAlerts++;
        totalSavingsPotential += Math.max(0, baselinePrice - item.currentPrice);
      }

      if (item.lastPriceChangeAt && new Date(item.lastPriceChangeAt) >= sevenDaysAgo) {
        recentDrops++;
      }
    }

    return res.json({
      totalTracked: validTracked.length,
      activeAlerts,
      recentDrops,
      totalSavingsPotential: Math.round(totalSavingsPotential),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch dashboard summary', details: error.message });
  }
});

// GET /api/dashboard/alerts — Active Price Drop Alerts Feed
router.get('/alerts', async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.userId).populate('trackedItems.itemId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const alerts = [];

    for (const t of user.trackedItems) {
      if (!t.itemId) continue;
      const item = t.itemId;
      const baselinePrice = t.baseline === 'mrp' && item.mrpPrice > 0 ? item.mrpPrice : t.baselinePrice;
      const dropPercentage = calculateDropPercentage(baselinePrice, item.currentPrice);

      if (dropPercentage >= t.targetPercentageDrop) {
        alerts.push({
          itemId: item._id,
          productTitle: item.title,
          platform: item.platform,
          imageUrl: item.imageUrl,
          url: item.url,
          currentPrice: item.currentPrice,
          mrpPrice: item.mrpPrice,
          baselinePrice,
          targetPrice: t.targetPrice,
          dropPercentage,
          targetPercentageDrop: t.targetPercentageDrop,
          savings: Math.max(0, baselinePrice - item.currentPrice),
          notifiedAt: t.lastNotifiedAt || t.createdAt,
        });
      }
    }

    // Sort by largest drop percentage first
    alerts.sort((a, b) => b.dropPercentage - a.dropPercentage);

    return res.json(alerts);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch active alerts', details: error.message });
  }
});

export default router;
