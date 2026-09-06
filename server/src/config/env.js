import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const ENV = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  MONGODB_URI:
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL ||
    'mongodb://127.0.0.1:27017/price-tracker',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_key_change_in_production_123456789',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'Price Ghost <alerts@pricetracker.local>',
  POLL_INTERVAL_MINUTES: parseInt(process.env.POLL_INTERVAL_MINUTES || '180', 10), // Reduced frequency: every 3 hours (180 mins)
  POLL_ITEM_DELAY_MS: parseInt(process.env.POLL_ITEM_DELAY_MS || '5000', 10), // Reduced frequency: 5s delay between items
  POLL_BATCH_SIZE: parseInt(process.env.POLL_BATCH_SIZE || '20', 10), // Batch size per cycle
  POLL_STARTUP_DELAY_MS: parseInt(process.env.POLL_STARTUP_DELAY_MS || '30000', 10), // 30s delay on startup to prevent spamming
  POLL_DEBUG: process.env.POLL_DEBUG !== 'false', // Poller debug logs enabled by default
  MAX_CONCURRENT_REQUESTS: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '3', 10),
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || 'madhava2807@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};
