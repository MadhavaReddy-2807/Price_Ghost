import * as cheerio from 'cheerio';
import { sanitizePriceString } from '../priceEngine.js';

export const AMAZON_ASIN_REGEX = /(?:dp|gp\/product)\/([A-Z0-9]{10})/i;

/**
 * Extracts product details from Amazon India product HTML.
 * Uses 3-tier fallback: JSON-LD -> Semantic Meta -> DOM Selectors.
 * @param {string} html 
 * @param {string} url 
 * @returns {Object} Extracted product data
 */
export function extractAmazonProduct(html, url) {
  const $ = cheerio.load(html);

  // Check for Amazon Bot / Captcha page
  const pageTitle = $('title').text().trim();
  if (pageTitle.toLowerCase().includes('robot check') || html.includes('Enter the characters you see below')) {
    const error = new Error('Amazon served a CAPTCHA verification page.');
    error.code = 'CAPTCHA_DETECTED';
    throw error;
  }

  // Extract ASIN external ID
  const asinMatch = url.match(AMAZON_ASIN_REGEX);
  const externalId = asinMatch ? asinMatch[1] : '';

  let title = '';
  let imageUrl = '';
  let currentPrice = 0;
  let mrpPrice = 0;
  let inStock = true;
  let currency = 'INR';

  // ==========================================
  // Tier 1: Schema.org JSON-LD Extraction
  // ==========================================
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const rawText = $(el).html();
      if (!rawText) return;
      const data = JSON.parse(rawText);

      // Can be a single object or array of schema objects
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          if (item.name && !title) title = item.name.trim();
          if (item.image && !imageUrl) {
            imageUrl = Array.isArray(item.image) ? item.image[0] : item.image;
          }
          if (item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offer.price) currentPrice = sanitizePriceString(offer.price);
            if (offer.priceCurrency) currency = offer.priceCurrency;
            if (offer.availability) {
              inStock = !String(offer.availability).toLowerCase().includes('outofstock');
            }
          }
        }
      }
    } catch {
      // JSON-LD parse error, silently continue to Tier 2
    }
  });

  // ==========================================
  // Tier 2: OpenGraph & Meta Tags
  // ==========================================
  if (!title) {
    title = $('meta[property="og:title"]').attr('content') || 
            $('meta[name="title"]').attr('content') || '';
  }
  if (!imageUrl) {
    imageUrl = $('meta[property="og:image"]').attr('content') || '';
  }
  if (!currentPrice) {
    const metaPrice = $('meta[property="og:price:amount"]').attr('content') ||
                      $('meta[name="twitter:data1"]').attr('content');
    if (metaPrice) currentPrice = sanitizePriceString(metaPrice);
  }

  // ==========================================
  // Tier 3: Amazon DOM Selectors
  // ==========================================
  if (!title) {
    title = $('#productTitle').text().trim() ||
            $('h1#title').text().trim() ||
            $('#centerCol h1').text().trim();
  }

  if (!imageUrl) {
    imageUrl = $('#landingImage').attr('data-old-hires') ||
               $('#landingImage').attr('src') ||
               $('#imgBlkFront').attr('src') || '';
  }

  if (!currentPrice) {
    const priceSelectors = [
      '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
      '#corePrice_desktop .priceToPay .a-offscreen',
      '#priceblock_dealprice',
      '#priceblock_ourprice',
      '#corePriceDisplay_desktop_feature_div .a-price-whole',
      '#apex_desktop .a-price .a-offscreen',
      '.priceToPay .a-offscreen',
      'span.a-price-whole',
    ];

    for (const sel of priceSelectors) {
      const el = $(sel).first();
      if (el.length > 0) {
        const parsed = sanitizePriceString(el.text());
        if (parsed > 0) {
          currentPrice = parsed;
          break;
        }
      }
    }
  }

  // MRP / List Price Extraction
  const mrpSelectors = [
    '.basisPrice .a-offscreen',
    '.a-price.a-text-price .a-offscreen',
    'span[data-a-strike="true"]',
    '#listPrice',
  ];

  for (const sel of mrpSelectors) {
    const el = $(sel).first();
    if (el.length > 0) {
      const parsed = sanitizePriceString(el.text());
      if (parsed > currentPrice) {
        mrpPrice = parsed;
        break;
      }
    }
  }

  if (mrpPrice === 0) mrpPrice = currentPrice;

  // Check Availability / Stock
  const availText = $('#availability').text().toLowerCase();
  if (availText.includes('currently unavailable') || availText.includes('out of stock')) {
    inStock = false;
  }

  return {
    platform: 'amazon',
    externalId: externalId || 'AMZ_' + Date.now(),
    title: title || 'Amazon Product',
    url,
    imageUrl,
    currentPrice,
    mrpPrice,
    currency,
    inStock,
  };
}
