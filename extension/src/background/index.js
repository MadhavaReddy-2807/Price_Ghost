import { API_BASE_URL } from '../config/env.js';

const CANDIDATE_URLS = [
  API_BASE_URL,
  'https://price-ghost.netlify.app/api',
  'https://price-ghost.onrender.com/api',
  'http://localhost:5000/api',
];

/**
 * Universal backend fetcher running in Service Worker context.
 * Elevated host permissions bypass host page CORS & CSP restrictions completely.
 */
async function serviceWorkerFetch(endpoint, options = {}, tokenOverride = null) {
  const storage = await new Promise((resolve) => {
    chrome.storage.local.get(['token', 'apiBaseUrl'], resolve);
  });

  const token = tokenOverride || storage.token;
  const preferredUrl = storage.apiBaseUrl || API_BASE_URL;

  const candidateBases = Array.from(new Set([
    preferredUrl,
    ...CANDIDATE_URLS,
  ])).filter(Boolean);

  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Type': 'extension',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let lastError = null;
  for (const base of candidateBases) {
    const cleanBase = base.replace(/\/+$/, '');
    const url = `${cleanBase}${endpoint}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        console.warn('[Price Ghost SW] Stale token rejected (401). Clearing auth storage.');
        await new Promise((resolve) => chrome.storage.local.remove(['token', 'user'], resolve));
        const err = new Error(data.error || 'Session expired. Please reconnect your account.');
        err.status = 401;
        throw err;
      }

      if (!response.ok) {
        const err = new Error(data.error || `HTTP error ${response.status}`);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      // Remember responsive endpoint if different
      if (storage.apiBaseUrl !== cleanBase && (cleanBase.startsWith('https://') || cleanBase.includes('localhost'))) {
        chrome.storage.local.set({ apiBaseUrl: cleanBase });
      }

      return data;
    } catch (err) {
      lastError = err;
      if (err.status === 401) throw err;
      console.warn(`[Price Ghost SW] Fetch to ${url} failed (${err.message}), trying next candidate...`);
    }
  }

  throw lastError || new Error('All backend endpoints are currently unreachable.');
}

/**
 * Updates the extension toolbar badge count with active price drop alerts.
 */
async function updateBadgeCount() {
  const storage = await new Promise((resolve) => chrome.storage.local.get(['token'], resolve));
  if (!storage.token) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  try {
    const summary = await serviceWorkerFetch('/dashboard/summary');
    const count = summary?.activeAlerts || 0;
    if (count > 0) {
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Emerald Green
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    // Keep or clear badge silently if offline
  }
}

// Extension installation
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Price Ghost] Extension installed / reloaded.');

  chrome.storage.local.get(['defaultThreshold', 'autoTrackEnabled'], (res) => {
    chrome.storage.local.set({
      defaultThreshold: res.defaultThreshold || 10,
      autoTrackEnabled: res.autoTrackEnabled !== false,
    });
  });

  // Schedule periodic badge updates every 30 minutes
  chrome.alarms.create('sync_badge_alarm', { periodInMinutes: 30 });
  updateBadgeCount();
});

// Alarm listener
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync_badge_alarm') {
    updateBadgeCount();
  }
});

// Runtime message listener for content scripts & popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'API_REQUEST') {
    const { endpoint, options, token } = message.payload || {};
    serviceWorkerFetch(endpoint, options, token)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({
        success: false,
        error: err.message || 'Request failed',
        status: err.status || 500,
      }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'TRACK_ITEM') {
    const { payload, token } = message;
    serviceWorkerFetch('/items/track', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token)
      .then((data) => {
        chrome.storage.local.get(['trackedKeys'], (res) => {
          const trackedKeys = res.trackedKeys || {};
          const key = `${payload.platform}:${payload.externalId}`;
          trackedKeys[key] = {
            itemId: data.item?._id,
            targetPercentageDrop: payload.targetPercentageDrop || 10,
            targetPrice: data.tracking?.targetPrice,
            baselinePrice: payload.currentPrice,
            trackedAt: Date.now(),
          };
          chrome.storage.local.set({ trackedKeys }, () => {
            updateBadgeCount();
            sendResponse({ success: true, data });
          });
        });
      })
      .catch((err) => {
        sendResponse({
          success: false,
          error: err.message || 'Failed to track item',
          status: err.status || 500,
        });
      });
    return true; // Async channel
  }

  if (message.type === 'UNTRACK_ITEM') {
    const { itemId, platform, externalId, token } = message;
    serviceWorkerFetch(`/items/untrack/${itemId}`, {
      method: 'DELETE',
    }, token)
      .then((data) => {
        chrome.storage.local.get(['trackedKeys'], (res) => {
          const trackedKeys = res.trackedKeys || {};
          if (platform && externalId) {
            delete trackedKeys[`${platform}:${externalId}`];
          } else {
            Object.keys(trackedKeys).forEach((k) => {
              if (trackedKeys[k]?.itemId === itemId) delete trackedKeys[k];
            });
          }
          chrome.storage.local.set({ trackedKeys }, () => {
            updateBadgeCount();
            sendResponse({ success: true, data });
          });
        });
      })
      .catch((err) => {
        sendResponse({
          success: false,
          error: err.message || 'Failed to untrack item',
          status: err.status || 500,
        });
      });
    return true; // Async channel
  }

  if (message.type === 'ITEM_TRACKED' || message.type === 'REFRESH_BADGE') {
    updateBadgeCount();
    sendResponse({ received: true });
    return false;
  }

  return false;
});
