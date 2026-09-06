import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { UserModel } from './models/User.js';
import { ItemModel } from './models/Item.js';
import {
  enqueueUserEmail,
  processUserMailQueue,
  processAllPendingMailQueues,
  getUserMailQueue,
  retryFailedUserQueue,
} from './services/mailQueueService.js';

async function runMailQueueTests() {
  console.log('🧪 Starting User Mailing Queue Verification Tests...\n');
  await connectDB();

  let testUser = await UserModel.findOne({ email: 'madhava2807@gmail.com' });
  if (!testUser) {
    console.error('Test user madhava2807@gmail.com not found');
    process.exit(1);
  }

  let sampleItem = await ItemModel.findOne({ externalId: 'B0H6S7QJ2Y' }) || await ItemModel.findOne({});
  if (!sampleItem) {
    console.error('No sample item found in DB');
    process.exit(1);
  }

  // Reset tracking state for clean test run
  const sampleTracking = testUser.trackedItems.find((t) => t.itemId?.toString() === sampleItem._id.toString());
  if (sampleTracking) {
    sampleTracking.lastNotifiedPrice = null;
    sampleTracking.lastNotifiedAt = null;
    await testUser.save();
  }

  let allPassed = true;

  // Test 1: Enqueue an email into user mail queue
  console.log('--- Test 1: enqueueUserEmail ---');
  try {
    const queueJob = await enqueueUserEmail(testUser._id, {
      type: 'price_drop_alert',
      subject: `Test Price Drop Alert: ${sampleItem.title.slice(0, 30)}...`,
      payload: {
        itemId: sampleItem._id,
        itemTitle: sampleItem.title,
        itemUrl: sampleItem.url,
        itemImage: sampleItem.imageUrl,
        platform: sampleItem.platform,
        baselinePrice: 2499,
        currentPrice: 2199,
        dropPercentage: 12,
        savings: 300,
      },
      force: true,
    });

    console.log('Enqueued Job ID:', queueJob._id);
    console.log('Job Status:', queueJob.status);

    if (queueJob && queueJob.status === 'pending') {
      console.log('✅ Test 1 PASSED: Email enqueued with status pending.');
    } else {
      console.error('❌ Test 1 FAILED');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 1 ERROR:', err.message);
    allPassed = false;
  }

  // Test 2: Inspect user queue via getUserMailQueue
  console.log('\n--- Test 2: getUserMailQueue ---');
  try {
    const queueData = await getUserMailQueue(testUser._id);
    console.log('Queue Stats:', queueData.stats);
    console.log('Latest Job in Queue:', queueData.items[0]?.subject, 'Status:', queueData.items[0]?.status);

    if (queueData.stats.pending >= 1) {
      console.log('✅ Test 2 PASSED: Pending queue item found in user mail queue.');
    } else {
      console.error('❌ Test 2 FAILED');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 2 ERROR:', err.message);
    allPassed = false;
  }

  // Test 3: Process the user mail queue
  console.log('\n--- Test 3: processUserMailQueue ---');
  try {
    const result = await processUserMailQueue(testUser._id);
    console.log('Process Result:', result);

    if (result.sent >= 1) {
      console.log('✅ Test 3 PASSED: Email successfully processed and sent from user queue.');
    } else {
      console.error('❌ Test 3 FAILED');
      allPassed = false;
    }

    // Verify user document was updated
    const updatedUser = await UserModel.findById(testUser._id);
    const sentJob = updatedUser.mailQueue.find((j) => j.payload?.itemId?.toString() === sampleItem._id.toString());
    console.log('Job after processing -> status:', sentJob?.status, 'messageId:', sentJob?.messageId, 'sentAt:', sentJob?.sentAt);

    const tracking = updatedUser.trackedItems.find((t) => t.itemId?.toString() === sampleItem._id.toString());
    console.log('Tracking updated -> lastNotifiedPrice:', tracking?.lastNotifiedPrice, 'lastNotifiedAt:', tracking?.lastNotifiedAt);

    if (sentJob?.status === 'sent' && sentJob?.sentAt && tracking?.lastNotifiedPrice === 2199) {
      console.log('✅ Test 3 Verified: Job status marked sent and tracking state updated accordingly!');
    } else {
      console.error('❌ Test 3 State verification failed');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 3 ERROR:', err.message);
    allPassed = false;
  }

  // Test 4: processAllPendingMailQueues sweep
  console.log('\n--- Test 4: processAllPendingMailQueues Sweep ---');
  try {
    const sweep = await processAllPendingMailQueues();
    console.log('Sweep Result:', sweep);
    console.log('✅ Test 4 PASSED: Global queue sweep runs cleanly.');
  } catch (err) {
    console.error('❌ Test 4 ERROR:', err.message);
    allPassed = false;
  }

  // Test 5: Verify Duplicate Prevention (Reject identical alert)
  console.log('\n--- Test 5: Duplicate Prevention Verification ---');
  try {
    const duplicateJob = await enqueueUserEmail(testUser._id, {
      type: 'price_drop_alert',
      subject: `Duplicate Alert: ${sampleItem.title.slice(0, 30)}...`,
      payload: {
        itemId: sampleItem._id,
        currentPrice: 2199, // Same price as lastNotifiedPrice
        baselinePrice: 2499,
        dropPercentage: 12,
      },
      force: false,
    });

    if (duplicateJob === null) {
      console.log('✅ Test 5 PASSED: Duplicate email successfully suppressed and prevented.');
    } else {
      console.error('❌ Test 5 FAILED: Duplicate email was not suppressed!');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 5 ERROR:', err.message);
    allPassed = false;
  }

  await mongoose.disconnect();

  if (allPassed) {
    console.log('\n🎉 ALL USER MAILING QUEUE TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runMailQueueTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
