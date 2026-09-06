import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ItemModel } from '../models/Item.js';
import { scrapeProduct } from '../services/scraper/index.js';

async function testLiveScrapers() {
  await connectDB();
  const platforms = ['amazon', 'flipkart', 'myntra'];

  for (const plat of platforms) {
    const item = await ItemModel.findOne({ platform: plat });
    if (!item) {
      console.log(`No item found for platform: ${plat}`);
      continue;
    }
    console.log(`\nTesting ${plat.toUpperCase()}: "${item.title.slice(0, 30)}..."`);
    console.log(`URL: ${item.url}`);
    try {
      const start = Date.now();
      const res = await scrapeProduct(item.url, plat);
      console.log(`✅ Success in ${Date.now() - start}ms:`);
      console.log(`   Title: ${res.title?.slice(0, 40)}...`);
      console.log(`   Price: ₹${res.currentPrice}, MRP: ₹${res.mrpPrice || 'N/A'}, InStock: ${res.inStock}`);
    } catch (err) {
      console.error(`❌ Failed: ${err.message}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

testLiveScrapers().catch(console.error);
