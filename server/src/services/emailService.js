import nodemailer from 'nodemailer';
import { ENV } from '../config/env.js';

let transporter = null;

/**
 * Resets cached transporter so subsequent attempts create a fresh socket connection.
 */
export function resetTransporter() {
  transporter = null;
}

export function getTransporter() {
  if (!transporter && ENV.SMTP_USER && ENV.SMTP_PASS) {
    const cleanPass = String(ENV.SMTP_PASS).replace(/\s+/g, '');
    const port = parseInt(ENV.SMTP_PORT || '587', 10);
    const host = ENV.SMTP_HOST || 'smtp.gmail.com';
    const isPort587 = port === 587;

    const transportOptions = isPort587
      ? {
          host,
          port: 587,
          secure: false, // STARTTLS
          auth: {
            user: ENV.SMTP_USER,
            pass: cleanPass,
          },
          connectionTimeout: 30000,
          greetingTimeout: 30000,
          socketTimeout: 35000,
        }
      : {
          host,
          port: 465,
          secure: true,
          auth: {
            user: ENV.SMTP_USER,
            pass: cleanPass,
          },
          connectionTimeout: 30000,
          greetingTimeout: 30000,
          socketTimeout: 35000,
        };

    transporter = nodemailer.createTransport(transportOptions);
  }
  return transporter;
}

/**
 * Checks email service status and configuration for health monitoring.
 * @param {boolean} [verify=false] - Whether to attempt SMTP handshake verification
 * @returns {Promise<Object>}
 */
export async function checkEmailStatus(verify = false) {
  const isConfigured = Boolean(ENV.SMTP_USER && ENV.SMTP_PASS);
  const info = {
    configured: isConfigured,
    host: ENV.SMTP_HOST || 'smtp.gmail.com',
    port: ENV.SMTP_PORT || 587,
    mode: isConfigured ? 'smtp' : 'mock',
    from: ENV.SMTP_FROM,
    verified: null,
  };

  if (verify && isConfigured) {
    try {
      const client = getTransporter();
      if (client) {
        await client.verify();
        info.verified = true;
      }
    } catch (err) {
      info.verified = false;
      info.error = err.message;
    }
  }

  return info;
}

/**
 * Formats a number to Indian Rupee currency format (e.g. ₹24,990)
 * @param {number} amount 
 * @returns {string}
 */
export function formatINR(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return '₹0';
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Generates responsive branded HTML email template for price drop alerts.
 */
export function generateEmailHtml({
  user,
  item,
  dropPercentage,
  baselinePrice,
  currentPrice,
  savings,
  unsubscribeUrl,
}) {
  const platformName = item.platform ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1) : 'Store';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Price Drop Alert: ${item.title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6; color: #1f2937;">
  <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;">
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); background-color: #4f46e5; color: #ffffff; padding: 28px 24px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff;">👻 Price Ghost Alert!</h1>
      <div style="display: inline-block; background-color: #10b981; color: #ffffff; font-weight: 700; font-size: 14px; padding: 6px 14px; border-radius: 9999px; margin-top: 12px;">📉 Price Dropped by ${dropPercentage}%!</div>
    </div>
    <div style="padding: 28px 24px;">
      <p style="font-size: 16px; margin: 0 0 16px 0; color: #374151;">Hey <strong>${user.name || 'Shopper'}</strong>, an item on your tracking list just dropped to a new low!</p>
      
      <!-- Product Showcase Box (Table-based for bulletproof email client support) -->
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e5e7eb; border-radius: 12px; margin: 20px 0; background-color: #ffffff; border-collapse: separate;">
        <tr>
          ${
            item.imageUrl
              ? `
          <td width="110" valign="middle" align="center" style="padding: 16px 12px 16px 16px; text-align: center; vertical-align: middle;">
            <a href="${item.url}" target="_blank" style="text-decoration: none; display: block;">
              <img
                src="${item.imageUrl}"
                alt="${item.title}"
                width="100"
                height="100"
                style="display: block; width: 100px; height: 100px; max-width: 100px; max-height: 100px; object-fit: contain; border: 0; outline: none; text-decoration: none; border-radius: 8px; margin: 0 auto;"
              />
            </a>
          </td>
          `
              : ''
          }
          <td valign="middle" align="left" style="padding: 16px; vertical-align: middle; text-align: left;">
            <div style="font-size: 11px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
              ${platformName}
            </div>
            <a href="${item.url}" target="_blank" style="text-decoration: none; color: #111827;">
              <h2 style="font-size: 15px; font-weight: 600; line-height: 1.4; margin: 0; color: #111827;">
                ${item.title}
              </h2>
            </a>
          </td>
        </tr>
      </table>

      <!-- Price Breakdown Grid -->
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 20px 0; text-align: center;">
        <tr>
          <td width="33%" style="padding: 16px 8px; text-align: center;">
            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Previous Price</div>
            <div style="font-size: 16px; font-weight: 500; color: #94a3b8; text-decoration: line-through;">${formatINR(baselinePrice)}</div>
          </td>
          <td width="34%" style="padding: 16px 8px; text-align: center; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
            <div style="font-size: 11px; font-weight: 600; color: #059669; text-transform: uppercase; margin-bottom: 4px;">Deal Price</div>
            <div style="font-size: 20px; font-weight: 800; color: #059669;">${formatINR(currentPrice)}</div>
          </td>
          <td width="33%" style="padding: 16px 8px; text-align: center;">
            <div style="font-size: 11px; font-weight: 600; color: #4f46e5; text-transform: uppercase; margin-bottom: 4px;">You Save</div>
            <div style="font-size: 16px; font-weight: 800; color: #4f46e5;">${formatINR(savings)}</div>
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0 10px 0;">
        <a
          href="${item.url}"
          target="_blank"
          style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); background-color: #4f46e5; color: #ffffff !important; font-weight: 700; font-size: 15px; padding: 14px 32px; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);"
        >
          Buy Now on ${platformName} →
        </a>
      </div>
    </div>

    <div style="border-top: 1px solid #e5e7eb; padding: 20px 24px; text-align: center; font-size: 12px; color: #9ca3af; background-color: #ffffff;">
      <p style="margin: 0 0 6px 0;">You are receiving this automated alert because you tracked this item on Price Ghost.</p>
      <p style="margin: 0;">
        <a href="${ENV.CLIENT_URL}/dashboard" style="color: #6b7280; text-decoration: underline;">Manage Tracked Items</a> · 
        <a href="${ENV.CLIENT_URL}/preferences" style="color: #6b7280; text-decoration: underline;">Adjust Alert Preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Dispatches an email notification or logs mock email to console.
 */
