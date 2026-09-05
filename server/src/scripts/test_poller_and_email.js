import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ItemModel } from '../models/Item.js';
import { UserModel } from '../models/User.js';
import { runPollerCycle } from '../services/poller.js';
import { sendPriceDropEmail } from '../services/emailService.js';
import { ENV } from '../config/env.js';

async function testEmailAndPoller() {
  console.log('\n======================================================');
  console.log('🧪 TESTING NODEMAILER CONFIGURATION');
  console.log('======================================================');
  console.log('SMTP Host:', ENV.SMTP_HOST);
  console.log('SMTP Port:', ENV.SMTP_PORT);
  console.log('SMTP User:', ENV.SMTP_USER);
  console.log('SMTP From:', ENV.SMTP_FROM);

  if (!ENV.SMTP_USER || !ENV.SMTP_PASS) {
    console.error('❌ Error: SMTP_USER or SMTP_PASS is missing in server/.env');
    process.exit(1);
  }

  // 1. Verify SMTP Connection
  const transporter = nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT,
    secure: ENV.SMTP_PORT === 465,
    auth: {
      user: ENV.SMTP_USER,
      pass: ENV.SMTP_PASS,
    },
  });

  console.log('\n[1/3] Verifying SMTP connection to Gmail...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully! Credentials are valid.');
  } catch (err) {
    console.error('❌ SMTP verification failed:', err.message);
    process.exit(1);
  }

  // 2. Send a direct test email
  console.log('\n[2/3] Sending test price drop alert email to', ENV.SMTP_USER, '...');
  try {
    const testResult = await sendPriceDropEmail({
      user: {
        name: 'Madhava',
        email: ENV.SMTP_USER,
      },
      item: {
        title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
        platform: 'amazon',
        url: 'https://www.amazon.in/dp/B09XS7JWHH',
        imageUrl: 'https://m.media-amazon.com/images/I/61O3iMlnJIL._SL1500_.jpg',
        currentPrice: 22990,
      },
      dropPercentage: 18,
      baselinePrice: 27990,
      currentPrice: 22990,
    });

    if (testResult.success) {
      console.log('✅ Test email sent! Message ID:', testResult.messageId || 'MOCKED');
    } else {
      console.error('❌ Test email failed:', testResult.error);
    }
  } catch (err) {
    console.error('❌ Error sending test email:', err.message);
  }

  // 3. Connect to Database & Run Poller Cycle
  console.log('\n[3/3] Connecting to MongoDB and running Poller Cycle...');
  await connectDB();

  // Make sure there is a user with ENV.SMTP_USER tracking an item so poller can alert
  let testUser = await UserModel.findOne({ email: ENV.SMTP_USER });
  let sampleItem = await ItemModel.findOne({});

  if (!testUser && sampleItem) {
    console.log(`[Poller Test] Linking sample tracked item to ${ENV.SMTP_USER}...`);
    testUser = await UserModel.create({
      googleId: 'test_user_' + Date.now(),
      email: ENV.SMTP_USER,
      name: 'Madhava',
      notifications: {
        email: true,
        frequency: 'realtime',
        defaultThreshold: 5,
        quietHoursStart: '',
        quietHoursEnd: '',
      },
      trackedItems: [
        {
          itemId: sampleItem._id,
          targetPercentageDrop: 5,
          baseline: 'initial',
          baselinePrice: sampleItem.highestPrice || sampleItem.currentPrice + 1000,
          targetPrice: sampleItem.currentPrice,
          lastNotifiedPrice: null,
          createdAt: new Date(),
        },
      ],
    });
  }

  console.log('[Poller Test] Executing runPollerCycle()...');
  await runPollerCycle();

  console.log('\n======================================================');
  console.log('🎉 POLLE & EMAIL TEST COMPLETED!');
  console.log('======================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

testEmailAndPoller().catch((err) => {
  console.error('[Test Failed]', err);
  process.exit(1);
});
