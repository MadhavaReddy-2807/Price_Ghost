import cron from 'node-cron';
import mongoose from 'mongoose';
import { ItemModel } from '../models/Item.js';
import { UserModel } from '../models/User.js';
import { scrapeProduct } from './scraper/index.js';
import { calculateDropPercentage, shouldNotifyUser } from './priceEngine.js';
import { sendPriceDropEmail } from './emailService.js';
import { enqueueUserEmail, processUserMailQueue, processAllPendingMailQueues } from './mailQueueService.js';
import { ENV } from '../config/env.js';

let isPollerRunning = false;
let lastCycleStartedAt = null;
let lastCycleFinishedAt = null;
let lastCycleStats = {
  itemsChecked: 0,
  priceChangesDetected: 0,
  alertsSent: 0,
  errorCount: 0,
  durationSeconds: 0,
};
let autoPollEnabled = true;
let currentIntervalMinutes = Math.max(5, ENV.POLL_INTERVAL_MINUTES || 180);
let activeCronTask = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debugLog(...args) {
  if (ENV.POLL_DEBUG) {
    console.log('[Poller Debug]', ...args);
  }
}

/**
 * Calculates a valid node-cron schedule expression based on interval in minutes.
 * Supports sub-hour intervals, multi-hour intervals, and day intervals.
 */
export function getCronExpression(intervalMinutes) {
  if (intervalMinutes < 60) {
    return `*/${intervalMinutes} * * * *`;
  }
  const hours = Math.round(intervalMinutes / 60);
  if (hours <= 1) {
    return '0 * * * *';
  }
  if (hours < 24) {
    return `0 */${hours} * * *`;
  }
  const days = Math.round(hours / 24);
  return `0 0 */${days} * *`;
}

/**
 * Runs a single cycle of the price polling engine across items.
 * @param {Object} options
 * @param {string[]} [options.itemIds] - Specific item IDs to poll
 * @param {number} [options.batchSize] - Batch size override
 * @param {number} [options.itemDelayMs] - Delay between items in ms
 */
