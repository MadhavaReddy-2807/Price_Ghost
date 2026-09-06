import { API_BASE_URL, WEB_URL } from '../config/env.js';

let hostElement = null;
let shadowRoot = null;
let currentProduct = null;
let isCardOpen = false;
let isMinimized = false;
let selectedThreshold = 10;
let isSaving = false;
let statusMessage = '';

/**
 * Calculates target price given baseline and percentage drop.
 */
function calculateTargetPrice(price, dropPct) {
  if (!price || price <= 0) return 0;
  const target = price * (1 - dropPct / 100);
  return Math.round(target * 100) / 100;
}

/**
 * Formats Indian Rupee currency.
 */
function formatRupee(amount) {
  if (!amount && amount !== 0) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN');
}

/**
 * Retrieves tracked status and data for current product key.
 */
async function getTrackingStatus(product) {
  if (!product || typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { isTracked: false, token: null, trackingInfo: null };
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(['token', 'trackedKeys', 'defaultThreshold', 'user'], (data) => {
      const token = data.token;
      const key = `${product.platform}:${product.externalId}`;
      const trackedKeys = data.trackedKeys || {};
      const trackingInfo = trackedKeys[key] || null;
      resolve({
        isTracked: Boolean(trackingInfo),
        token,
        trackingInfo,
        defaultThreshold: data.defaultThreshold || 10,
        user: data.user || null,
      });
    });
  });
}

/**
 * Sends track request to backend (delegates to Service Worker to bypass web-page CSP & CORS).
 */
async function trackProductWithBackend(product, token, dropPercentage) {
  const payload = {
    ...product,
    targetPercentageDrop: dropPercentage,
    baseline: 'initial',
  };

  // 1. First choice: delegate to Extension Service Worker (immune to host page CSP/CORS)
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const swResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'TRACK_ITEM',
            payload,
            token,
          },
          (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          }
        );
      });

      if (swResponse) {
        if (swResponse.success) {
          return swResponse.data;
        } else {
          throw new Error(swResponse.error || 'Failed to track product.');
        }
      }
    } catch (swErr) {
      if (swErr.message?.includes('Extension context invalidated')) {
        throw new Error('Price Ghost extension was reloaded. Please refresh this page.');
      }
      console.warn('[Price Ghost] Service worker track failed, attempting direct fetch fallback:', swErr.message);
    }
  }

  // 2. Direct fallback (Render direct -> Netlify proxy)
  const candidateBases = [
    API_BASE_URL,
    'https://price-ghost.netlify.app/api',
    'https://price-ghost.onrender.com/api',
  ];

  let lastErr = null;
  for (const base of candidateBases) {
    try {
      const response = await fetch(`${base.replace(/\/+$/, '')}/items/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get(['trackedKeys'], (res) => {
            const trackedKeys = res.trackedKeys || {};
            const key = `${product.platform}:${product.externalId}`;
            trackedKeys[key] = {
              itemId: result.item?._id,
              targetPercentageDrop: dropPercentage,
              targetPrice: result.tracking?.targetPrice || calculateTargetPrice(product.currentPrice, dropPercentage),
              baselinePrice: product.currentPrice,
              trackedAt: Date.now(),
            };
            chrome.storage.local.set({ trackedKeys });
          });

          if (chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: 'ITEM_TRACKED', payload: result }).catch(() => {});
          }
        }
        return result;
      } else {
        throw new Error(result.error || `Server responded with status ${response.status}`);
      }
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Failed to connect to Price Ghost tracker service.');
}

/**
 * Untracks product from backend (delegates to Service Worker to bypass web-page CSP & CORS).
 */
async function untrackProductWithBackend(itemId, product, token) {
  // 1. First choice: delegate to Extension Service Worker
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const swResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'UNTRACK_ITEM',
            itemId,
            platform: product?.platform,
            externalId: product?.externalId,
            token,
          },
          (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          }
        );
      });

      if (swResponse) {
        if (swResponse.success) return swResponse.data;
        throw new Error(swResponse.error || 'Failed to untrack item.');
      }
    } catch (swErr) {
      if (swErr.message?.includes('Extension context invalidated')) {
        throw new Error('Price Ghost extension was reloaded. Please refresh this page.');
      }
      console.warn('[Price Ghost] Service worker untrack failed, attempting direct fetch fallback:', swErr.message);
    }
  }

  // 2. Direct fallback
  const response = await fetch(`${API_BASE_URL}/items/untrack/${itemId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to untrack item.');
  }

  // Remove from local trackedKeys
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['trackedKeys'], (res) => {
      const trackedKeys = res.trackedKeys || {};
      const key = `${product.platform}:${product.externalId}`;
      delete trackedKeys[key];
      chrome.storage.local.set({ trackedKeys });
    });

    if (chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' }).catch(() => {});
    }
  }
}

