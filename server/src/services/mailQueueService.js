import { UserModel } from '../models/User.js';
import { sendPriceDropEmail } from './emailService.js';

/**
 * Adds an email notification to a user's persistent mail queue.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {Object} options
 * @param {'price_drop_alert'|'welcome'|'system'} [options.type='price_drop_alert']
 * @param {string} options.subject
 * @param {Object} options.payload
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

  // Deduplicate 1: If an alert for the same product is already pending, update its payload
  const existingPending = user.mailQueue.find(
    (job) =>
      job.status === 'pending' &&
      job.payload?.itemId &&
      job.payload.itemId.toString() === payload.itemId?.toString()
  );

  if (existingPending) {
    existingPending.subject = subject || existingPending.subject;
    existingPending.payload = { ...existingPending.payload.toObject?.() || existingPending.payload, ...payload };
    existingPending.queuedAt = new Date();
    await user.save();
    console.log(`[Mail Queue] 🔄 Updated existing pending queue item for ${user.email}: "${subject}"`);
    return existingPending;
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

  // Deduplicate 3: Check if identical alert was already sent within the last 24 hours
  const recentSent = user.mailQueue.find(
    (job) =>
      job.status === 'sent' &&
      job.payload?.itemId &&
      job.payload.itemId.toString() === payload.itemId?.toString() &&
      job.payload.currentPrice === payload.currentPrice &&
      job.sentAt &&
      (Date.now() - new Date(job.sentAt).getTime()) < 24 * 60 * 60 * 1000
  );
  if (!force && recentSent) {
    console.log(
      `[Mail Queue] 🛑 Duplicate prevented: identical alert already sent to ${user.email} within 24h at ₹${payload.currentPrice}`
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
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {Promise<{ processed: number, sent: number, failed: number }>}
 */
export async function processUserMailQueue(userId) {
  const user = await UserModel.findById(userId);
  if (!user) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  if (user.notifications?.email === false) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const pendingJobs = user.mailQueue.filter((job) => job.status === 'pending');
  if (pendingJobs.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  console.log(`[Mail Queue] 🚀 Processing ${pendingJobs.length} pending email(s) for ${user.email}...`);

  let sentCount = 0;
  let failedCount = 0;

  for (const job of pendingJobs) {
    job.status = 'processing';
    job.attempts = (job.attempts || 0) + 1;

    try {
      if (job.type === 'price_drop_alert') {
        // In-flight deduplication: verify that an alert hasn't already been sent at this price or lower within 1h
        const trackingCheck = user.trackedItems.find(
          (t) => t.itemId?.toString() === job.payload?.itemId?.toString()
        );
        if (
          trackingCheck &&
          trackingCheck.lastNotifiedPrice !== undefined &&
          trackingCheck.lastNotifiedPrice !== null &&
          job.payload?.currentPrice >= trackingCheck.lastNotifiedPrice &&
          trackingCheck.lastNotifiedAt &&
          (Date.now() - new Date(trackingCheck.lastNotifiedAt).getTime()) < 60 * 60 * 1000
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
}

/**
 * Scans and processes pending mail queues for all users.
 * Useful for scheduled queue workers and end-of-poller-cycle sweeps.
 */
export async function processAllPendingMailQueues() {
  const usersWithPending = await UserModel.find({
    'mailQueue.status': 'pending',
    'notifications.email': true,
  });

  if (usersWithPending.length === 0) {
    return { totalUsers: 0, totalProcessed: 0, totalSent: 0, totalFailed: 0 };
  }

  console.log(`[Mail Queue Worker] Found ${usersWithPending.length} user(s) with pending emails.`);

  let totalProcessed = 0;
  let totalSent = 0;
  let totalFailed = 0;

  for (const user of usersWithPending) {
    const res = await processUserMailQueue(user._id);
    totalProcessed += res.processed;
    totalSent += res.sent;
    totalFailed += res.failed;
  }

  return {
    totalUsers: usersWithPending.length,
    totalProcessed,
    totalSent,
    totalFailed,
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
    const processResult = await processUserMailQueue(user._id);
    return { resetCount, ...processResult };
  }

  return { resetCount: 0, processed: 0, sent: 0, failed: 0 };
}