export async function runPollerCycle(options = {}) {
  if (mongoose.connection.readyState !== 1) {
    console.log(
      `[Poller] ⚠️ Skipping cycle: MongoDB is not connected yet (readyState=${mongoose.connection.readyState}). Waiting for DB connection.`
    );
    return {
      success: false,
      isRunning: false,
      message: 'MongoDB is not connected yet. Waiting for database connection.',
    };
  }

  if (isPollerRunning) {
    console.log(
      `[Poller] ⚠️ Previous cycle started at ${lastCycleStartedAt?.toISOString()} is still in progress. Skipping trigger.`
    );
    return {
      success: false,
      isRunning: true,
      message: 'A price checking cycle is already in progress.',
    };
  }

  isPollerRunning = true;
  lastCycleStartedAt = new Date();
  const cycleStartTime = Date.now();
  const batchSize = options.batchSize || Math.max(1, ENV.POLL_BATCH_SIZE || 20);
  const baseItemDelay = options.itemDelayMs != null ? options.itemDelayMs : Math.max(1000, ENV.POLL_ITEM_DELAY_MS || 5000);

  console.log(`\n[Poller] ==================== STARTING POLLER CYCLE ====================`);
  console.log(`[Poller] Timestamp: ${lastCycleStartedAt.toISOString()}`);
  debugLog(`Config: batchSize=${batchSize}, baseItemDelay=${baseItemDelay}ms, debugLogs=ENABLED`);

  let itemsChecked = 0;
  let priceChangesDetected = 0;
  let alertsSent = 0;
  let errorCount = 0;

  try {
    let items = [];
    if (options.itemIds && Array.isArray(options.itemIds) && options.itemIds.length > 0) {
      debugLog(`Querying database for ${options.itemIds.length} specified items...`);
      items = await ItemModel.find({ _id: { $in: options.itemIds } });
    } else {
      debugLog(`Querying database for up to ${batchSize} oldest-checked items...`);
      items = await ItemModel.find({}).sort({ lastCheckedAt: 1 }).limit(batchSize);
    }

    if (items.length === 0) {
      console.log('[Poller] No items currently in tracking queue.');
      debugLog('Database returned 0 items matching query.');
      return {
        success: true,
        itemsChecked: 0,
        priceChangesDetected: 0,
        alertsSent: 0,
        errorCount: 0,
        durationSeconds: 0,
        message: 'No tracked items found to check.',
      };
    }

    console.log(`[Poller] Found ${items.length} item(s) to check in this cycle.`);
    debugLog(
      `Item queue:`,
      items.map((it) => `[${it.platform}] ${it._id.toString().slice(-6)}: "${it.title.slice(0, 25)}..."`)
    );

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const itemStartTime = Date.now();
      itemsChecked++;

      console.log(
        `[Poller] [${index + 1}/${items.length}] Checking [${item.platform}] "${item.title.slice(0, 40)}..." (ID: ${item._id})`
      );
      debugLog(`Product URL: ${item.url}`);
      debugLog(
        `Previous state -> Current: ₹${item.currentPrice}, MRP: ₹${item.mrpPrice || 'N/A'}, Lowest: ₹${item.lowestPrice}, Highest: ₹${item.highestPrice}, InStock: ${item.inStock}`
      );
      debugLog(`Last checked at: ${item.lastCheckedAt ? item.lastCheckedAt.toISOString() : 'Never'}`);

      try {
        debugLog(`Invoking scraper for ${item.platform}...`);
        const scrapeStart = Date.now();
        const scraped = await scrapeProduct(item.url, item.platform);
        const scrapeDuration = Date.now() - scrapeStart;

        debugLog(
          `Scrape completed in ${scrapeDuration}ms -> price=₹${scraped.currentPrice}, mrp=₹${scraped.mrpPrice || 'N/A'}, inStock=${scraped.inStock}`
        );

        const oldPrice = item.currentPrice;
        const newPrice = scraped.currentPrice;
        item.lastCheckedAt = new Date();
        item.inStock = scraped.inStock;

        if (scraped.mrpPrice && scraped.mrpPrice > 0) {
          item.mrpPrice = scraped.mrpPrice;
        }

        // Check if price changed
        if (newPrice > 0 && newPrice !== oldPrice) {
          priceChangesDetected++;
          const priceDiff = newPrice - oldPrice;
          const pctChange = calculateDropPercentage(oldPrice, newPrice);

          console.log(
            `[Poller] 🚨 Price change detected for "${item.title}": ₹${oldPrice} -> ₹${newPrice} (${priceDiff > 0 ? '+' : ''}₹${priceDiff}, -${pctChange}%)`
          );

          item.currentPrice = newPrice;
          item.lowestPrice = Math.min(item.lowestPrice, newPrice);
          item.highestPrice = Math.max(item.highestPrice, newPrice);
          item.lastPriceChangeAt = new Date();

          // Push price history and clamp at 365 entries
          item.priceHistory.push({ price: newPrice, timestamp: new Date() });
          while (item.priceHistory.length > 365) {
            item.priceHistory.shift();
          }

          debugLog(
            `Saving updated item record: lowest=₹${item.lowestPrice}, highest=₹${item.highestPrice}, historyCount=${item.priceHistory.length}`
          );
          await item.save();

          // Evaluate notifications for users tracking this product
          debugLog(`Querying users tracking item ${item._id} with email alerts enabled...`);
          const users = await UserModel.find({
            'trackedItems.itemId': item._id,
            'notifications.email': true,
          });

          debugLog(`Found ${users.length} subscriber(s) tracking this item.`);

          for (const user of users) {
            const tracking = user.trackedItems.find(
              (t) => t.itemId.toString() === item._id.toString()
            );

            if (!tracking) {
              debugLog(`Skipping user ${user.email}: tracking subdocument not found.`);
              continue;
            }

            const baselinePrice =
              tracking.baseline === 'mrp' && item.mrpPrice > 0
                ? item.mrpPrice
                : tracking.baselinePrice;

            const shouldNotify = shouldNotifyUser({
              currentPrice: newPrice,
              baselinePrice,
              targetPercentageDrop: tracking.targetPercentageDrop,
              lastNotifiedPrice: tracking.lastNotifiedPrice,
              quietHoursStart: user.notifications?.quietHoursStart,
              quietHoursEnd: user.notifications?.quietHoursEnd,
            });

            debugLog(
              `Subscriber eval (${user.email}) -> baseline=₹${baselinePrice}, targetDrop=${tracking.targetPercentageDrop}%, lastNotifiedPrice=${tracking.lastNotifiedPrice || 'none'}, shouldNotify=${shouldNotify}`
            );

            if (shouldNotify) {
              const dropPercent = calculateDropPercentage(baselinePrice, newPrice);
              console.log(`[Poller] 📥 Enqueueing drop alert into user mail queue for ${user.email} (-${dropPercent}%)`);

              try {
                await enqueueUserEmail(user._id, {
                  type: 'price_drop_alert',
                  subject: `📉 Price Drop Alert: ${item.title.slice(0, 50)}...`,
                  payload: {
                    itemId: item._id,
                    itemTitle: item.title,
                    itemUrl: item.url,
                    itemImage: item.imageUrl,
                    platform: item.platform,
                    baselinePrice,
                    currentPrice: newPrice,
                    dropPercentage: dropPercent,
                    savings: Math.max(0, baselinePrice - newPrice),
                  },
                });

                // Process pending emails in the user's mailing queue
                const queueResult = await processUserMailQueue(user._id);
                if (queueResult.sent > 0) {
                  alertsSent += queueResult.sent;
                  console.log(`[Poller] 📧 Sent ${queueResult.sent} alert email(s) from user mail queue to ${user.email}`);
                }
              } catch (queueErr) {
                console.warn(`[Poller Warning] Mail queue error for ${user.email}: ${queueErr.message}`);
                debugLog(`Mail queue error stack:`, queueErr.stack);
              }
            } else {
              debugLog(`Notification conditions not met for ${user.email}. Skipping email.`);
            }
          }
        } else {
          // Price unchanged, update lastCheckedAt
          debugLog(`Price unchanged for "${item.title}" (₹${newPrice || oldPrice}). InStock: ${scraped.inStock}. Updated lastCheckedAt.`);
          await item.save();
        }

        debugLog(`Item [${index + 1}/${items.length}] processed in ${Date.now() - itemStartTime}ms.`);
      } catch (err) {
        errorCount++;
        console.warn(`[Poller Warning] Failed checking "${item.title}": ${err.message}`);
        debugLog(`Failed check details:`, err.stack || err);
        item.lastCheckedAt = new Date();
        await item.save().catch(() => {});
      }

      // Reduced polling frequency: polite delay between item requests (e.g. 5000ms + 0-1500ms jitter)
      if (index < items.length - 1) {
        const jitter = Math.floor(Math.random() * 1500);
        const sleepMs = baseItemDelay + jitter;
        debugLog(`Polite pacing: sleeping for ${sleepMs}ms before next item...`);
        await sleep(sleepMs);
      }
    }

    // Sweep any pending/deferred mail queues across all users
    try {
      const sweep = await processAllPendingMailQueues();
      if (sweep.totalSent > 0) {
        alertsSent += sweep.totalSent;
        console.log(`[Poller] 📬 Flushed pending user mail queues: sent ${sweep.totalSent} deferred alert(s).`);
      }
    } catch (sweepErr) {
      debugLog('Pending queue sweep notice:', sweepErr.message);
    }

    const cycleDuration = parseFloat(((Date.now() - cycleStartTime) / 1000).toFixed(2));
    lastCycleFinishedAt = new Date();
    lastCycleStats = {
      itemsChecked,
      priceChangesDetected,
      alertsSent,
      errorCount,
      durationSeconds: cycleDuration,
    };

    console.log(`[Poller] ==================== POLLER CYCLE COMPLETED ====================`);
    console.log(
      `[Poller] Duration: ${cycleDuration}s | Checked: ${itemsChecked} | Changes: ${priceChangesDetected} | Alerts: ${alertsSent} | Errors: ${errorCount}`
    );
    console.log(`[Poller] ==============================================================\n`);

    return {
      success: true,
      ...lastCycleStats,
      message: `Checked ${itemsChecked} item(s) in ${cycleDuration}s. Found ${priceChangesDetected} price change(s) and sent ${alertsSent} alert(s).`,
    };
  } catch (err) {
    console.error('[Poller Fatal Error] Unhandled cycle error:', err.message);
    debugLog(`Poller fatal stack:`, err.stack);
    return {
      success: false,
      error: err.message,
    };
  } finally {
    isPollerRunning = false;
  }
}

