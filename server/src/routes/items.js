import { Router } from 'express';
import { ItemModel } from '../models/Item.js';
import { UserModel } from '../models/User.js';
import { authMiddleware, requireAccessMiddleware } from '../middleware/auth.js';
import { calculateTargetPrice, sanitizePriceString } from '../services/priceEngine.js';
import { scrapeProduct, detectPlatform } from '../services/scraper/index.js';

const router = Router();
router.use(authMiddleware);
router.use(requireAccessMiddleware);

/**
 * Common helper to upsert canonical item and link it to the user's tracking list.
 */
async function trackProductForUser(userId, productData) {
  const {
    platform,
    externalId,
    title,
    url,
    imageUrl = '',
    currentPrice: rawCurrentPrice,
    mrpPrice: rawMrpPrice,
    currency = 'INR',
    targetPercentageDrop,
    baseline = 'initial',
  } = productData;

  const currentPrice = sanitizePriceString(rawCurrentPrice);
  let mrpPrice = sanitizePriceString(rawMrpPrice);
  if (!mrpPrice || mrpPrice < currentPrice) mrpPrice = currentPrice;

  if (currentPrice <= 0) {
    throw new Error('Valid currentPrice greater than 0 is required.');
  }

  const uniqueKey = `${platform}:${externalId}`;

  // 1. Upsert Canonical Item
  let item = await ItemModel.findOne({ uniqueKey });

  if (!item) {
    item = await ItemModel.create({
      platform,
      externalId,
      uniqueKey,
      title,
      url,
      imageUrl,
      currency,
      currentPrice,
      mrpPrice,
      lowestPrice: currentPrice,
      highestPrice: currentPrice,
      priceHistory: [{ price: currentPrice, timestamp: new Date() }],
      trackerCount: 1,
      lastCheckedAt: new Date(),
    });
  } else {
    item.title = title;
    item.url = url;
    if (imageUrl) item.imageUrl = imageUrl;
    if (mrpPrice > 0) item.mrpPrice = mrpPrice;

    if (item.currentPrice !== currentPrice) {
      item.currentPrice = currentPrice;
      item.lowestPrice = Math.min(item.lowestPrice, currentPrice);
      item.highestPrice = Math.max(item.highestPrice, currentPrice);
      item.lastPriceChangeAt = new Date();
      item.priceHistory.push({ price: currentPrice, timestamp: new Date() });
      while (item.priceHistory.length > 365) {
        item.priceHistory.shift();
      }
    }
    item.lastCheckedAt = new Date();
    await item.save();
  }

  // 2. Link item to User trackedItems
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const dropPercent = targetPercentageDrop !== undefined 
    ? Number(targetPercentageDrop) 
    : (user.notifications?.defaultThreshold || 10);

  const baselinePrice = baseline === 'mrp' && mrpPrice > 0 ? mrpPrice : currentPrice;
  const targetPrice = calculateTargetPrice(baselinePrice, dropPercent);

  const existingTrackIndex = user.trackedItems.findIndex(
    (t) => t.itemId.toString() === item._id.toString()
  );

  let trackingData;

  if (existingTrackIndex >= 0) {
    // Update existing tracking record
    user.trackedItems[existingTrackIndex].targetPercentageDrop = dropPercent;
    user.trackedItems[existingTrackIndex].baseline = baseline;
    user.trackedItems[existingTrackIndex].baselinePrice = baselinePrice;
    user.trackedItems[existingTrackIndex].targetPrice = targetPrice;
    trackingData = user.trackedItems[existingTrackIndex];
  } else {
    // Add new tracking entry
    trackingData = {
      itemId: item._id,
      targetPercentageDrop: dropPercent,
      baseline,
      baselinePrice,
      targetPrice,
      createdAt: new Date(),
    };
    user.trackedItems.push(trackingData);

    // Increment trackerCount if newly tracked
    await ItemModel.findByIdAndUpdate(item._id, { $inc: { trackerCount: 1 } });
  }

  await user.save();

  return {
    success: true,
    item,
    tracking: trackingData,
  };
}

// POST /api/items/track — Upsert canonical item and link to user tracking list
router.post('/track', async (req, res) => {
  try {
    const { platform, externalId, title, url } = req.body;

    if (!platform || !externalId || !title || !url) {
      return res.status(400).json({ error: 'Missing required fields (platform, externalId, title, url).' });
    }

    const result = await trackProductForUser(req.user.userId, req.body);
    return res.status(201).json(result);
  } catch (error) {
    console.error('[Item Track Error]', error);
    return res.status(500).json({ error: 'Failed to track item', details: error.message });
  }
});

