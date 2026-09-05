import { connectDB } from '../config/db.js';
import { ItemModel } from '../models/Item.js';
import { UserModel } from '../models/User.js';

async function simulateDrop() {
  await connectDB();

  const item = await ItemModel.findOne({ externalId: 'B0H6S7QJ2Y' });
  if (!item) {
    console.error('Item B0H6S7QJ2Y not found in database');
    process.exit(1);
  }

  // 1. Set item currentPrice to ₹2,499
  await ItemModel.updateOne({ _id: item._id }, { currentPrice: 2499 });

  // 2. Set user's baselinePrice to ₹2,499 so that drop to ₹2,199 is 12% (> 10% threshold)
  await UserModel.updateOne(
    { email: 'madhava2807@gmail.com', 'trackedItems.itemId': item._id },
    {
      $set: {
        'trackedItems.$.baselinePrice': 2499,
        'trackedItems.$.targetPrice': 2249,
        'trackedItems.$.lastNotifiedPrice': null,
      },
    }
  );

  console.log('\n======================================================');
  console.log('✅ SIMULATED PRICE DROP READY');
  console.log('======================================================');
  console.log('Product: Biggie Bean Bag (B0H6S7QJ2Y)');
  console.log('Simulated Stored Price : ₹2,499');
  console.log('Tracked Baseline Price : ₹2,499');
  console.log('Target Price for 10%   : ₹2,249');
  console.log('Amazon Live Price      : ₹2,199 (-12% Drop!)');
  console.log('======================================================');
  console.log('👉 Next step: Click "⚡ Check Prices Now" on your Web Dashboard or Extension popup!');
  console.log('======================================================\n');

  process.exit(0);
}

simulateDrop().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
