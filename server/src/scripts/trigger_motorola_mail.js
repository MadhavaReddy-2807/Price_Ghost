import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ItemModel } from '../models/Item.js';
import { UserModel } from '../models/User.js';
import { enqueueUserEmail, processUserMailQueue } from '../services/mailQueueService.js';
import { calculateDropPercentage } from '../services/priceEngine.js';

async function triggerMotorolaMail() {
  console.log('================================================================');
  console.log('🚀 TRIGGERING PRICE DROP EMAIL FOR MOTOROLA G06 POWER (37% DROP)');
  console.log('================================================================\n');

  await connectDB();

  const itemId = '6a9dbb3e34cfdce6aa7b6d1e';
  const targetEmail = 'madhava2807@gmail.com';

  const item = await ItemModel.findById(itemId);
  if (!item) {
    console.error(`❌ Item ${itemId} not found in database!`);
    process.exit(1);
  }

  const user = await UserModel.findOne({ email: targetEmail });
  if (!user) {
    console.error(`❌ User ${targetEmail} not found!`);
    process.exit(1);
  }

  // Tracking subdocument parameters specified by user:
  const baselinePrice = 15999;
  const targetPercentageDrop = 37;
  // Calculate a dropped price that satisfies >= 37% drop:
  // e.g. ₹9,999 -> (15999 - 9999) / 15999 = 37.50% drop!
  const newDroppedPrice = 9999;
  const dropPercentage = parseFloat(calculateDropPercentage(baselinePrice, newDroppedPrice));
  const savings = baselinePrice - newDroppedPrice;

  console.log('📦 Product Details:');
  console.log(`- Title           : ${item.title}`);
  console.log(`- Platform        : ${item.platform}`);
  console.log(`- Item ID         : ${item._id}`);
  console.log(`- Baseline Price  : ₹${baselinePrice}`);
  console.log(`- Target Drop %   : ${targetPercentageDrop}%`);
  console.log(`- New Alert Price : ₹${newDroppedPrice} (-${dropPercentage}% drop)`);
  console.log(`- Total Savings   : ₹${savings}`);
  console.log(`- Recipient       : ${user.email} (${user.name})`);

  // 1. Update the canonical item in DB to reflect the dropped price
  item.currentPrice = newDroppedPrice;
  item.lowestPrice = Math.min(item.lowestPrice || baselinePrice, newDroppedPrice);
  item.lastPriceChangeAt = new Date();
  item.lastCheckedAt = new Date();
  item.priceHistory.push({ price: newDroppedPrice, timestamp: new Date() });
  await item.save();
  console.log('\n✅ 1. Item catalog price updated to ₹9,999 in MongoDB.');

  // 2. Update user's tracking subdocument
  let tracking = user.trackedItems.find((t) => t.itemId.toString() === itemId);
  if (!tracking) {
    user.trackedItems.push({
      itemId: item._id,
      targetPercentageDrop,
      baseline: 'initial',
      baselinePrice,
      targetPrice: 10079.37,
      createdAt: new Date('2026-09-06T19:13:02.809Z'),
      lastNotifiedPrice: null,
      lastNotifiedAt: null,
    });
    tracking = user.trackedItems[user.trackedItems.length - 1];
  } else {
    tracking.baselinePrice = baselinePrice;
    tracking.targetPercentageDrop = targetPercentageDrop;
    tracking.targetPrice = 10079.37;
    tracking.lastNotifiedPrice = null; // Clear so alert is delivered
    tracking.lastNotifiedAt = null;
  }

  // Ensure email notifications are enabled and realtime
  user.notifications = user.notifications || {};
  user.notifications.email = true;
  user.notifications.frequency = 'realtime';
  user.notifications.quietHoursStart = '';
  user.notifications.quietHoursEnd = '';
  await user.save();
  console.log('✅ 2. User tracking preferences configured for 37% drop threshold.');

  // 3. Enqueue the email into the user's mail queue
  console.log('\n📬 3. Enqueuing email alert into user mail queue...');
  const queueJob = await enqueueUserEmail(user._id, {
    type: 'price_drop_alert',
    subject: `📉 Price Drop Alert: "${item.title.slice(0, 40)}..." dropped to ₹${newDroppedPrice.toLocaleString('en-IN')}! (-${dropPercentage}%)`,
    payload: {
      itemId: item._id,
      itemTitle: item.title,
      itemUrl: item.url,
      itemImage: item.imageUrl,
      platform: item.platform,
      baselinePrice,
      currentPrice: newDroppedPrice,
      dropPercentage,
      savings,
    },
    force: true,
  });

  console.log(`✅ Email enqueued! Job ID: ${queueJob?._id}, Status: ${queueJob?.status}`);

  // 4. Immediately process the mail queue to dispatch via Gmail SMTP
  console.log('\n🚀 4. Processing queue and dispatching email via Gmail SMTP...');
  const processResult = await processUserMailQueue(user._id, { force: true });
  console.log('Delivery Result:', processResult);

  if (processResult.sent >= 1) {
    console.log('\n================================================================');
    console.log(`🎉 SUCCESS: Alert email dispatched to ${targetEmail}!`);
    console.log(`Check your inbox for: "${item.title.slice(0, 40)}..."`);
    console.log('================================================================\n');
  } else {
    console.warn('\n⚠️ Mail processing returned 0 sent items:', processResult);
  }

  await mongoose.disconnect();
  process.exit(0);
}

triggerMotorolaMail().catch((err) => {
  console.error('Fatal Trigger Error:', err);
  process.exit(1);
});
