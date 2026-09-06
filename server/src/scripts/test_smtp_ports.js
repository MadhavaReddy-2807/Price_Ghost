import nodemailer from 'nodemailer';
import { ENV } from '../config/env.js';

async function testSMTP() {
  const cleanPass = String(ENV.SMTP_PASS).replace(/\s+/g, '');
  console.log('User:', ENV.SMTP_USER);

  console.log('\n--- Test 1: service: "gmail" (Port 465 default) ---');
  try {
    const t1 = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: ENV.SMTP_USER, pass: cleanPass },
      connectionTimeout: 8000,
    });
    await t1.verify();
    console.log('✅ Test 1 (service: gmail) connected successfully!');
  } catch (err) {
    console.error('❌ Test 1 failed:', err.message);
  }

  console.log('\n--- Test 2: host: smtp.gmail.com, port: 587, secure: false (STARTTLS) ---');
  try {
    const t2 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: ENV.SMTP_USER, pass: cleanPass },
      connectionTimeout: 8000,
    });
    await t2.verify();
    console.log('✅ Test 2 (port 587 STARTTLS) connected successfully!');
  } catch (err) {
    console.error('❌ Test 2 failed:', err.message);
  }

  console.log('\n--- Test 3: host: smtp.gmail.com, port: 465, secure: true (SSL) ---');
  try {
    const t3 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: ENV.SMTP_USER, pass: cleanPass },
      connectionTimeout: 8000,
    });
    await t3.verify();
    console.log('✅ Test 3 (port 465 SSL) connected successfully!');
  } catch (err) {
    console.error('❌ Test 3 failed:', err.message);
  }

  process.exit(0);
}

testSMTP().catch(console.error);
