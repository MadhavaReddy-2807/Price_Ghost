import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ItemModel } from '../models/Item.js';
import { runPollerCycle, getPollerStatus } from '../services/poller.js';

async function testGlobalPoller() {
  console.log('--- 1. Testing DB Connection ---');
  await connectDB();

  console.log('\n--- 2. Checking Initial Poller Status ---');
  const initialStatus = getPollerStatus();
  console.log('Status:', JSON.stringify(initialStatus, null, 2));

  console.log('\n--- 3. Running Global Poller Cycle (Testing first 3 items with 1s delay) ---');
  const result = await runPollerCycle({
    batchSize: 3,
    itemDelayMs: 1000,
  });

  console.log('\n--- 4. Poller Cycle Result ---');
  console.log('Result:', JSON.stringify(result, null, 2));

  console.log('\n--- 5. Status After Cycle ---');
  const afterStatus = getPollerStatus();
  console.log('Status after:', JSON.stringify(afterStatus, null, 2));

  process.exit(0);
}

testGlobalPoller().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
