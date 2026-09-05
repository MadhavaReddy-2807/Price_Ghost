function parsePrice(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/,/g, '').replace(/[^0-9.]/g, ' ').trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

export function extractAmazonPageData() {
  const url = window.location.href;
  let externalId = '';

  // 1. Try URL ASIN extraction with comprehensive regex patterns
  const urlPatterns = [
    /(?:dp|gp\/product|gp\/aw\/d|product|d)\/([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i,
    /\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  ];

  for (const pattern of urlPatterns) {
    const match = url.match(pattern);
    if (match && match[1] && match[1].length === 10) {
      externalId = match[1].toUpperCase();
      break;
    }
  }

  // 2. DOM ASIN fallback if not matched in URL
  if (!externalId) {
    const asinInput = document.getElementById('ASIN') || 
                      document.querySelector('input[name="ASIN"]') ||
                      document.querySelector('input[name="asin"]') ||
                      document.getElementById('ftSelectAsin') ||
                      document.getElementById('deliveryBlockSelectAsin');
    if (asinInput && asinInput.value && /^[A-Z0-9]{10}$/i.test(asinInput.value.trim())) {
      externalId = asinInput.value.trim().toUpperCase();
    }
  }

  // 3. Check data attributes for ASIN
  if (!externalId) {
    const elWithAsin = document.querySelector('[data-asin]');
    if (elWithAsin) {
      const asinVal = elWithAsin.getAttribute('data-asin');
      if (asinVal && /^[A-Z0-9]{10}$/i.test(asinVal.trim())) {
        externalId = asinVal.trim().toUpperCase();
      }
    }
  }

  // 4. Check canonical link tag
  if (!externalId) {
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (canonical) {
      const match = canonical.match(/(?:dp|product)\/([A-Z0-9]{10})/i);
      if (match) externalId = match[1].toUpperCase();
    }
  }

  if (!externalId) return null;

  let title = '';
  let imageUrl = '';
  let currentPrice = 0;
  let mrpPrice = 0;
  let inStock = true;

  // 1. Try JSON-LD structured data first
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent || s.innerText || '{}');
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
      // Continue to DOM selectors
    }
  }

  // 2. DOM fallback for Title (using textContent to bypass hidden CSS limitations)
  if (!title) {
    const titleEl = document.getElementById('productTitle') ||
                    document.querySelector('h1#title') ||
                    document.querySelector('#titleSection h1') ||
                    document.querySelector('#centerCol h1');
    if (titleEl) {
      title = (titleEl.textContent || titleEl.innerText || '').trim();
    }
  }
  if (!title) {
    const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    title = metaTitle || document.title.replace(/\s*:\s*Amazon.*$/i, '').trim();
  }

  // 3. DOM fallback for Image
  if (!imageUrl) {
    const imgEl = document.getElementById('landingImage') || 
                  document.getElementById('imgBlkFront') ||
                  document.querySelector('#main-image-container img') ||
                  document.querySelector('#imgTagWrapperId img');
    imageUrl = imgEl?.getAttribute('data-old-hires') || 
               imgEl?.getAttribute('data-a-dynamic-image') ||
               imgEl?.src || '';
    
    // If dynamic image dictionary, pick the highest resolution image
    if (imageUrl.startsWith('{')) {
      try {
        const parsed = JSON.parse(imageUrl);
        imageUrl = Object.keys(parsed)[0] || '';
      } catch {}
    }
  }

  // 4. DOM fallback for Current Price
  // IMPORTANT: Use (el.textContent || el.innerText) because .a-offscreen has clip/hidden CSS
  // which makes el.innerText return empty string in Chromium!
  if (!currentPrice) {
    const priceSelectors = [
      '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
      '#corePrice_desktop .priceToPay .a-offscreen',
      '#corePriceDisplay_desktop_feature_div span.a-price-whole',
      '#corePrice_desktop span.a-price-whole',
      '#apex_desktop .priceToPay .a-offscreen',
      '#apex_desktop .a-price .a-offscreen',
      '#priceblock_dealprice',
      '#priceblock_ourprice',
      '#priceblock_saleprice',
      '#price_inside_buybox',
      '#newBuyBoxPrice',
      '.priceToPay .a-offscreen',
      'span.a-price.a-text-price.header-price .a-offscreen',
      'span.a-price span.a-offscreen',
      '.a-price.a-text-price .a-offscreen',
      'span.a-price-whole',
      '#price',
    ];

    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || el.innerText || '').trim();
        if (text) {
          const val = parsePrice(text);
          if (val > 0) {
            currentPrice = val;
            break;
          }
        }
      }
    }
  }

  // 5. Meta tags fallback for Price
  if (!currentPrice) {
    const metaPrice = document.querySelector('meta[property="og:price:amount"]')?.getAttribute('content') ||
                      document.querySelector('meta[name="twitter:data1"]')?.getAttribute('content');
    if (metaPrice) currentPrice = parsePrice(metaPrice);
  }

  // 6. MRP / List Price
  const mrpSelectors = [
    '#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
    '#corePrice_desktop .basisPrice .a-offscreen',
    '.basisPrice .a-offscreen',
    'span[data-a-strike="true"]',
    '.a-price.a-text-price .a-offscreen',
    '#listPrice',
  ];
  for (const sel of mrpSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.textContent || el.innerText || '').trim();
      if (text) {
        const val = parsePrice(text);
        if (val > currentPrice) {
          mrpPrice = val;
          break;
        }
      }
    }
  }
  if (!mrpPrice) mrpPrice = currentPrice;

  // 7. Stock availability check
  const availEl = document.getElementById('availability');
  const availText = (availEl?.textContent || availEl?.innerText || '').toLowerCase();
  if (availText.includes('currently unavailable') || availText.includes('out of stock')) {
    inStock = false;
  }

  if (currentPrice <= 0) return null;

  return {
    platform: 'amazon',
    externalId,
    title: title.replace(/\s+/g, ' ').trim(),
    url: window.location.origin + '/dp/' + externalId,
    imageUrl,
    currentPrice,
    mrpPrice,
    currency: 'INR',
    inStock,
  };
}
