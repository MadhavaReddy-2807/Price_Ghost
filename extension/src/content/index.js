import { extractAmazonPageData } from './amazon.js';
import { extractFlipkartPageData } from './flipkart.js';
import { extractMyntraPageData } from './myntra.js';
import { initSpaNavigationWatcher } from './spaWatcher.js';
import { API_BASE_URL } from '../config/env.js';
import { mountOrUpdateTrackButton, removeTrackButton } from './trackButton.js';

function extractProduct() {
  const host = window.location.hostname;
  if (host.includes('amazon.')) {
    return extractAmazonPageData();
  }
  if (host.includes('flipkart.')) {
    return extractFlipkartPageData();
  }
  if (host.includes('myntra.')) {
    return extractMyntraPageData();
  }
  return null;
}

let lastProductKey = null;
let retryTimer = null;
let attemptCount = 0;
const MAX_ATTEMPTS = 6;
const RETRY_INTERVALS = [500, 1200, 2500, 4000, 6000, 9000];

async function trackProductWithBackend(product, token, defaultThreshold) {
  try {
    const payload = {
      ...product,
      targetPercentageDrop: defaultThreshold || 10,
      baseline: 'initial',
    };

    console.log(`[Price Ghost] 🚀 Sending manual track request for "${product.title}"...`);

    const response = await fetch(`${API_BASE_URL}/items/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[Price Ghost] 👻 Tracked product successfully:', data.item?.title || product.title);

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['trackedKeys'], (res) => {
          const trackedKeys = res.trackedKeys || {};
          const key = `${product.platform}:${product.externalId}`;
          trackedKeys[key] = {
            itemId: data.item?._id,
            targetPercentageDrop: defaultThreshold || 10,
            trackedAt: Date.now(),
          };
          chrome.storage.local.set({ trackedKeys });
        });
      }

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'ITEM_TRACKED',
          payload: data,
        }).catch(() => {});
      }
      return true;
    } else {
      const errText = await response.text();
      console.warn('[Price Ghost] Backend returned status:', response.status, errText);
      return false;
    }
  } catch (err) {
    console.warn('[Price Ghost] Backend connection error:', err.message);
    return false;
  }
}

async function handlePageProduct() {
  const product = extractProduct();

  // If page hasn't finished loading price yet, schedule next attempt
  if (!product || !product.externalId || product.currentPrice <= 0) {
    if (attemptCount < MAX_ATTEMPTS) {
      const delay = RETRY_INTERVALS[attemptCount] || 2000;
      attemptCount++;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(handlePageProduct, delay);
    } else {
      removeTrackButton();
    }
    return;
  }

  const currentKey = `${product.platform}:${product.externalId}`;

  // Product found! Save to storage for quick access in extension popup
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({
      lastSeenProduct: {
        ...product,
        detectedAt: Date.now(),
      }
    });
  }

  console.log(`[Price Ghost] 🎯 Detected ${product.platform} product: "${product.title}" @ ₹${product.currentPrice}`);

  // Mount or update the floating manual track button (NO AUTO TRACK)
  lastProductKey = currentKey;
  mountOrUpdateTrackButton(product);
}

// Reset retry counter on new URL and run detection
function startProductDetection() {
  attemptCount = 0;
  clearTimeout(retryTimer);
  handlePageProduct();
}

// Run as soon as DOM is ready or interactive
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startProductDetection();
  });
} else {
  startProductDetection();
}

// Watch for client-side dynamic navigations / variant changes
initSpaNavigationWatcher(() => {
  startProductDetection();
});

// Also observe DOM mutations in main content area for lazy-loaded pricing
let mutationDebounce = null;
const observer = new MutationObserver(() => {
  clearTimeout(mutationDebounce);
  mutationDebounce = setTimeout(() => {
    handlePageProduct();
  }, 1000);
});

const targetNode = document.body || document.documentElement;
if (targetNode) {
  observer.observe(targetNode, { childList: true, subtree: true });
}

// Allow popup to query or force track current page
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_PAGE_PRODUCT') {
      const prod = extractProduct();
      sendResponse({ product: prod });
    } else if (request.type === 'REFRESH_PAGE_BUTTON' || request.type === 'ITEM_TRACKED') {
      const prod = extractProduct();
      if (prod) mountOrUpdateTrackButton(prod);
      sendResponse({ updated: true });
    } else if (request.type === 'FORCE_TRACK_PAGE') {
      const prod = extractProduct();
      if (prod && prod.currentPrice > 0) {
        if (chrome.storage?.local) {
          chrome.storage.local.get(['token', 'defaultThreshold'], async (storage) => {
            if (storage.token) {
              const threshold = request.targetPercentageDrop || storage.defaultThreshold || 10;
              const ok = await trackProductWithBackend(prod, storage.token, threshold);
              if (ok) mountOrUpdateTrackButton(prod);
              sendResponse({ success: ok, product: prod });
            } else {
              sendResponse({ success: false, error: 'Not logged in' });
            }
          });
        }
      } else {
        sendResponse({ success: false, error: 'Could not extract product details' });
      }
      return true; // async sendResponse
    }
  });
}
