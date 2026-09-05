import { API_BASE_URL } from '../config/env.js';

/**
 * Updates the extension toolbar badge count with active price drop alerts.
 */
async function updateBadgeCount() {
  chrome.storage.local.get(['token'], async (data) => {
    const token = data.token;
    if (!token) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const summary = await response.json();
        const count = summary.activeAlerts || 0;
        if (count > 0) {
          chrome.action.setBadgeText({ text: String(count) });
          chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Emerald Green
        } else {
          chrome.action.setBadgeText({ text: '' });
        }
      }
    } catch {
      // Server not reachable, do not change badge
    }
  });
}

// Extension installation
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Price Ghost] Extension installed successfully.');

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

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ITEM_TRACKED') {
    updateBadgeCount();
    sendResponse({ received: true });
  } else if (message.type === 'REFRESH_BADGE') {
    updateBadgeCount();
    sendResponse({ received: true });
  }
  return true;
});
