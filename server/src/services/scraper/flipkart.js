import * as cheerio from 'cheerio';
import { sanitizePriceString } from '../priceEngine.js';

/**
 * Extracts Flipkart Product ID (PID) from URL.
 * @param {string} url 
 * @returns {string}
 */
export function extractFlipkartPid(url) {
  try {
    const urlObj = new URL(url);
    const pid = urlObj.searchParams.get('pid');
    if (pid) return pid;
  } catch {
    // Fall back to regex
  }

  const pidMatch = url.match(/[?&]pid=([A-Z0-9]+)/i);
  if (pidMatch) return pidMatch[1];

  const itmMatch = url.match(/\/p\/(itm[a-zA-Z0-9]+)/i);
  if (itmMatch) return itmMatch[1];

  return '';
}

/**
 * Extracts product details from Flipkart product HTML.
 * Uses 3-tier fallback: JSON-LD -> Semantic Meta -> DOM Selectors.
 * @param {string} html 
 * @param {string} url 
 * @returns {Object} Extracted product data
 */
export function extractFlipkartProduct(html, url) {
  const $ = cheerio.load(html);
  const externalId = extractFlipkartPid(url);

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
      // Continue to Tier 2
    }
  });

  // ==========================================
  // Tier 2: OpenGraph & Meta Tags
  // ==========================================
  if (!title) {
    title = $('meta[property="og:title"]').attr('content') ||
            $('meta[name="twitter:title"]').attr('content') || '';
  }
  if (!imageUrl) {
    imageUrl = $('meta[property="og:image"]').attr('content') || '';
  }
  if (!currentPrice) {
    const metaPrice = $('meta[property="og:price:amount"]').attr('content');
    if (metaPrice) currentPrice = sanitizePriceString(metaPrice);
  }

  // ==========================================
  // Tier 3: Flipkart DOM Selectors
  // ==========================================
  if (!title) {
    const titleSelectors = [
      'span.B_NuCI',
      'h1._6EBuvd',
      'h1.VU-ZEz',
      'span._35KyD6',
      'h1',
    ];
    for (const sel of titleSelectors) {
      const text = $(sel).first().text().trim();
      if (text) {
        title = text;
        break;
      }
    }
  }

  if (!imageUrl) {
    const imgSelectors = [
      'img._396cs4',
      'img._2r_T1I',
      'img.DByuf4',
      'img._3kidjx',
    ];
    for (const sel of imgSelectors) {
      const src = $(sel).first().attr('src');
      if (src) {
        imageUrl = src;
        break;
      }
    }
  }

  if (!currentPrice) {
    const priceSelectors = [
      'div.Nx9daj div._30jeq3',
      'div._30jeq3._16Jk6d',
      'div._30jeq3',
      'div.hl05eU div._30jeq3',
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
    'div.yRaY8j',
    'div._3I9_wc._2p6lqe',
    'div._3I9_wc',
    'div.hl05eU div._3I9_wc',
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

  // Check Availability
  const bodyText = $('body').text().toLowerCase();
  const soldOutBadge = $('div._16FRp0, ._2SmN8-').length > 0;
  if (soldOutBadge || bodyText.includes('sold out') || bodyText.includes('currently out of stock')) {
    inStock = false;
  }

  return {
    platform: 'flipkart',
    externalId: externalId || 'FK_' + Date.now(),
    title: title || 'Flipkart Product',
    url,
    imageUrl,
    currentPrice,
    mrpPrice,
    currency,
    inStock,
  };
}
