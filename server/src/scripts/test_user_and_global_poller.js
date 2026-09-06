import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { UserModel } from '../models/User.js';
import { ItemModel } from '../models/Item.js';
import { checkUserPrices, runPollerCycle, getPollerStatus } from '../services/poller.js';
import { processUserMailQueue } from '../services/mailQueueService.js';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 VERIFYING USER-ISOLATED POLLER & GLOBAL POLLER FOR ALL ITEMS');
  console.log('================================================================\n');

  await connectDB();

  const sathwik = await UserModel.findOne({ email: 'sathwikadithya02@gmail.com' });
  const madhava = await UserModel.findOne({ email: 'madhava2807@gmail.com' });

  if (!sathwik || !madhava) {
    console.error('Missing test users in DB');
    process.exit(1);
  }

  console.log(`User 1: ${sathwik.email} (${sathwik.trackedItems?.length} items)`);
  console.log(`User 2: ${madhava.email} (${madhava.trackedItems?.length} items)`);

  // 1. Retry failed mail queue items for Sathwik
  console.log('\n--- 1. Resetting and Retrying Sathwik\'s Failed Email Alert ---');
  let resetCount = 0;
  sathwik.mailQueue.forEach((job) => {
    if (job.status === 'failed') {
      job.status = 'pending';
      job.attempts = 0;
      job.lastError = null;
      resetCount++;
    }
  });
  if (resetCount > 0) {
    await sathwik.save();
    console.log(`Reset ${resetCount} failed job(s) for ${sathwik.email}. Processing queue now...`);
    const qRes = await processUserMailQueue(sathwik._id);
    console.log(`Mail queue processing result:`, qRes);
  } else {
    console.log('No failed jobs found for Sathwik.');
  }

  // 2. Test User-Isolated Price Check for Sathwik
  console.log('\n--- 2. Testing Isolated Price Check for Sathwik ---');
  const user1Result = await checkUserPrices(sathwik._id, { itemDelayMs: 500 });
  console.log('Sathwik check result:', {
    success: user1Result.success,
    itemsChecked: user1Result.itemsChecked,
    totalUserItems: user1Result.totalUserItems,
    durationSeconds: user1Result.durationSeconds,
  });

  const statusAfterUser1 = getPollerStatus();
  console.log('Global poller isRunning after user check:', statusAfterUser1.isRunning);

  // 3. Test Concurrent User Checks (Sathwik & Madhava)
  console.log('\n--- 3. Testing Parallel Price Checks for Multiple Users ---');
  console.log('Launching checkUserPrices for Sathwik AND Madhava simultaneously...');
  const [p1, p2] = await Promise.all([
    checkUserPrices(sathwik._id, { itemDelayMs: 300 }),
    checkUserPrices(madhava._id, { itemDelayMs: 300 }),
  ]);

  console.log('✅ Sathwik result:', { success: p1.success, itemsChecked: p1.itemsChecked });
  console.log('✅ Madhava result:', { success: p2.success, itemsChecked: p2.itemsChecked });

  // 4. Test Global Poller across all items
  console.log('\n--- 4. Testing Global Poller across ALL active tracked items ---');
  const totalTrackedItems = await ItemModel.countDocuments({
    $or: [{ trackerCount: { $gt: 0 } }, { trackerCount: { $exists: false } }],
  });
  console.log(`Total active tracked items in DB: ${totalTrackedItems}`);

  // Test global run with polite 200ms delay for quick verification
  const globalResult = await runPollerCycle({
    all: true,
    itemDelayMs: 200,
  });

  console.log('Global Poller result:', {
    success: globalResult.success,
    itemsChecked: globalResult.itemsChecked,
    priceChangesDetected: globalResult.priceChangesDetected,
    alertsSent: globalResult.alertsSent,
    durationSeconds: globalResult.durationSeconds,
  });

  console.log('\n================================================================');
  console.log('🎉 ALL USER-ISOLATION & GLOBAL POLLER VERIFICATIONS COMPLETED!');
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test Error:', err);
  process.exit(1);
});