// POST /api/items/track-url — Manually track product by pasting an Amazon, Flipkart, or Myntra URL
router.post('/track-url', async (req, res) => {
  try {
    const { url, targetPercentageDrop, baseline = 'initial' } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Product URL is required.' });
    }

    const cleanUrl = url.trim();
    const platform = detectPlatform(cleanUrl);

    if (!platform) {
      return res.status(400).json({
        error: 'Unsupported e-commerce platform. Please provide an Amazon.in, Flipkart, or Myntra product link.',
      });
    }

    // Scrape live product data using backend scraper
    const scraped = await scrapeProduct(cleanUrl, platform);

    if (!scraped || !scraped.title || !scraped.currentPrice || scraped.currentPrice <= 0) {
      return res.status(422).json({
        error: 'Could not extract product pricing or title from this link. Please ensure it is a direct product page.',
      });
    }

    const result = await trackProductForUser(req.user.userId, {
      ...scraped,
      url: cleanUrl,
      targetPercentageDrop,
      baseline,
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('[Track URL Error]', error);
    return res.status(500).json({ error: 'Failed to track product from URL', details: error.message });
  }
});

// GET /api/items/tracked — List all tracked items populated with Item details
router.get('/tracked', async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.userId).populate('trackedItems.itemId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Filter out any orphaned item references
    const populatedTracked = user.trackedItems
      .filter((t) => t.itemId != null)
      .map((t) => ({
        tracking: {
          targetPercentageDrop: t.targetPercentageDrop,
          baseline: t.baseline,
          baselinePrice: t.baselinePrice,
          targetPrice: t.targetPrice,
          lastNotifiedAt: t.lastNotifiedAt,
          lastNotifiedPrice: t.lastNotifiedPrice,
          createdAt: t.createdAt,
        },
        item: t.itemId,
      }));

    return res.json(populatedTracked);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch tracked items', details: error.message });
  }
});

// DELETE /api/items/untrack/:itemId — Untrack item for current user
router.delete('/untrack/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const user = await UserModel.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const initialLength = user.trackedItems.length;
    user.trackedItems = user.trackedItems.filter((t) => t.itemId.toString() !== itemId);

    if (user.trackedItems.length !== initialLength) {
      await user.save();
      await ItemModel.findByIdAndUpdate(itemId, { $inc: { trackerCount: -1 } });
    }

    return res.json({ success: true, message: 'Item removed from tracking.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to untrack item', details: error.message });
  }
});

// PUT /api/items/:itemId/threshold — Update user's drop target for a specific item
router.put('/:itemId/threshold', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { targetPercentageDrop, baseline } = req.body;

    const user = await UserModel.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tracking = user.trackedItems.find((t) => t.itemId.toString() === itemId);
    if (!tracking) {
      return res.status(404).json({ error: 'Item not found in your tracking list.' });
    }

    if (targetPercentageDrop !== undefined) {
      tracking.targetPercentageDrop = Math.max(1, Math.min(95, Number(targetPercentageDrop)));
    }

    if (baseline && ['initial', 'mrp'].includes(baseline)) {
      tracking.baseline = baseline;
    }

    tracking.targetPrice = calculateTargetPrice(tracking.baselinePrice, tracking.targetPercentageDrop);

    await user.save();

    return res.json({
      success: true,
      tracking: {
        targetPercentageDrop: tracking.targetPercentageDrop,
        baseline: tracking.baseline,
        baselinePrice: tracking.baselinePrice,
        targetPrice: tracking.targetPrice,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update threshold', details: error.message });
  }
});

// GET /api/items/:itemId/history — Fetch price history points for an item
router.get('/:itemId/history', async (req, res) => {
  try {
    const { itemId } = req.params;
    const item = await ItemModel.findById(itemId).select('title currency priceHistory currentPrice mrpPrice');

    if (!item) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    return res.json({
      itemId: item._id,
      title: item.title,
      currency: item.currency,
      currentPrice: item.currentPrice,
      mrpPrice: item.mrpPrice,
      history: item.priceHistory,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch price history', details: error.message });
  }
});

export default router;
