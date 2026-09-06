import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { UserModel } from '../models/User.js';

async function checkMailQueues() {
  await connectDB();
  const users = await UserModel.find({ 'mailQueue.0': { $exists: true } }, 'email mailQueue');
  console.log('Users with mail queue items:');
  users.forEach(u => {
    console.log(`User: ${u.email}`);
    u.mailQueue.forEach(j => {
      console.log(`  - [${j.status}] ${j.subject} | attempts: ${j.attempts}/${j.maxAttempts} | error: ${j.lastError}`);
    });
  });
  await mongoose.disconnect();
}

checkMailQueues().catch(console.error);