/**
 * Returns current poller status, running state, and schedule.
 */
export function getPollerStatus() {
  let nextRunEstimate = null;
  if (autoPollEnabled) {
    const baseTime = lastCycleFinishedAt || lastCycleStartedAt || new Date();
    nextRunEstimate = new Date(baseTime.getTime() + currentIntervalMinutes * 60 * 1000);
  }

  return {
    isRunning: isPollerRunning,
    lastCycleStartedAt,
    lastCycleFinishedAt,
    lastCycleStats,
    autoPollEnabled,
    intervalMinutes: currentIntervalMinutes,
    cronExpression: getCronExpression(currentIntervalMinutes),
    nextRunEstimate,
  };
}

/**
 * Dynamically updates poller scheduler configuration (enable/disable, change interval).
 * @param {Object} config
 * @param {boolean} [config.enabled]
 * @param {number} [config.intervalMinutes]
 */
export function updatePollerConfig({ enabled, intervalMinutes }) {
  if (typeof enabled === 'boolean') {
    autoPollEnabled = enabled;
  }
  if (typeof intervalMinutes === 'number' && intervalMinutes >= 1) {
    currentIntervalMinutes = intervalMinutes;
  }

  // Stop existing cron task if running
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
  }

  // Re-arm cron task if auto-poll is enabled
  if (autoPollEnabled) {
    const cronExpression = getCronExpression(currentIntervalMinutes);
    console.log(
      `[Poller Scheduler] Reconfigured: every ${currentIntervalMinutes}m [Cron: "${cronExpression}"]`
    );
    activeCronTask = cron.schedule(cronExpression, () => {
      debugLog(`Cron schedule "${cronExpression}" triggered at ${new Date().toISOString()}`);
      runPollerCycle().catch(() => {});
    });
  } else {
    console.log(`[Poller Scheduler] Automatic background polling paused.`);
  }

  return getPollerStatus();
}