/**
 * CSS Styles inside Shadow DOM.
 */
const STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #1e293b;
    box-sizing: border-box;
    z-index: 2147483647;
    position: fixed;
    bottom: 24px;
    right: 24px;
    pointer-events: auto;
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* Floating Pill */
  .pg-floating-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 9999px;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.4), 0 8px 10px -6px rgba(79, 70, 229, 0.3);
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
    outline: none;
  }

  .pg-floating-pill:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 14px 28px -5px rgba(79, 70, 229, 0.5), 0 10px 12px -6px rgba(79, 70, 229, 0.4);
  }

  .pg-floating-pill.tracked {
    background: linear-gradient(135deg, #059669 0%, #10b981 100%);
    box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4), 0 8px 10px -6px rgba(16, 185, 129, 0.3);
  }

  .pg-ghost-icon {
    font-size: 16px;
    line-height: 1;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
  }

  .pg-price-tag {
    background: rgba(255, 255, 255, 0.2);
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .pg-min-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    font-size: 11px;
    margin-left: 2px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  .pg-min-toggle:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.35);
  }

  /* Minimized Bubble */
  .pg-bubble-minimized {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    box-shadow: 0 8px 20px rgba(79, 70, 229, 0.4);
    cursor: pointer;
    border: 2px solid white;
    transition: transform 0.2s;
  }
  .pg-bubble-minimized:hover {
    transform: scale(1.1);
  }

  /* Popover Card */
  .pg-card {
    position: absolute;
    bottom: 58px;
    right: 0;
    width: 325px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    animation: pgSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes pgSlideUp {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .pg-card-header {
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #e2e8f0;
  }

  .pg-brand {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: 13px;
    color: #1e293b;
  }

  .pg-platform-pill {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 4px;
    background: #e0e7ff;
    color: #4338ca;
  }

  .pg-close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    padding: 4px;
    border-radius: 4px;
  }
  .pg-close-btn:hover {
    color: #475569;
    background: #e2e8f0;
  }

  .pg-card-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pg-prod-title {
    font-size: 12px;
    font-weight: 600;
    color: #0f172a;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.35;
  }

  .pg-price-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .pg-current-price {
    font-size: 18px;
    font-weight: 800;
    color: #4f46e5;
  }

  .pg-mrp-price {
    font-size: 12px;
    color: #94a3b8;
    text-decoration: line-through;
  }

  .pg-section-label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .pg-threshold-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .pg-thresh-btn {
    padding: 6px 0;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    transition: all 0.15s;
    text-align: center;
  }

  .pg-thresh-btn:hover {
    border-color: #cbd5e1;
    background: #f8fafc;
  }

  .pg-thresh-btn.active {
    border-color: #4f46e5;
    background: #eef2ff;
    color: #4f46e5;
    font-weight: 700;
  }

  .pg-slider-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pg-range-input {
    flex: 1;
    accent-color: #4f46e5;
    cursor: pointer;
  }

  .pg-target-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pg-target-title {
    font-size: 11px;
    color: #64748b;
  }

  .pg-target-price {
    font-size: 14px;
    font-weight: 800;
    color: #059669;
  }

  .pg-action-btn {
    width: 100%;
    padding: 11px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .pg-action-btn:hover {
    box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
    filter: brightness(1.05);
  }

  .pg-action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .pg-btn-danger {
    background: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fecaca;
    padding: 8px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    transition: background 0.15s;
  }
  .pg-btn-danger:hover {
    background: #fecaca;
  }

  .pg-status-banner {
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
  }

  .pg-status-banner.success {
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .pg-status-banner.error {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }
`;

/**
 * Main render function inside Shadow DOM.
 */
async function renderWidget() {
  if (!shadowRoot || !currentProduct) return;

  const { isTracked, token, trackingInfo, defaultThreshold, user } = await getTrackingStatus(currentProduct);

  if (isMinimized) {
    shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="pg-bubble-minimized" title="Price Ghost — Click to expand">
        👻
      </div>
    `;

    shadowRoot.querySelector('.pg-bubble-minimized')?.addEventListener('click', () => {
      isMinimized = false;
      renderWidget();
    });
    return;
  }

  const priceFormatted = formatRupee(currentProduct.currentPrice);
  const targetPrice = calculateTargetPrice(currentProduct.currentPrice, selectedThreshold);
  const targetSavings = currentProduct.currentPrice - targetPrice;

  const pillText = isTracked
    ? `Tracked (-${trackingInfo?.targetPercentageDrop || 10}%)`
    : `Track Price`;

  const html = `
    <style>${STYLES}</style>

    ${
      isCardOpen
        ? `
      <div class="pg-card">
        <div class="pg-card-header">
          <div class="pg-brand">
            <span>👻</span>
            <span>Price Ghost</span>
            <span class="pg-platform-pill">${currentProduct.platform}</span>
          </div>
          <button class="pg-close-btn" id="pg-card-close" title="Close">✕</button>
        </div>

        <div class="pg-card-body">
          <p class="pg-prod-title" title="${currentProduct.title}">
            ${currentProduct.title}
          </p>

          <div class="pg-price-row">
            <span class="pg-current-price">${priceFormatted}</span>
            ${
              currentProduct.mrpPrice && currentProduct.mrpPrice > currentProduct.currentPrice
                ? `<span class="pg-mrp-price">${formatRupee(currentProduct.mrpPrice)}</span>`
                : ''
            }
          </div>

          ${
            statusMessage
              ? `<div class="pg-status-banner ${statusMessage.type}">${statusMessage.text}</div>`
              : ''
          }

          ${
            !token
              ? `
            <div style="padding: 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; text-align: center;">
              <p style="font-size: 12px; color: #92400e; font-weight: 600; margin-bottom: 8px;">
                Sign in to track price drops!
              </p>
              <p style="font-size: 11px; color: #b45309; margin-bottom: 10px;">
                Connect Price Ghost to receive email alerts when this item's price falls.
              </p>
              <button id="pg-open-dashboard" class="pg-action-btn" style="font-size: 12px; padding: 8px;">
                Open Price Ghost Dashboard →
              </button>
            </div>
            `
              : isTracked
              ? `
            <div style="padding: 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 12px; font-weight: 700; color: #065f46;">
                  Currently Monitored
                </span>
                <span style="font-size: 11px; font-weight: 700; color: #059669; background: #d1fae5; padding: 2px 6px; border-radius: 4px;">
                  -${trackingInfo?.targetPercentageDrop || 10}% Target
                </span>
              </div>
              <p style="font-size: 11px; color: #047857;">
                Alert Price: <strong>${formatRupee(trackingInfo?.targetPrice || targetPrice)}</strong>
              </p>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 4px;">
              <button id="pg-untrack-btn" class="pg-btn-danger">
                Remove from Tracking
              </button>
            </div>
            `
              : `
            <div>
              <span class="pg-section-label">Alert me when price drops by:</span>
              <div class="pg-threshold-grid" style="margin-top: 6px; margin-bottom: 8px;">
                ${[5, 10, 15, 20]
                  .map(
                    (pct) => `
                  <button class="pg-thresh-btn ${selectedThreshold === pct ? 'active' : ''}" data-pct="${pct}">
                    ${pct}%
                  </button>
                `
                  )
                  .join('')}
              </div>

              <div class="pg-slider-wrap">
                <input
                  type="range"
                  id="pg-thresh-slider"
                  class="pg-range-input"
                  min="1"
                  max="90"
                  value="${selectedThreshold}"
                />
                <span style="font-size: 12px; font-weight: 800; color: #4f46e5; width: 32px; text-align: right;">
                  ${selectedThreshold}%
                </span>
              </div>
            </div>

            <div class="pg-target-box">
              <div>
                <p class="pg-target-title">Notify below</p>
                <p class="pg-target-price">${formatRupee(targetPrice)}</p>
              </div>
              <div style="text-align: right;">
                <p class="pg-target-title">You Save</p>
                <p style="font-size: 12px; font-weight: 700; color: #4f46e5;">${formatRupee(targetSavings)}</p>
              </div>
            </div>

            <button id="pg-track-submit" class="pg-action-btn" ${isSaving ? 'disabled' : ''}>
              ${isSaving ? 'Activating Tracker...' : '👻 Track This Product'}
            </button>
            `
          }
        </div>
      </div>
    `
        : ''
    }

    <div class="pg-floating-pill ${isTracked ? 'tracked' : ''}" id="pg-pill-btn">
      <span class="pg-ghost-icon">${isTracked ? '✓' : '👻'}</span>
      <span>${pillText}</span>
      <span class="pg-price-tag">${priceFormatted}</span>
      <span class="pg-min-toggle" id="pg-min-btn" title="Minimize">−</span>
    </div>
  `;

  shadowRoot.innerHTML = html;
  bindEvents(token, isTracked, trackingInfo);
}

/**
 * Event listeners inside Shadow DOM.
 */
function bindEvents(token, isTracked, trackingInfo) {
  if (!shadowRoot) return;

  // Toggle card open/close from pill
  shadowRoot.querySelector('#pg-pill-btn')?.addEventListener('click', (e) => {
    if (e.target.closest('#pg-min-btn')) return;
    isCardOpen = !isCardOpen;
    statusMessage = '';
    renderWidget();
  });

  // Minimize pill to bubble
  shadowRoot.querySelector('#pg-min-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isMinimized = true;
    isCardOpen = false;
    renderWidget();
  });

  // Close card
  shadowRoot.querySelector('#pg-card-close')?.addEventListener('click', () => {
    isCardOpen = false;
    statusMessage = '';
    renderWidget();
  });

  // Open dashboard when not signed in
  shadowRoot.querySelector('#pg-open-dashboard')?.addEventListener('click', () => {
    window.open(`${WEB_URL}/dashboard`, '_blank');
  });

  // Threshold buttons
  shadowRoot.querySelectorAll('.pg-thresh-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedThreshold = Number(btn.getAttribute('data-pct'));
      renderWidget();
    });
  });

  // Range slider
  shadowRoot.querySelector('#pg-thresh-slider')?.addEventListener('input', (e) => {
    selectedThreshold = Number(e.target.value);
    renderWidget();
  });

  // Submit manual track
  shadowRoot.querySelector('#pg-track-submit')?.addEventListener('click', async () => {
    if (!currentProduct || !token) return;
    isSaving = true;
    statusMessage = '';
    renderWidget();

    try {
      await trackProductWithBackend(currentProduct, token, selectedThreshold);
      statusMessage = { type: 'success', text: `🎉 Price tracker set for -${selectedThreshold}% drop!` };
      setTimeout(() => {
        isCardOpen = false;
        renderWidget();
      }, 2000);
    } catch (err) {
      statusMessage = { type: 'error', text: err.message || 'Failed to track product.' };
    } finally {
      isSaving = false;
      renderWidget();
    }
  });

  // Untrack item
  shadowRoot.querySelector('#pg-untrack-btn')?.addEventListener('click', async () => {
    if (!trackingInfo?.itemId || !token) return;
    if (!confirm('Stop tracking this product?')) return;

    try {
      await untrackProductWithBackend(trackingInfo.itemId, currentProduct, token);
      statusMessage = { type: 'success', text: 'Product removed from tracking.' };
      setTimeout(() => {
        isCardOpen = false;
        renderWidget();
      }, 1500);
    } catch (err) {
      alert('Failed to untrack: ' + err.message);
    }
  });
}

/**
 * Mounts or updates the in-page track button for a detected product.
 */
export function mountOrUpdateTrackButton(product) {
  if (!product || !product.externalId || product.currentPrice <= 0) {
    removeTrackButton();
    return;
  }

  currentProduct = product;

  if (!hostElement) {
    hostElement = document.createElement('div');
    hostElement.id = 'price-ghost-extension-root';
    shadowRoot = hostElement.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(hostElement);
  }

  renderWidget();
}

/**
 * Removes the track button from page.
 */
export function removeTrackButton() {
  if (hostElement && hostElement.parentNode) {
    hostElement.parentNode.removeChild(hostElement);
  }
  hostElement = null;
  shadowRoot = null;
  currentProduct = null;
}
