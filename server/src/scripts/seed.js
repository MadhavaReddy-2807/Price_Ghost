import mongoose from 'mongoose';
import { ItemModel } from '../models/Item.js';
import { UserModel } from '../models/User.js';
import { connectDB } from '../config/db.js';
import { calculateTargetPrice } from '../services/priceEngine.js';

function generatePriceHistory(days, basePrice, dropDaysAgo, finalPrice) {
  const history = [];
  const now = Date.now();

  for (let i = days; i >= 0; i--) {
    const timestamp = new Date(now - i * 24 * 60 * 60 * 1000);
    let price = basePrice;

    if (i <= dropDaysAgo) {
      price = finalPrice;
    } else {
      // Small realistic fluctuations (+- 200)
      const fluctuation = (Math.sin(i) * 150);
      price = Math.round((basePrice + fluctuation) / 10) * 10;
    }

    history.push({ price, timestamp });
  }
  return history;
}

async function seed() {
  console.log('[Seeder] Connecting to database...');
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    console.error('[Seeder Aborted] Database is not connected.');
    process.exit(1);
  }

  console.log('[Seeder] Populating demo products...');

  // 1. Sony WH-1000XM5 Headphones (Amazon) - Dropped 17.8%
  const sonyHistory = generatePriceHistory(30, 27990, 2, 22990);
  const sonyItem = await ItemModel.findOneAndUpdate(
    { uniqueKey: 'amazon:B09XS7JWHH' },
    {
      platform: 'amazon',
      externalId: 'B09XS7JWHH',
      uniqueKey: 'amazon:B09XS7JWHH',
      title: 'Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones',
      url: 'https://www.amazon.in/dp/B09XS7JWHH',
      imageUrl: 'https://m.media-amazon.com/images/I/61+Elflqn+L._SL1500_.jpg',
      currency: 'INR',
      currentPrice: 22990,
      mrpPrice: 34990,
      lowestPrice: 22990,
      highestPrice: 28490,
      inStock: true,
      priceHistory: sonyHistory,
      trackerCount: 1,
      lastCheckedAt: new Date(),
      lastPriceChangeAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    { upsert: true, new: true }
  );

  // 2. Apple iPhone 15 128GB (Flipkart) - Watching
  const iphoneHistory = generatePriceHistory(30, 72999, 10, 70999);
  const iphoneItem = await ItemModel.findOneAndUpdate(
    { uniqueKey: 'flipkart:MOBGTAGPTB3VSYX4' },
    {
      platform: 'flipkart',
      externalId: 'MOBGTAGPTB3VSYX4',
      uniqueKey: 'flipkart:MOBGTAGPTB3VSYX4',
      title: 'Apple iPhone 15 (Black, 128 GB)',
      url: 'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VSYX4',
      imageUrl: 'https://rukminim2.flixcart.com/image/832/832/xif0q/mobile/h/d/9/-original-imagtc2qzgnnuhxh.jpeg',
      currency: 'INR',
      currentPrice: 70999,
      mrpPrice: 79900,
      lowestPrice: 70999,
      highestPrice: 74999,
      inStock: true,
      priceHistory: iphoneHistory,
      trackerCount: 1,
      lastCheckedAt: new Date(),
      lastPriceChangeAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
    { upsert: true, new: true }
  );

  // 3. Nike Air Zoom Pegasus 40 (Myntra) - Dropped 19.1%
  const nikeHistory = generatePriceHistory(30, 10495, 1, 8495);
  const nikeItem = await ItemModel.findOneAndUpdate(
    { uniqueKey: 'myntra:23821094' },
    {
      platform: 'myntra',
      externalId: '23821094',
      uniqueKey: 'myntra:23821094',
      title: 'Nike Men Air Zoom Pegasus 40 Road Running Shoes',
      url: 'https://www.myntra.com/sports-shoes/nike/nike-men-air-zoom-pegasus-40-road-running-shoes/23821094/buy',
      imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/23821094/2023/7/1/c2937748-038c-426b-bbd7-1335bfcbcf3a1688203525287-Nike-Air-Zoom-Pegasus-40-Road-Running-Shoes-1081688203524949-1.jpg',
      currency: 'INR',
      currentPrice: 8495,
      mrpPrice: 11895,
      lowestPrice: 8495,
      highestPrice: 10495,
      inStock: true,
      priceHistory: nikeHistory,
      trackerCount: 1,
      lastCheckedAt: new Date(),
      lastPriceChangeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    { upsert: true, new: true }
  );

  // 4. Create Demo User
  console.log('[Seeder] Creating demo user...');
  const demoEmail = 'demo@pricetracker.local';
  
  const demoUser = await UserModel.findOneAndUpdate(
    { email: demoEmail },
    {
      googleId: 'dev_demo@pricetracker.local',
      email: demoEmail,
      name: 'Demo User',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=DemoUser',
      notifications: {
        email: true,
        frequency: 'realtime',
        defaultThreshold: 10,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      },
      extensionInstalled: true,
      trackedItems: [
        {
          itemId: sonyItem._id,
          targetPercentageDrop: 15,
          baseline: 'initial',
          baselinePrice: 27990,
          targetPrice: calculateTargetPrice(27990, 15),
          lastNotifiedAt: new Date(),
          lastNotifiedPrice: 22990,
          createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        },
        {
          itemId: iphoneItem._id,
          targetPercentageDrop: 10,
          baseline: 'initial',
          baselinePrice: 72999,
          targetPrice: calculateTargetPrice(72999, 10),
          createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        },
        {
          itemId: nikeItem._id,
          targetPercentageDrop: 15,
          baseline: 'initial',
          baselinePrice: 10495,
          targetPrice: calculateTargetPrice(10495, 15),
          lastNotifiedAt: new Date(),
          lastNotifiedPrice: 8495,
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        },
      ],
    },
    { upsert: true, new: true }
  );

  console.log('\n======================================================');
  console.log('🎉 [Seeder] Database successfully populated!');
  console.log(`👤 Demo User Email: ${demoUser.email}`);
  console.log(`📦 Seeded Products: 3 (Sony XM5, iPhone 15, Nike Pegasus 40)`);
  console.log(`📉 Active Price Drops: 2 (Sony XM5 -17.8%, Nike Pegasus -19.1%)`);
  console.log('======================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seeder Error]', err);
  process.exit(1);
});
