import { getAuthToken, clearAuth, getStorage } from './storage.js';
import { API_BASE_URL } from '../config/env.js';

export { API_BASE_URL };

const CANDIDATE_FALLBACK_URLS = [
  API_BASE_URL,
  'https://price-ghost.netlify.app/api',
  'https://price-ghost.onrender.com/api',
  'http://localhost:5000/api',
];

/**
 * Universal authenticated API fetch helper with Service Worker delegation and multi-tier failover.
 */
export async function apiRequest(endpoint, options = {}) {
  // 1. If running in extension context, delegate to background Service Worker first
  // (Service worker has elevated host permissions and bypasses all page CORS/CSP)
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const swResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'API_REQUEST',
            payload: { endpoint, options },
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
          const error = new Error(swResponse.error || 'Request failed');
          error.status = swResponse.status;
          throw error;
        }
      }
    } catch (swErr) {
      if (swErr.status === 401) throw swErr;
      console.warn('[Price Ghost] Service worker apiRequest failed, trying direct fetch fallback:', swErr.message);
    }
  }

  // 2. Direct fetch fallback with multi-tier failover
  const token = await getAuthToken();
  const storage = await getStorage(['apiBaseUrl']);
  const preferredUrl = storage?.apiBaseUrl || API_BASE_URL;

  const candidateBases = Array.from(new Set([
    preferredUrl,
    ...CANDIDATE_FALLBACK_URLS,
  ])).filter(Boolean);

  const headers = {
    'Content-Type': 'application/json',
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
      const timer = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        await clearAuth();
        const error = new Error(data.error || 'Authentication session expired. Please reconnect.');
        error.status = 401;
        throw error;
      }

      if (!response.ok) {
        const error = new Error(data.error || `HTTP error ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      lastError = err;
      if (err.status === 401) throw err;
      console.warn(`[Price Ghost API] Direct fetch to ${url} failed (${err.message}). Trying fallback...`);
    }
  }

  const userFacingError = new Error(
    lastError?.message?.includes('Failed to fetch')
      ? 'Cannot connect to Price Ghost server. Please verify your connection or try again shortly.'
      : (lastError?.message || 'Failed to connect to Price Ghost server.')
  );
  if (lastError?.status) userFacingError.status = lastError.status;
  throw userFacingError;
}

export async function trackItem(payload) {
  return apiRequest('/items/track', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function trackUrl(urlPayload) {
  return apiRequest('/items/track-url', {
    method: 'POST',
    body: JSON.stringify(urlPayload),
  });
}

export async function fetchTrackedItems() {
  return apiRequest('/items/tracked');
}

export async function untrackItem(itemId) {
  return apiRequest(`/items/untrack/${itemId}`, {
    method: 'DELETE',
  });
}

export async function updateThreshold(itemId, targetPercentageDrop, baseline = 'initial') {
  return apiRequest(`/items/${itemId}/threshold`, {
    method: 'PUT',
    body: JSON.stringify({ targetPercentageDrop, baseline }),
  });
}

export async function fetchDashboardSummary() {
  return apiRequest('/dashboard/summary');
}

export async function fetchActiveAlerts() {
  return apiRequest('/dashboard/alerts');
}

export async function fetchCurrentUser() {
  return apiRequest('/auth/me');
}

export async function fetchPollerStatus() {
  return apiRequest('/poller/status');
}

export async function triggerPoller(payload = {}) {
  return apiRequest('/poller/trigger', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePollerConfig(config) {
  return apiRequest('/poller/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}