/**
 * Initializes and starts the background cron scheduler.
 */
export function startPollerScheduler() {
  const startupDelayMs = Math.max(0, ENV.POLL_STARTUP_DELAY_MS ?? 30000);
  const cronExpression = getCronExpression(currentIntervalMinutes);
  const hours = (currentIntervalMinutes / 60).toFixed(1);

  console.log(
    `[Poller Scheduler] Active. Scheduled to run every ${currentIntervalMinutes} minutes (~${hours} hrs) [Cron: "${cronExpression}"]`
  );
  debugLog(
    `Scheduler parameters: intervalMinutes=${currentIntervalMinutes}, cronExpression="${cronExpression}", startupDelayMs=${startupDelayMs}ms, itemDelayMs=${ENV.POLL_ITEM_DELAY_MS}ms, batchSize=${ENV.POLL_BATCH_SIZE}`
  );

  // Run initial cycle after startup delay (prevents instant hammering on server reload)
  if (startupDelayMs > 0) {
    console.log(`[Poller Scheduler] Initial startup price check scheduled in ${startupDelayMs / 1000}s...`);
    setTimeout(() => {
      console.log('[Poller Scheduler] Triggering initial startup price check...');
      runPollerCycle().catch(() => {});
    }, startupDelayMs);
  } else {
    debugLog('Startup immediate cycle check is disabled (POLL_STARTUP_DELAY_MS <= 0).');
  }

  activeCronTask = cron.schedule(cronExpression, () => {
    debugLog(`Cron schedule "${cronExpression}" triggered at ${new Date().toISOString()}`);
    runPollerCycle().catch(() => {});
  });

  return activeCronTask;
}
