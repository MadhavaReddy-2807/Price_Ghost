import express from 'express';
import http from 'http';
import axios from 'axios';
import { ENV } from './config/env.js';

async function runServerDownTests() {
  console.log('🧪 Starting Server Down & Maintenance Mode Verification Tests...\n');

  let testMaintenanceMode = false;
  let simulatedDbReady = 1;

  const app = express();
  app.use(express.json());

  // Ping & Health
  app.get('/ping', (req, res) => res.json({ pong: true }));
  app.get('/api/ping', (req, res) => res.json({ pong: true }));
  app.get('/api/health', (req, res) => {
    if (testMaintenanceMode) {
      return res.status(503).json({
        status: 'maintenance',
        error: 'Server Down',
        message: 'Maintenance is going on, please contact user',
      });
    }
    return res.status(200).json({ status: 'ok' });
  });

  // Maintenance Guard simulation
  app.use((req, res, next) => {
    if (
      req.method === 'OPTIONS' ||
      req.path === '/ping' ||
      req.path === '/api/ping' ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/api/health')
    ) {
      return next();
    }

    if (testMaintenanceMode) {
      return res.status(503).json({
        error: 'Server Down',
        message: 'Maintenance is going on, please contact user',
        maintenance: true,
        contact: 'madhava2807@gmail.com',
      });
    }
    next();
  });

  // DB Disconnected simulation
  app.use('/api', (req, res, next) => {
    if (simulatedDbReady !== 1) {
      return res.status(503).json({
        error: 'Server Down',
        message: 'Maintenance is going on, please contact user',
        details: 'MongoDB connection is not established yet.',
      });
    }
    next();
  });

  // Dummy endpoints
  app.get('/api/dashboard/summary', (req, res) => res.json({ success: true, items: [] }));

  const server = http.createServer(app);
  const TEST_PORT = 5098;
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

  let allPassed = true;

  // Test 1: Normal Operation
  try {
    const res = await axios.get(`${baseUrl}/api/dashboard/summary`);
    if (res.status === 200 && res.data.success) {
      console.log('✅ Test 1 PASSED: Normal API returns 200 OK when server is healthy.');
    } else {
      console.error('❌ Test 1 FAILED');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 1 ERROR:', err.message);
    allPassed = false;
  }

  // Test 2: Maintenance Mode Active
  testMaintenanceMode = true;
  try {
    await axios.get(`${baseUrl}/api/dashboard/summary`);
    console.error('❌ Test 2 FAILED: Expected 503 but received 200');
    allPassed = false;
  } catch (err) {
    if (
      err.response?.status === 503 &&
      err.response?.data?.error === 'Server Down' &&
      err.response?.data?.message === 'Maintenance is going on, please contact user'
    ) {
      console.log('✅ Test 2 PASSED: Maintenance mode returns 503 with "Server Down" & "Maintenance is going on, please contact user".');
    } else {
      console.error('❌ Test 2 FAILED:', err.response?.data);
      allPassed = false;
    }
  }

  // Test 3: Ping endpoints remain accessible during maintenance
  try {
    const pingRes = await axios.get(`${baseUrl}/api/ping`);
    if (pingRes.status === 200 && pingRes.data.pong) {
      console.log('✅ Test 3 PASSED: Health/ping endpoints remain accessible during maintenance for auto-retry.');
    } else {
      console.error('❌ Test 3 FAILED');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 3 ERROR:', err.message);
    allPassed = false;
  }

  // Test 4: Database Disconnected Scenario
  testMaintenanceMode = false;
  simulatedDbReady = 0; // Disconnected
  try {
    await axios.get(`${baseUrl}/api/dashboard/summary`);
    console.error('❌ Test 4 FAILED: Expected 503');
    allPassed = false;
  } catch (err) {
    if (
      err.response?.status === 503 &&
      err.response?.data?.error === 'Server Down' &&
      err.response?.data?.message === 'Maintenance is going on, please contact user'
    ) {
      console.log('✅ Test 4 PASSED: DB disconnection triggers 503 with exact maintenance message.');
    } else {
      console.error('❌ Test 4 FAILED:', err.response?.data);
      allPassed = false;
    }
  }

  server.close();

  if (allPassed) {
    console.log('\n🎉 ALL SERVER DOWN & MAINTENANCE VERIFICATIONS PASSED!');
  } else {
    process.exit(1);
  }
}

runServerDownTests();
