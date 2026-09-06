import { UserModel } from '../models/User.js';
import { sendPriceDropEmail } from './emailService.js';
import { isUserEligibleForScheduledDelivery, getLastSentEmailTimestamp } from './priceEngine.js';

export { isUserEligibleForScheduledDelivery, getLastSentEmailTimestamp };

const activeUserLocks = new Set();
let activeQueueWorkerInterval = null;
let isQueueWorkerRunning = false;
let queueWorkerIntervalMs = 60000; // Default frequency: every 60 seconds (1 minute)
let lastQueueWorkerRunAt = null;

/**
 * Adds an email notification to a user's persistent mail queue.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {Object} options
 * @param {'price_drop_alert'|'welcome'|'system'} [options.type='price_drop_alert']
 * @param {string} options.subject
 * @param {Object} options.payload
 * @param {boolean} [options.force=false]
 * @returns {Promise<Object>} Created or updated mail queue item
 */
export async function enqueueUserEmail(userId, { type = 'price_drop_alert', subject, payload = {}, force = false }) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error(`Cannot enqueue email: User ${userId} not found.`);
  }

  if (user.notifications?.email === false) {
    console.log(`[Mail Queue] User ${user.email} has disabled email alerts. Skipping enqueue.`);
    return null;
  }

  // Deduplicate 1: If an alert for the same product is already pending or processing, update its payload
  const existingActive = user.mailQueue.find(
    (job) =>
      (job.status === 'pending' || job.status === 'processing') &&
      job.payload?.itemId &&
      job.payload.itemId.toString() === payload.itemId?.toString()
  );

  if (existingActive) {
    existingActive.subject = subject || existingActive.subject;
    existingActive.payload = { ...(existingActive.payload.toObject?.() || existingActive.payload), ...payload };
    existingActive.queuedAt = new Date();
    await user.save();
    console.log(`[Mail Queue] 🔄 Updated existing ${existingActive.status} queue item for ${user.email}: "${subject}"`);
    return existingActive;
  }

  // Deduplicate 2: Check tracking record's lastNotifiedPrice - avoid duplicate if currentPrice >= lastNotifiedPrice
  const tracking = user.trackedItems.find(
    (t) => t.itemId?.toString() === payload.itemId?.toString()
  );
  if (!force && tracking && tracking.lastNotifiedPrice !== undefined && tracking.lastNotifiedPrice !== null) {
    if (payload.currentPrice >= tracking.lastNotifiedPrice) {
      console.log(
        `[Mail Queue] 🛑 Duplicate prevented: currentPrice ₹${payload.currentPrice} >= lastNotifiedPrice ₹${tracking.lastNotifiedPrice} for ${user.email}`
      );
      return null;
    }
  }

  // Deduplicate 3: Check if an identical alert was already sent at this price or lower
  const identicalSent = user.mailQueue.find(
    (job) =>
      job.status === 'sent' &&
      job.payload?.itemId &&
      job.payload.itemId.toString() === payload.itemId?.toString() &&
      job.payload.currentPrice <= payload.currentPrice
  );
  if (!force && identicalSent) {
    console.log(
      `[Mail Queue] 🛑 Duplicate prevented: alert already sent to ${user.email} at ₹${identicalSent.payload?.currentPrice} for item ${payload.itemId}`
    );
    return null;
  }

  const queueItem = {
    type,
    status: 'pending',
    recipient: user.email,
    subject: subject || 'Price Ghost Alert',
    payload: {
      itemId: payload.itemId,
      itemTitle: payload.itemTitle || 'Tracked Product',
      itemUrl: payload.itemUrl,
      itemImage: payload.itemImage,
      platform: payload.platform,
      baselinePrice: payload.baselinePrice,
      currentPrice: payload.currentPrice,
      dropPercentage: payload.dropPercentage,
      savings: payload.savings,
    },
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    queuedAt: new Date(),
    sentAt: null,
    messageId: null,
  };

  user.mailQueue.push(queueItem);

  // Keep queue history tidy by capping at 100 entries per user
  if (user.mailQueue.length > 100) {
    user.mailQueue = user.mailQueue.slice(-100);
  }

  await user.save();
  const createdItem = user.mailQueue[user.mailQueue.length - 1];
  console.log(`[Mail Queue] 📥 Enqueued "${createdItem.subject}" (Job ID: ${createdItem._id}) for ${user.email}`);

  return createdItem;
}

/**
 * Processes all pending emails in a user's mail queue and updates tracking state accordingly.
 * Checks quiet hours and user-configured frequency schedule unless force=true.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {Object} [options={}]
 * @param {boolean} [options.force=false]
 * @returns {Promise<{ processed: number, sent: number, failed: number, deferred?: boolean, reason?: string }>}
 */
