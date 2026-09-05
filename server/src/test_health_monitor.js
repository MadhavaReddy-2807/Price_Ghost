import express from 'express';
import http from 'http';
import axios from 'axios';
import healthRoutes from './routes/health.js';

async function runHealthTests() {
  console.log('🧪 Starting Health & Upstream Monitor API Verification Tests...\n');

  const app = express();
  app.use(express.json());
  app.use('/api/health', healthRoutes);
  app.use('/health', healthRoutes);
  app.use('/healthz', healthRoutes);
  app.get('/ping', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.status(200).json({ pong: true, timestamp: new Date().toISOString() });
  });

  const server = http.createServer(app);
  const TEST_PORT = 5099;

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  console.log(`[Test Server] Listening on ${baseUrl}`);

  let allPassed = true;

  // Test 1: GET /api/health (Standard heartbeat)
  try {
    const res = await axios.get(`${baseUrl}/api/health`);
    console.log('\n--- Test 1: GET /api/health ---');
    console.log('Status Code:', res.status);
    console.log('Cache-Control:', res.headers['cache-control']);

    if (
      res.status === 200 &&
      res.data.status === 'ok' &&
      res.data.service === 'Price Ghost API' &&
      res.data.uptime &&
      res.data.database &&
      res.headers['cache-control'].includes('no-cache')
    ) {
      console.log('✅ Test 1 PASSED: Primary health endpoint healthy and valid.');
    } else {
      console.error('❌ Test 1 FAILED: Unexpected response format.');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 1 ERROR:', err.message);
    allPassed = false;
  }

  // Test 2: HEAD /api/health (Monitor HEAD request)
  try {
    console.log('\n--- Test 2: HEAD /api/health ---');
    const res = await axios.head(`${baseUrl}/api/health`);
    console.log('Status Code:', res.status);
    console.log('Cache-Control:', res.headers['cache-control']);

    if (res.status === 200 && res.headers['cache-control']) {
      console.log('✅ Test 2 PASSED: HEAD request handled properly.');
    } else {
      console.error('❌ Test 2 FAILED');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 2 ERROR:', err.message);
    allPassed = false;
  }

  // Test 3: GET /ping and GET /api/health/ping
  try {
    console.log('\n--- Test 3: GET /ping and GET /api/health/ping ---');
    const res1 = await axios.get(`${baseUrl}/ping`);
    const res2 = await axios.get(`${baseUrl}/api/health/ping`);

    if (res1.status === 200 && res1.data.pong === true && res2.status === 200 && res2.data.pong === true) {
      console.log('✅ Test 3 PASSED: Both /ping and /api/health/ping returned pong.');
    } else {
      console.error('❌ Test 3 FAILED');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 3 ERROR:', err.message);
    allPassed = false;
  }

  // Test 4: GET /api/health/live (Liveness probe)
  try {
    console.log('\n--- Test 4: GET /api/health/live ---');
    const res = await axios.get(`${baseUrl}/api/health/live`);
    console.log('Status Code:', res.status);
    console.log('Payload:', res.data);

    if (res.status === 200 && res.data.alive === true) {
      console.log('✅ Test 4 PASSED: Liveness probe healthy.');
    } else {
      console.error('❌ Test 4 FAILED');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 4 ERROR:', err.message);
    allPassed = false;
  }

  // Test 5: GET /api/health/ready (Readiness probe)
  try {
    console.log('\n--- Test 5: GET /api/health/ready ---');
    const res = await axios.get(`${baseUrl}/api/health/ready`, {
      validateStatus: () => true, // May be 200 or 503 depending on MongoDB in dev
    });
    console.log('Status Code:', res.status);
    console.log('Payload:', res.data);

    if (res.status === 200 || res.status === 503) {
      console.log(`✅ Test 5 PASSED: Readiness probe responded with appropriate status (${res.status}).`);
    } else {
      console.error('❌ Test 5 FAILED');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 5 ERROR:', err.message);
    allPassed = false;
  }

  // Test 6: GET /api/health/upstream?skipTargets=true (Upstream monitor check with dependencies)
  try {
    console.log('\n--- Test 6: GET /api/health/upstream (Fast mode) ---');
    const res = await axios.get(`${baseUrl}/api/health/upstream?skipTargets=true`, {
      validateStatus: () => true,
    });
    console.log('Status Code:', res.status);
    console.log('Payload:', JSON.stringify(res.data, null, 2));

    const body = res.data;
    if (
      (res.status === 200 || res.status === 503) &&
      body.service === 'Price Ghost API' &&
      body.dependencies &&
      body.dependencies.database &&
      body.dependencies.poller &&
      body.dependencies.email &&
      body.system &&
      body.system.memory &&
      typeof body.system.uptimeSeconds === 'number'
    ) {
      console.log('✅ Test 6 PASSED: Upstream dependency diagnostic report validated.');
    } else {
      console.error('❌ Test 6 FAILED: Invalid diagnostic report format.');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 6 ERROR:', err.message);
    allPassed = false;
  }

  // Test 7: GET /api/health?upstream=true (Upstream query param on root health)
  try {
    console.log('\n--- Test 7: GET /api/health?upstream=true&skipTargets=true ---');
    const res = await axios.get(`${baseUrl}/api/health?upstream=true&skipTargets=true`, {
      validateStatus: () => true,
    });
    console.log('Status Code:', res.status);

    if (res.data.dependencies && res.data.system) {
      console.log('✅ Test 7 PASSED: ?upstream=true query switch working seamlessly.');
    } else {
      console.error('❌ Test 7 FAILED');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 7 ERROR:', err.message);
    allPassed = false;
  }

  // Test 8: GET /api/health/upstream (Full targets probe + Cache verification)
  try {
    console.log('\n--- Test 8: GET /api/health/upstream (Full with external targets probe) ---');
    const res1 = await axios.get(`${baseUrl}/api/health/upstream`, {
      validateStatus: () => true,
    });
    console.log('Call 1 Status:', res1.status);
    console.log('Targets Result:', JSON.stringify(res1.data?.dependencies?.upstreamTargets, null, 2));

    const res2 = await axios.get(`${baseUrl}/api/health/upstream`, {
      validateStatus: () => true,
    });
    console.log('Call 2 Status:', res2.status, 'Cached:', res2.data?.dependencies?.upstreamTargets?.cached);

    if (
      res1.data?.dependencies?.upstreamTargets &&
      Array.isArray(res1.data.dependencies.upstreamTargets.targets) &&
      res2.data?.dependencies?.upstreamTargets?.cached === true
    ) {
      console.log('✅ Test 8 PASSED: External targets probe and 60s cache verified.');
    } else {
      console.error('❌ Test 8 FAILED: Targets probe or caching mismatch.');
      allPassed = false;
    }
  } catch (err) {
    console.error('❌ Test 8 ERROR:', err.message);
    allPassed = false;
  }

  // Cleanup test server
  await new Promise((resolve) => server.close(resolve));
  console.log('\n[Test Server] Stopped.');

  if (allPassed) {
    console.log('\n🎉 ALL HEALTH & UPSTREAM MONITOR TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runHealthTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
