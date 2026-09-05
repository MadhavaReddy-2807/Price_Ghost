import mongoose from 'mongoose';
import { ENV } from './env.js';

let isConnected = false;

export async function connectDB(retries = 5, delay = 5000) {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(ENV.MONGODB_URI, {
        serverSelectionTimeoutMS: 8000,
      });

      isConnected = true;
      console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
      return;
    } catch (error) {
      console.error(`[Database Error] Attempt ${attempt}/${retries} failed to connect to MongoDB: ${error.message}`);
      if (attempt < retries) {
        console.log(`[Database] Retrying connection in ${delay / 1000}s...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        console.error(`[Database Help] Ensure MongoDB is running locally or verify your Atlas IP whitelist: https://www.mongodb.com/docs/atlas/security-whitelist/`);
      }
    }
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[Database] MongoDB disconnected.');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  console.log('[Database] MongoDB reconnected.');
});