export async function processUserMailQueue(userId, options = {}) {
  const { force = false } = options;
  const lockKey = userId.toString();
  if (activeUserLocks.has(lockKey)) {
    console.log(`[Mail Queue] ⏳ Queue already being processed for user ${lockKey}, skipping concurrent run.`);
    return { processed: 0, sent: 0, failed: 0 };
  }

  activeUserLocks.add(lockKey);

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    if (user.notifications?.email === false) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    const pendingJobs = (user.mailQueue || []).filter((job) => job.status === 'pending');
    if (pendingJobs.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    // Evaluate mailing schedule and quiet hours (unless forced by manual trigger)
    if (!force) {
      const eligibility = isUserEligibleForScheduledDelivery(user);
      if (!eligibility.eligible) {
        console.log(`[Mail Queue] ⏳ Delivery deferred for ${user.email}: ${eligibility.reason}`);
        return {
          processed: 0,
          sent: 0,
          failed: 0,
          deferred: true,
          reason: eligibility.reason,
          pendingCount: pendingJobs.length,
        };
      }
    }

    console.log(`[Mail Queue] 🚀 Processing ${pendingJobs.length} pending email(s) for ${user.email}...`);

    let sentCount = 0;
    let failedCount = 0;

    for (const job of pendingJobs) {
      job.status = 'processing';
      job.attempts = (job.attempts || 0) + 1;

      try {
        if (job.type === 'price_drop_alert') {
          // In-flight deduplication 1: verify that currentPrice is strictly lower than lastNotifiedPrice
          const trackingCheck = user.trackedItems.find(
            (t) => t.itemId?.toString() === job.payload?.itemId?.toString()
          );
          if (
            trackingCheck &&
            trackingCheck.lastNotifiedPrice !== undefined &&
            trackingCheck.lastNotifiedPrice !== null &&
            job.payload?.currentPrice >= trackingCheck.lastNotifiedPrice
          ) {
            console.log(
              `[Mail Queue] 🛑 Duplicate suppressed for ${user.email}: price ₹${job.payload?.currentPrice} >= lastNotifiedPrice ₹${trackingCheck.lastNotifiedPrice}`
            );
            job.status = 'sent';
            job.sentAt = new Date();
            job.messageId = 'SUPPRESSED_DUPLICATE';
            job.lastError = 'Duplicate email suppressed: price not lower than last notified';
            continue;
          }

          // In-flight deduplication 2: verify no previously sent queue entry exists at same or lower price
          const alreadySent = user.mailQueue.find(
            (j) =>
              j._id.toString() !== job._id.toString() &&
              j.status === 'sent' &&
              j.payload?.itemId?.toString() === job.payload?.itemId?.toString() &&
              j.payload?.currentPrice <= job.payload?.currentPrice
          );

          if (alreadySent) {
            console.log(
              `[Mail Queue] 🛑 Duplicate suppressed for ${user.email}: alert already sent at ₹${alreadySent.payload?.currentPrice}`
            );
            job.status = 'sent';
            job.sentAt = new Date();
            job.messageId = 'SUPPRESSED_DUPLICATE';
            job.lastError = 'Duplicate email suppressed: item already alerted at this price or lower';
            continue;
          }

          const emailResult = await sendPriceDropEmail({
            user: { name: user.name, email: user.email },
            item: {
              _id: job.payload.itemId,
              title: job.payload.itemTitle,
              url: job.payload.itemUrl,
              imageUrl: job.payload.itemImage,
              platform: job.payload.platform,
            },
            dropPercentage: job.payload.dropPercentage,
            baselinePrice: job.payload.baselinePrice,
            currentPrice: job.payload.currentPrice,
            savings: job.payload.savings,
          });

          if (emailResult && emailResult.success) {
            job.status = 'sent';
            job.sentAt = new Date();
            job.messageId = emailResult.messageId || 'MOCKED';
            job.lastError = null;
            sentCount++;

            // Update user's tracking record accordingly
            const tracking = user.trackedItems.find(
              (t) => t.itemId?.toString() === job.payload?.itemId?.toString()
            );
            if (tracking) {
              tracking.lastNotifiedAt = new Date();
              tracking.lastNotifiedPrice = job.payload.currentPrice;
            }

            console.log(
              `[Mail Queue] ✅ Sent "${job.subject}" to ${user.email} (Message ID: ${job.messageId})`
            );
          } else {
            throw new Error(emailResult?.error || 'Email delivery failed');
          }
        } else {
          // Generic or system mail
          job.status = 'sent';
          job.sentAt = new Date();
          sentCount++;
        }
      } catch (err) {
        failedCount++;
        job.lastError = err.message;
        if (job.attempts >= (job.maxAttempts || 3)) {
          job.status = 'failed';
          console.error(
            `[Mail Queue] ❌ Delivery permanently failed for ${user.email} after ${job.attempts} attempts: ${err.message}`
          );
        } else {
          job.status = 'pending'; // Leave pending for retry
          console.warn(
            `[Mail Queue] ⚠️ Delivery deferred for ${user.email} (Attempt ${job.attempts}/${job.maxAttempts}): ${err.message}`
          );
        }
      }
    }

    await user.save();
    return { processed: pendingJobs.length, sent: sentCount, failed: failedCount };
  } finally {
    activeUserLocks.delete(lockKey);
  }
}

