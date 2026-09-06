import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ItemModel } from '../models/Item.js';
import { UserModel } from '../models/User.js';

async function simulateDrop() {
  await connectDB();

  const targetEmail = process.argv[2] || 'madhava2807@gmail.com';
  const user = await UserModel.findOne({ email: targetEmail });
  if (!user) {
    console.error(`User ${targetEmail} not found in database.`);
    process.exit(1);
  }

  // Find the sample Amazon item (Biggie Bean Bag)
  let item = await ItemModel.findOne({ externalId: 'B0H6S7QJ2Y' });
  if (!item) {
    item = await ItemModel.findOne({ platform: 'amazon' }) || await ItemModel.findOne({});
  }

  if (!item) {
    console.error('No items found in database catalog.');
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🎯 PREPARING PRICE DROP SIMULATION FOR: ${targetEmail}`);
  console.log(`======================================================`);

  // 1. Set Catalog Item currentPrice to ₹2,499 (higher than live scraped price ₹2,199)
  // This ensures the poller detects a fresh price difference: newPrice (2199) !== oldPrice (2499)
  const simulatedOldPrice = 2499;
  await ItemModel.updateOne({ _id: item._id }, { currentPrice: simulatedOldPrice });
  console.log(`1. [Item Catalog] Item "${item.title.slice(0, 30)}..." stored price reset to: ₹${simulatedOldPrice}`);

  // 2. Configure user's trackedItems subdocument
  let tracking = user.trackedItems.find((t) => t.itemId.toString() === item._id.toString());
  if (!tracking) {
    user.trackedItems.push({
      itemId: item._id,
      targetPercentageDrop: 10,
      baseline: 'initial',
      baselinePrice: 2499,
      targetPrice: 2249,
      lastNotifiedPrice: null,
      lastNotifiedAt: null,
    });
    console.log(`2. [User Tracking] Added item to ${targetEmail}'s tracking list.`);
  } else {
    tracking.baselinePrice = 2499;
    tracking.targetPrice = 2249;
    tracking.targetPercentageDrop = 10;
    tracking.lastNotifiedPrice = null; // CRITICAL: resets previous alert price so anti-spam allows it
    tracking.lastNotifiedAt = null;   // CRITICAL: resets cooldown timer
    console.log(`2. [User Tracking] Reset baseline to ₹2,499, target to ₹2,249, and cleared lastNotifiedPrice.`);
  }

  // 3. Clear duplicate records in user's mailQueue for this item so deduplication won't block it
  const initialQueueCount = user.mailQueue?.length || 0;
  user.mailQueue = (user.mailQueue || []).filter(
    (j) => !(j.payload?.itemId && j.payload.itemId.toString() === item._id.toString())
  );
  const clearedCount = initialQueueCount - user.mailQueue.length;
  if (clearedCount > 0) {
    console.log(`3. [Mail Queue] Removed ${clearedCount} past alert(s) for this item to prevent duplicate suppression.`);
  } else {
    console.log(`3. [Mail Queue] Queue clean: no past alerts for this item.`);
  }

  // 4. Ensure email notifications are enabled and set to realtime delivery
  user.notifications = user.notifications || {};
  user.notifications.email = true;
  user.notifications.frequency = 'realtime'; // Immediate delivery instead of 6h/12h batching
  user.notifications.quietHoursStart = '';   // Avoid quiet-hours deferral during testing
  user.notifications.quietHoursEnd = '';

  await user.save();
  console.log(`4. [Notifications] Enabled email alerts, frequency: 'realtime', quiet hours cleared.`);

  console.log('\n======================================================');
  console.log('✅ DATABASE VALUES SUCCESSFULLY CONFIGURED TO TRIGGER MAIL');
  console.log('======================================================');
  console.log(`Recipient User         : ${targetEmail}`);
  console.log(`Product                : ${item.title}`);
  console.log(`DB Stored Price        : ₹${simulatedOldPrice}`);
  console.log(`Tracking Baseline      : ₹2,499`);
  console.log(`Target Price (10% drop): ₹2,249`);
  console.log(`Live Store Scraped Price: ~₹2,199 (Drops by 12% -> Target Exceeded!)`);
  console.log('======================================================');
  console.log('🚀 HOW TO TRIGGER THE EMAIL NOW:');
  console.log('Option A (Dashboard): Click "⚡ Check Prices Now" in the Web Dashboard or Extension.');
  console.log('Option B (Terminal):  Run: npm --workspace=server run test:user');
  console.log('Option C (Global):    Run: node server/src/scripts/test_global_poller.js');
  console.log('======================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

simulateDrop().catch((err) => {
  console.error('Simulation Error:', err);
  process.exit(1);
});
