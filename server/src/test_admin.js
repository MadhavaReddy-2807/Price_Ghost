import './config/env.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { connectDB } from './config/db.js';
import { UserModel } from './models/User.js';
import { SystemSettingModel } from './models/SystemSetting.js';
import { ENV } from './config/env.js';
import { requireAccessMiddleware, adminOnlyMiddleware } from './middleware/auth.js';
import { updatePollerConfig, getPollerStatus } from './services/poller.js';

async function runAdminTests() {
  console.log('🧪 Starting Admin & Access Control Verification Tests...\n');
  await connectDB();

  let allPassed = true;

  // 1. Setup test admin and test unapproved user
  const adminEmail = 'madhava2807@gmail.com';
  const testUserEmail = 'test_unapproved_user@pricetracker.local';

  let adminUser = await UserModel.findOne({ email: adminEmail });
  if (!adminUser) {
    adminUser = await UserModel.create({
      googleId: 'test_admin_google_id',
      email: adminEmail,
      name: 'Admin Madhava',
      role: 'admin',
      hasAccess: true,
    });
  } else {
    adminUser.role = 'admin';
    adminUser.hasAccess = true;
    await adminUser.save();
  }

  let testUser = await UserModel.findOne({ email: testUserEmail });
  if (!testUser) {
    testUser = await UserModel.create({
      googleId: 'test_unapproved_google_id',
      email: testUserEmail,
      name: 'Test Unapproved',
      role: 'user',
      hasAccess: false,
    });
  } else {
    testUser.hasAccess = false;
    testUser.role = 'user';
    await testUser.save();
  }

  // --- Test 1: Access Control Middleware Blocks Unapproved User ---
  console.log('--- Test 1: requireAccessMiddleware Blocks Unapproved User ---');
  let blocked = false;
  const mockReqUnapproved = {
    user: { userId: testUser._id.toString(), email: testUser.email, role: 'user', hasAccess: false },
  };
  const mockResBlocked = {
    status: (code) => ({
      json: (data) => {
        if (code === 403 && data.accessRestricted) {
          blocked = true;
        }
      },
    }),
  };
  await requireAccessMiddleware(mockReqUnapproved, mockResBlocked, () => {
    blocked = false;
  });

  if (blocked) {
    console.log('✅ Test 1 PASSED: Unapproved user blocked with 403 accessRestricted.');
  } else {
    console.error('❌ Test 1 FAILED: Unapproved user was not blocked!');
    allPassed = false;
  }

  // --- Test 2: Admin Only Middleware Blocks Standard User ---
  console.log('\n--- Test 2: adminOnlyMiddleware Blocks Standard User ---');
  let adminBlocked = false;
  const mockResAdminBlocked = {
    status: (code) => ({
      json: (data) => {
        if (code === 403 && data.adminRequired) {
          adminBlocked = true;
        }
      },
    }),
  };
  await adminOnlyMiddleware(mockReqUnapproved, mockResAdminBlocked, () => {
    adminBlocked = false;
  });

  if (adminBlocked) {
    console.log('✅ Test 2 PASSED: Standard user blocked from admin routes with 403.');
  } else {
    console.error('❌ Test 2 FAILED: Standard user was not blocked from admin routes!');
    allPassed = false;
  }

  // --- Test 3: Admin Only Middleware Allows Administrator ---
  console.log('\n--- Test 3: adminOnlyMiddleware Allows Administrator ---');
  let adminAllowed = false;
  const mockReqAdmin = {
    user: { userId: adminUser._id.toString(), email: adminUser.email, role: 'admin', hasAccess: true },
  };
  await adminOnlyMiddleware(mockReqAdmin, mockResAdminBlocked, () => {
    adminAllowed = true;
  });

  if (adminAllowed) {
    console.log('✅ Test 3 PASSED: Administrator granted access to admin routes.');
  } else {
    console.error('❌ Test 3 FAILED: Administrator was blocked!');
    allPassed = false;
  }

  // --- Test 4: Grant Access to User and Verify Unblock ---
  console.log('\n--- Test 4: Grant Access & Verify Instant Unblock ---');
  testUser.hasAccess = true;
  await testUser.save();

  let userNowAllowed = false;
  await requireAccessMiddleware(mockReqUnapproved, mockResBlocked, () => {
    userNowAllowed = true;
  });

  if (userNowAllowed) {
    console.log('✅ Test 4 PASSED: User access granted and immediately unblocked.');
  } else {
    console.error('❌ Test 4 FAILED: User remained blocked after granting access!');
    allPassed = false;
  }

  // Reset test user back to false
  testUser.hasAccess = false;
  await testUser.save();

  // --- Test 5: Poller Configuration Update & Persistence ---
  console.log('\n--- Test 5: Poller Configuration Update & Persistence ---');
  try {
    const updatedStatus = updatePollerConfig({
      enabled: true,
      intervalMinutes: 45,
    });

    await SystemSettingModel.findOneAndUpdate(
      { key: 'pollerConfig' },
      {
        key: 'pollerConfig',
        value: {
          autoPollEnabled: updatedStatus.autoPollEnabled,
          intervalMinutes: updatedStatus.intervalMinutes,
          updatedAt: new Date(),
        },
        updatedBy: adminEmail,
      },
      { upsert: true, new: true }
    );

    const savedSetting = await SystemSettingModel.findOne({ key: 'pollerConfig' });
    console.log('Poller Status in Memory:', {
      autoPollEnabled: updatedStatus.autoPollEnabled,
      intervalMinutes: updatedStatus.intervalMinutes,
    });
    console.log('Persisted Setting in MongoDB:', savedSetting?.value);

    if (
      updatedStatus.intervalMinutes === 45 &&
      savedSetting?.value?.intervalMinutes === 45 &&
      savedSetting?.value?.autoPollEnabled === true
    ) {
      console.log('✅ Test 5 PASSED: Poller config dynamically updated and persisted in MongoDB.');
    } else {
      console.error('❌ Test 5 FAILED: Poller config was not properly updated or persisted.');
      allPassed = false;
    }

    // Restore to default 60m
    updatePollerConfig({ enabled: true, intervalMinutes: 60 });
    await SystemSettingModel.findOneAndUpdate(
      { key: 'pollerConfig' },
      { 'value.intervalMinutes': 60 }
    );
  } catch (err) {
    console.error('❌ Test 5 ERROR:', err.message);
    allPassed = false;
  }

  await mongoose.disconnect();

  if (allPassed) {
    console.log('\n🎉 ALL ADMIN & ACCESS CONTROL TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME ADMIN TESTS FAILED.');
    process.exit(1);
  }
}

runAdminTests().catch((e) => {
  console.error('Fatal admin test error:', e);
  process.exit(1);
});