/**
 * Scans and processes pending mail queues for all users.
 * Respects each user's mailing schedule and quiet hours unless force=true.
 *
 * @param {Object} [options={}]
 * @param {boolean} [options.force=false]
 */
export async function processAllPendingMailQueues(options = {}) {
  const { force = false } = options;
  const usersWithPending = await UserModel.find({
    'mailQueue.status': 'pending',
    'notifications.email': true,
  });

  if (usersWithPending.length === 0) {
    return { totalUsers: 0, totalProcessed: 0, totalSent: 0, totalFailed: 0, totalDeferred: 0 };
  }

  console.log(`[Mail Queue Worker] Found ${usersWithPending.length} user(s) with pending emails.`);

  let totalProcessed = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let totalDeferred = 0;

  for (const user of usersWithPending) {
    const res = await processUserMailQueue(user._id, { force });
    totalProcessed += res.processed || 0;
    totalSent += res.sent || 0;
    totalFailed += res.failed || 0;
    if (res.deferred) totalDeferred++;
  }

  return {
    totalUsers: usersWithPending.length,
    totalProcessed,
    totalSent,
    totalFailed,
    totalDeferred,
  };
}

/**
 * Retrieves the mail queue for a specific user with stats.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {number} [limit=50]
 */
export async function getUserMailQueue(userId, limit = 50) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const queue = user.mailQueue || [];
  const sorted = [...queue].reverse().slice(0, limit);

  const stats = {
    total: queue.length,
    pending: queue.filter((j) => j.status === 'pending').length,
    sent: queue.filter((j) => j.status === 'sent').length,
    failed: queue.filter((j) => j.status === 'failed').length,
  };

  return {
    stats,
    items: sorted,
  };
}

/**
 * Retries failed items in a user's mail queue.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string} [queueItemId] - Specific queue item ID, or all if omitted
 */
export async function retryFailedUserQueue(userId, queueItemId = null) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  let resetCount = 0;
  for (const job of user.mailQueue) {
    if (job.status === 'failed' && (!queueItemId || job._id.toString() === queueItemId)) {
      job.status = 'pending';
      job.attempts = 0;
      job.lastError = null;
      resetCount++;
    }
  }

  if (resetCount > 0) {
    await user.save();
    console.log(`[Mail Queue] Reset ${resetCount} failed email(s) to pending for ${user.email}. Processing now...`);
    const processResult = await processUserMailQueue(user._id, { force: true });
    return { resetCount, ...processResult };
  }

  return { resetCount: 0, processed: 0, sent: 0, failed: 0 };
}

/**
 * Starts the lightweight background Mail Queue Worker.
 * Periodically sweeps for pending email jobs and delivers them quickly.
 *
 * @param {number} [intervalMs=60000] Interval in milliseconds (default: 60s)
 */
export function startMailQueueWorker(intervalMs = 60000) {
  if (activeQueueWorkerInterval) {
    clearInterval(activeQueueWorkerInterval);
  }

  queueWorkerIntervalMs = Math.max(5000, intervalMs);
  console.log(
    `[Mail Queue Worker] 🚀 Background worker active (Checking every ${queueWorkerIntervalMs / 1000}s)`
  );

  activeQueueWorkerInterval = setInterval(async () => {
    if (isQueueWorkerRunning) return;
    isQueueWorkerRunning = true;
    lastQueueWorkerRunAt = new Date();

    try {
      await processAllPendingMailQueues();
    } catch (err) {
      console.error('[Mail Queue Worker Error]', err.message);
    } finally {
      isQueueWorkerRunning = false;
    }
  }, queueWorkerIntervalMs);

  if (activeQueueWorkerInterval.unref) {
    activeQueueWorkerInterval.unref();
  }
}

/**
 * Stops the background Mail Queue Worker.
 */
export function stopMailQueueWorker() {
  if (activeQueueWorkerInterval) {
    clearInterval(activeQueueWorkerInterval);
    activeQueueWorkerInterval = null;
    console.log('[Mail Queue Worker] ⏹️ Stopped background worker.');
  }
}

/**
 * Returns current status of the Mail Queue Worker.
 */
export function getMailQueueWorkerStatus() {
  return {
    isRunning: isQueueWorkerRunning,
    intervalMs: queueWorkerIntervalMs,
    intervalSeconds: queueWorkerIntervalMs / 1000,
    hasActiveTimer: !!activeQueueWorkerInterval,
    lastRunAt: lastQueueWorkerRunAt,
  };
}

/**
 * Dynamically updates Mail Queue Worker frequency and enabled status.
 *
 * @param {Object} options
 * @param {number} [options.intervalMs]
 * @param {boolean} [options.enabled]
 */
export function updateMailQueueWorkerConfig({ intervalMs, enabled }) {
  if (typeof intervalMs === 'number' && intervalMs >= 5000) {
    queueWorkerIntervalMs = intervalMs;
  }

  if (enabled === false) {
    stopMailQueueWorker();
  } else if (enabled === true || (enabled === undefined && activeQueueWorkerInterval)) {
    startMailQueueWorker(queueWorkerIntervalMs);
  }

  return getMailQueueWorkerStatus();
}
