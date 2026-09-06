import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ItemModel } from '../models/Item.js';
import { UserModel } from '../models/User.js';

async function check() {
  await connectDB();
  const itemCount = await ItemModel.countDocuments();
  const userCount = await UserModel.countDocuments();
  const items = await ItemModel.find({}, 'title platform currentPrice trackerCount lastCheckedAt');
  const users = await UserModel.find({}, 'email name trackedItems');

  console.log(`\nDB State:`);
  console.log(`Total items in DB: ${itemCount}`);
  console.log(`Total users in DB: ${userCount}`);
  console.log('\nUsers:');
  users.forEach(u => {
    console.log(`- User: ${u.email} (${u.name}), tracked count: ${u.trackedItems?.length || 0}`);
    u.trackedItems?.forEach(t => {
      console.log(`   -> Item ID: ${t.itemId}, baselinePrice: ${t.baselinePrice}, targetPrice: ${t.targetPrice}`);
    });
  });
  console.log('\nItems:');
  items.forEach(it => {
    console.log(`- [${it.platform}] ${it._id} - "${it.title?.slice(0, 30)}" - ₹${it.currentPrice} - trackerCount: ${it.trackerCount}, lastCheckedAt: ${it.lastCheckedAt}`);
  });

  await mongoose.disconnect();
}

check().catch(console.error);