export async function sendPriceDropEmail({
  user,
  item,
  dropPercentage,
  baselinePrice,
  currentPrice,
}) {
  const savings = Math.max(0, baselinePrice - currentPrice);
  const subject = `📉 Price Drop Alert: "${item.title.slice(0, 40)}..." dropped to ${formatINR(currentPrice)}!`;

  const html = generateEmailHtml({
    user,
    item,
    dropPercentage,
    baselinePrice,
    currentPrice,
    savings,
  });

  const mailClient = getTransporter();

  if (!mailClient || user.email?.endsWith('.test') || user.email?.endsWith('.example') || ENV.NODE_ENV === 'test') {
    // Development fallback mock mode
    console.log(`\n======================================================`);
    console.log(`[EMAIL MOCK - DEV/TEST MODE]`);
    console.log(`To: ${user.email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Product: ${item.title}`);
    console.log(`Drop: -${dropPercentage}% (From ${formatINR(baselinePrice)} -> ${formatINR(currentPrice)})`);
    console.log(`Savings: ${formatINR(savings)}`);
    console.log(`Buy Link: ${item.url}`);
    console.log(`======================================================\n`);
    return { success: true, mocked: true, messageId: `mock_${Date.now()}` };
  }

  try {
    const info = await mailClient.sendMail({
      from: ENV.SMTP_FROM,
      to: user.email,
      subject,
      html,
    });
    console.log(`[Email Service] Price drop alert sent to ${user.email} (Message ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email Service Error] Failed to send email to ${user.email}:`, error.message);
    resetTransporter(); // Ensure stale connection is destroyed

    // If it was a network timeout or connection reset, retry once with a fresh socket
    const isNetworkGlitch =
      error.message &&
      (error.message.includes('timeout') ||
        error.message.includes('ECONN') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ESOCKET'));

    if (isNetworkGlitch) {
      try {
        console.log(`[Email Service] Retrying send to ${user.email} with fresh connection...`);
        const freshClient = getTransporter();
        if (freshClient) {
          const retryInfo = await freshClient.sendMail({
            from: ENV.SMTP_FROM,
            to: user.email,
            subject,
            html,
          });
          console.log(`[Email Service] ✅ Retry successful for ${user.email} (Message ID: ${retryInfo.messageId})`);
          return { success: true, messageId: retryInfo.messageId };
        }
      } catch (retryErr) {
        console.error(`[Email Service Error] Immediate retry also failed for ${user.email}:`, retryErr.message);
        resetTransporter();
      }
    }

    return { success: false, error: error.message };
  }
}
