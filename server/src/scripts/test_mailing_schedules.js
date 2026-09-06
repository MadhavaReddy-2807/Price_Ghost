import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { UserModel } from '../models/User.js';
import { ItemModel } from '../models/Item.js';
import {
  enqueueUserEmail,
  processUserMailQueue,
  processAllPendingMailQueues,
  getUserMailQueue,
  isUserEligibleForScheduledDelivery,
  getLastSentEmailTimestamp,
} from '../services/mailQueueService.js';
import { isInQuietHours } from '../services/priceEngine.js';

async function runMailingScheduleVerification() {
  console.log('🧪 Starting Mailing Schedule & Queue Deferral Verification...\n');

  // -------------------------------------------------------------
  // PART 1: Unit tests on schedule & quiet hour calculation
  // -------------------------------------------------------------
  console.log('--- PART 1: Schedule Eligibility Unit Tests ---');
  let unitPassed = true;

  // 1.1 Overnight quiet hours (22:00 -> 08:00)
  const qhStart = '22:00';
  const qhEnd = '08:00';
  const nightTime = new Date('2026-09-07T23:30:00');
  const dawnTime = new Date('2026-09-07T04:15:00');
  const dayTime = new Date('2026-09-07T14:00:00');

  if (isInQuietHours(qhStart, qhEnd, nightTime) && isInQuietHours(qhStart, qhEnd, dawnTime) && !isInQuietHours(qhStart, qhEnd, dayTime)) {
    console.log('✅ 1.1 Overnight quiet hours correctly evaluated.');
  } else {
    console.error('❌ 1.1 Overnight quiet hours failed.');
    unitPassed = false;
  }

  // 1.2 User with email disabled
  const disabledUser = { notifications: { email: false } };
  const resDisabled = isUserEligibleForScheduledDelivery(disabledUser, dayTime);
  if (!resDisabled.eligible) {
    console.log('✅ 1.2 Disabled email user flagged ineligible.');
  } else {
    console.error('❌ 1.2 Disabled email check failed.');
    unitPassed = false;
  }

  // 1.3 User in quiet hours
  const quietUser = {
    notifications: {
      email: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      frequency: 'realtime',
    },
  };
  const resQuiet = isUserEligibleForScheduledDelivery(quietUser, nightTime);
  if (!resQuiet.eligible && resQuiet.inQuietHours) {
    console.log('✅ 1.3 User in quiet hours deferred with inQuietHours flag.');
  } else {
    console.error('❌ 1.3 Quiet hours deferral failed.');
    unitPassed = false;
  }

  // 1.4 User frequency cooldown check (e.g. 6h cooldown)
  const twoHoursAgo = new Date(dayTime.getTime() - 2 * 60 * 60 * 1000);
  const sevenHoursAgo = new Date(dayTime.getTime() - 7 * 60 * 60 * 1000);

  const batchUserCooldown = {
    notifications: { email: true, frequency: '6h' },
    mailQueue: [
      { status: 'sent', sentAt: twoHoursAgo },
    ],
  };
  const resCooldown = isUserEligibleForScheduledDelivery(batchUserCooldown, dayTime);
  if (!resCooldown.eligible && resCooldown.remainingMinutes > 0) {
    console.log(`✅ 1.4 Cooldown active (${resCooldown.remainingMinutes}m remaining for 6h batch).`);
  } else {
    console.error('❌ 1.4 Cooldown active check failed.');
    unitPassed = false;
  }

  const batchUserReady = {
    notifications: { email: true, frequency: '6h' },
    mailQueue: [
      { status: 'sent', sentAt: sevenHoursAgo },
    ],
  };
  const resReady = isUserEligibleForScheduledDelivery(batchUserReady, dayTime);
  if (resReady.eligible) {
    console.log('✅ 1.5 Batch frequency eligible after cooldown elapsed.');
  } else {
    console.error('❌ 1.5 Cooldown elapsed check failed.');
    unitPassed = false;
  }

  if (!unitPassed) {
    console.error('Unit tests failed.');
    process.exit(1);
  }

  // -------------------------------------------------------------
  // PART 2: Database Integration Tests with Mail Queue
  // -------------------------------------------------------------
  console.log('\n--- PART 2: Database & Mail Queue Integration Tests ---');
  await connectDB();

  const testEmail = 'schedule-test@priceghost.local';
  await UserModel.deleteOne({ email: testEmail });

  // Current hours for active quiet hours
  const now = new Date();
  const startHour = String((now.getHours() - 1 + 24) % 24).padStart(2, '0');
  const endHour = String((now.getHours() + 2) % 24).padStart(2, '0');

  const testUser = await UserModel.create({
    googleId: 'test_schedule_user_123',
    name: 'Schedule Test User',
    email: testEmail,
    role: 'user',
    hasAccess: true,
    notifications: {
      email: true,
      quietHoursStart: `${startHour}:00`,
      quietHoursEnd: `${endHour}:00`,
      frequency: 'realtime',
    },
    trackedItems: [],
    mailQueue: [],
  });

  const sampleItem = await ItemModel.findOne({}) || {
    _id: new mongoose.Types.ObjectId(),
    title: 'Test Product Sample',
    url: 'https://example.com/test',
    imageUrl: 'https://example.com/img.jpg',
    platform: 'amazon',
  };

  // 2.1 Enqueue during quiet hours -> should succeed and create pending job
  console.log('\n[Integration 2.1] Enqueuing drop alert during quiet hours...');
  const job = await enqueueUserEmail(testUser._id, {
    type: 'price_drop_alert',
    subject: 'Scheduled Drop Alert 1',
    payload: {
      itemId: sampleItem._id,
      itemTitle: sampleItem.title,
      itemUrl: sampleItem.url,
      currentPrice: 999,
      baselinePrice: 1500,
      dropPercentage: 33,
      savings: 501,
    },
    force: true,
  });

  if (job && job.status === 'pending') {
    console.log('✅ 2.1 Job enqueued in pending state:', job._id);
  } else {
    console.error('❌ 2.1 Failed to enqueue pending job');
    process.exit(1);
  }

  // 2.2 Process queue without force -> Should defer delivery due to quiet hours
  console.log('\n[Integration 2.2] Processing queue with force: false (quiet hours active)...');
  const deferRes = await processUserMailQueue(testUser._id, { force: false });
  console.log('Result:', deferRes);

  if (deferRes.deferred && deferRes.sent === 0) {
    console.log('✅ 2.2 Correctly deferred delivery due to quiet hours!');
  } else {
    console.error('❌ 2.2 Should have deferred, but got:', deferRes);
    process.exit(1);
  }

  // Verify queue job is STILL pending
  const queueAfterDefer = await getUserMailQueue(testUser._id);
  if (queueAfterDefer.stats.pending === 1) {
    console.log('✅ 2.2 Verified: 1 job remains in pending queue.');
  } else {
    console.error('❌ 2.2 Job status mutated unexpectedly:', queueAfterDefer.stats);
    process.exit(1);
  }

  // 2.3 Global sweep with force: false -> Should defer as well
  console.log('\n[Integration 2.3] Testing global sweep with force: false...');
  const sweepRes = await processAllPendingMailQueues({ force: false });
  console.log('Global sweep result:', sweepRes);
  if (sweepRes.totalDeferred >= 1) {
    console.log('✅ 2.3 Global sweep tracked totalDeferred >= 1.');
  } else {
    console.error('❌ 2.3 Global sweep did not record totalDeferred.');
    process.exit(1);
  }

  // 2.4 Process queue WITH force: true -> Should override quiet hours & send email
  console.log('\n[Integration 2.4] Processing queue with force: true (admin flush / user force)...');
  const forceRes = await processUserMailQueue(testUser._id, { force: true });
  console.log('Force result:', forceRes);

  if (forceRes.sent === 1) {
    console.log('✅ 2.4 Forced processing bypassed quiet hours and sent email!');
  } else {
    console.error('❌ 2.4 Force processing failed:', forceRes);
    process.exit(1);
  }

  // 2.5 Frequency cooldown deferral test
  console.log('\n[Integration 2.5] Testing frequency schedule cooldown...');
  testUser.notifications.quietHoursStart = '';
  testUser.notifications.quietHoursEnd = '';
  testUser.notifications.frequency = '6h';
  await testUser.save();

  // Enqueue a second alert
  const job2 = await enqueueUserEmail(testUser._id, {
    type: 'price_drop_alert',
    subject: 'Scheduled Drop Alert 2 (6h frequency)',
    payload: {
      itemId: sampleItem._id,
      itemTitle: sampleItem.title,
      itemUrl: sampleItem.url,
      currentPrice: 899,
      baselinePrice: 1500,
      dropPercentage: 40,
      savings: 601,
    },
    force: true,
  });

  // Try normal processing -> should defer due to 6h frequency cooldown
  const freqDeferRes = await processUserMailQueue(testUser._id, { force: false });
  console.log('Frequency defer result:', freqDeferRes);
  if (freqDeferRes.deferred && freqDeferRes.reason.includes('6h')) {
    console.log('✅ 2.5 Deferral reason matches 6h frequency schedule!');
  } else {
    console.error('❌ 2.5 Frequency deferral failed:', freqDeferRes);
    process.exit(1);
  }

  // Clean up test user
  await UserModel.deleteOne({ email: testEmail });
  await mongoose.disconnect();

  console.log('\n🎉 ALL MAILING SCHEDULE & DEFERRAL TESTS PASSED PERFECTLY!\n');
  process.exit(0);
}

runMailingScheduleVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
