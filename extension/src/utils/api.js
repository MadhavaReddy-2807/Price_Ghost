import { getAuthToken } from './storage.js';
import { API_BASE_URL } from '../config/env.js';

export { API_BASE_URL };

/**
 * Universal authenticated API fetch helper.
 */
export async function apiRequest(endpoint, options = {}) {
  const token = await getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `HTTP error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
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
