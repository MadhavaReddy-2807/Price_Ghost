import * as cheerio from 'cheerio';
import { sanitizePriceString } from '../priceEngine.js';

export const MYNTRA_STYLE_REGEX = /\/([0-9]{5,10})(?:\/buy)?(?:[?#]|$)/i;

/**
 * Extracts Myntra style ID from URL.
 * @param {string} url 
 * @returns {string}
 */
export function extractMyntraStyleId(url) {
  const match = url.match(MYNTRA_STYLE_REGEX);
  return match ? match[1] : '';
}

/**
 * Extracts product details from Myntra product HTML.
 * Uses 3-tier fallback: Inlined window.__myx state -> JSON-LD -> DOM Selectors.
 * @param {string} html 
 * @param {string} url 
 * @returns {Object} Extracted product data
 */
export function extractMyntraProduct(html, url) {
  const $ = cheerio.load(html);
  const externalId = extractMyntraStyleId(url);

  let title = '';
  let imageUrl = '';
  let currentPrice = 0;
  let mrpPrice = 0;
  let inStock = true;
  let currency = 'INR';

  // ==========================================
  // Tier 1: Extract Inlined window.__myx State
  // ==========================================
  const myxMatch = html.match(/window\.__myx\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (myxMatch) {
    try {
      const myxData = JSON.parse(myxMatch[1]);
      const pdp = myxData.pdpData;
      if (pdp) {
        if (pdp.name) {
          title = pdp.brand ? `${pdp.brand} ${pdp.name}` : pdp.name;
        }
        if (pdp.price) {
          if (pdp.price.discounted) currentPrice = sanitizePriceString(pdp.price.discounted);
          if (pdp.price.mrp) mrpPrice = sanitizePriceString(pdp.price.mrp);
        }
        if (pdp.media && pdp.media.albums && pdp.media.albums[0]?.images?.[0]?.src) {
          imageUrl = pdp.media.albums[0].images[0].src;
        }
        if (pdp.inventory) {
          inStock = pdp.inventory.totalInventory > 0;
        }
      }
    } catch {
      // Continue to Tier 2
    }
  }

  // ==========================================
  // Tier 2: Schema.org JSON-LD Extraction
  // ==========================================
  if (!currentPrice || !title) {
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
              if (offer.price && !currentPrice) currentPrice = sanitizePriceString(offer.price);
              if (offer.priceCurrency) currency = offer.priceCurrency;
              if (offer.availability) {
                inStock = !String(offer.availability).toLowerCase().includes('outofstock');
              }
            }
          }
        }
      } catch {
        // Continue to Tier 3
      }
    });
  }

  // ==========================================
  // Tier 3: Myntra DOM Selectors
  // ==========================================
  if (!title) {
    const brand = $('h1.pdp-title').text().trim();
    const name = $('h1.pdp-name').text().trim();
    title = brand ? `${brand} ${name}` : (name || $('title').text().trim());
  }

  if (!imageUrl) {
    imageUrl = $('div.image-grid-image').first().css('background-image') ||
               $('img.image-grid-image').first().attr('src') || '';
    if (imageUrl.startsWith('url(')) {
      imageUrl = imageUrl.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    }
  }

  if (!currentPrice) {
    const priceSelectors = [
      'span.pdp-price strong',
      'span.pdp-discounted-price',
      'span.pdp-price',
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

  if (!mrpPrice) {
    const mrpSelectors = [
      'span.pdp-mrp s',
      'span.pdp-mrp',
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
  }

  if (mrpPrice === 0) mrpPrice = currentPrice;

  return {
    platform: 'myntra',
    externalId: externalId || 'MYN_' + Date.now(),
    title: title || 'Myntra Product',
    url,
    imageUrl,
    currentPrice,
    mrpPrice,
    currency,
    inStock,
  };
}
