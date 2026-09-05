function parsePrice(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/,/g, '').replace(/[^0-9.]/g, ' ').trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

export function extractMyntraPageData() {
  const url = window.location.href;
  const styleMatch = url.match(/\/([0-9]{5,10})(?:\/buy)?(?:[?#]|$)/i);
  if (!styleMatch) return null;

  const externalId = styleMatch[1];
  let title = '';
  let imageUrl = '';
  let currentPrice = 0;
  let mrpPrice = 0;
  let inStock = true;

  // 1. Try window.__myx state if accessible from DOM
  const brand = document.querySelector('h1.pdp-title')?.innerText?.trim() || '';
  const name = document.querySelector('h1.pdp-name')?.innerText?.trim() || '';
  title = brand ? `${brand} ${name}` : (name || document.title);

  // 2. Image
  const imgEl = document.querySelector('div.image-grid-image, img.image-grid-image');
  if (imgEl) {
    imageUrl = imgEl.getAttribute('src') || '';
    if (!imageUrl && imgEl.style?.backgroundImage) {
      imageUrl = imgEl.style.backgroundImage.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    }
  }

  // 3. Current Price
  const priceEl = document.querySelector('span.pdp-price strong, span.pdp-discounted-price, span.pdp-price');
  if (priceEl && priceEl.innerText) {
    currentPrice = parsePrice(priceEl.innerText);
  }

  // 4. MRP
  const mrpEl = document.querySelector('span.pdp-mrp s, span.pdp-mrp');
  if (mrpEl && mrpEl.innerText) {
    const val = parsePrice(mrpEl.innerText);
    if (val > currentPrice) mrpPrice = val;
  }
  if (!mrpPrice) mrpPrice = currentPrice;

  if (currentPrice <= 0) return null;

  return {
    platform: 'myntra',
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
