function parsePrice(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/,/g, '').replace(/[^0-9.]/g, ' ').trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

export function extractFlipkartPageData() {
  const url = window.location.href;
  let externalId = '';

  const pidMatch = url.match(/[?&]pid=([A-Z0-9]+)/i);
  if (pidMatch) {
    externalId = pidMatch[1];
  } else {
    const itmMatch = url.match(/\/p\/(itm[a-zA-Z0-9]+)/i);
    if (itmMatch) externalId = itmMatch[1];
  }

  if (!externalId) return null;

  let title = '';
  let imageUrl = '';
  let currentPrice = 0;
  let mrpPrice = 0;
  let inStock = true;

  // 1. JSON-LD scripts
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.innerText || '{}');
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          if (item.name) title = item.name;
          if (item.image) imageUrl = Array.isArray(item.image) ? item.image[0] : item.image;
          if (item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offer.price) currentPrice = parsePrice(offer.price);
          }
        }
      }
    } catch {
      // Continue
    }
  }

  // 2. DOM Title
  if (!title) {
    const titleEl = document.querySelector('span.B_NuCI, h1._6EBuvd, h1.VU-ZEz, span._35KyD6, h1');
    title = titleEl?.innerText?.trim() || document.title;
  }

  // 3. DOM Image
  if (!imageUrl) {
    const imgEl = document.querySelector('img._396cs4, img._2r_T1I, img.DByuf4, img._3kidjx');
    imageUrl = imgEl?.src || '';
  }

  // 4. Current Price
  if (!currentPrice) {
    const priceSelectors = [
      'div.Nx9daj div._30jeq3',
      'div._30jeq3._16Jk6d',
      'div._30jeq3',
      'div.hl05eU div._30jeq3',
    ];
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText) {
        const val = parsePrice(el.innerText);
        if (val > 0) {
          currentPrice = val;
          break;
        }
      }
    }
  }

  // 5. MRP
  const mrpSelectors = [
    'div.yRaY8j',
    'div._3I9_wc._2p6lqe',
    'div._3I9_wc',
    'div.hl05eU div._3I9_wc',
  ];
  for (const sel of mrpSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText) {
      const val = parsePrice(el.innerText);
      if (val > currentPrice) {
        mrpPrice = val;
        break;
      }
    }
  }
  if (!mrpPrice) mrpPrice = currentPrice;

  // 6. Stock Check
  const soldOutEl = document.querySelector('div._16FRp0, ._2SmN8-');
  const bodyText = document.body.innerText.toLowerCase();
  if (soldOutEl || bodyText.includes('sold out') || bodyText.includes('currently out of stock')) {
    inStock = false;
  }

  if (currentPrice <= 0) return null;

  return {
    platform: 'flipkart',
    externalId,
    title,
    url,
    imageUrl,
    currentPrice,
    mrpPrice,
    currency: 'INR',
    inStock,
  };
}
