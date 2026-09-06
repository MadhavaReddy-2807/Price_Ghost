import mongoose from 'mongoose';
import dns from 'dns';
import { ENV } from './env.js';

// Resolve SRV records reliably on Windows environments
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
  // Ignore in restricted environments
}

let isConnected = false;
let isConnecting = false;

export function getSanitizedUri(uri) {
  if (!uri) return 'undefined';
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  } catch {
    return 'invalid_uri_format';
  }
}

export async function connectDB(retries = 10, delay = 4000) {
  if (isConnected || mongoose.connection.readyState === 1 || isConnecting) {
    if (mongoose.connection.readyState === 1) isConnected = true;
    return;
  }

  isConnecting = true;
  const sanitized = getSanitizedUri(ENV.MONGODB_URI);
  console.log(`[Database] Attempting connection to: ${sanitized}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(ENV.MONGODB_URI, {
        serverSelectionTimeoutMS: 8000,
      });

      isConnected = true;
      isConnecting = false;
      console.log(`[Database] ✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
      return;
    } catch (error) {
      console.error(`[Database Error] Attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt < retries) {
        console.log(`[Database] Retrying connection in ${delay / 1000}s...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        isConnecting = false;
        console.error(`[Database Notice] All ${retries} attempts failed. Scheduling background reconnect in 15s...`);
        setTimeout(() => connectDB(5, 4000).catch(() => {}), 15000);
      }
    }
  }
  isConnecting = false;
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[Database] MongoDB disconnected. Scheduling reconnection in 5s...');
  setTimeout(() => connectDB(5, 4000).catch(() => {}), 5000);
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  console.log('[Database] MongoDB reconnected.');
});
