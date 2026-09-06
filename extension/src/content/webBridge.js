/**
 * Content script bridge that runs on Price Ghost Web Dashboard (localhost:5173 & price-ghost.netlify.app)
 * Automatically transfers the login JWT and user profile from localStorage into chrome.storage.local
 */

function getDetectedApiUrl() {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }
  return 'https://price-ghost.onrender.com/api';
}

function syncAuthSession() {
  try {
    const token = localStorage.getItem('price_ghost_token');
    const userStr = localStorage.getItem('price_ghost_user');
    const apiBaseUrl = getDetectedApiUrl();

    if (token) {
      let user = null;
      try {
        user = userStr ? JSON.parse(userStr) : null;
      } catch {
        user = null;
      }

      chrome.storage.local.set({ token, user, apiBaseUrl }, () => {
        console.log('[Price Ghost Extension] 👻 Session successfully synced from Web Dashboard!');
        if (chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' }).catch(() => {});
        }
      });
    } else if (window.location.pathname.includes('/login')) {
      // User is on login page without token - sync logout
      chrome.storage.local.remove(['token', 'user']);
    }
  } catch (err) {
    console.warn('[Price Ghost Extension] Sync error:', err);
  }
}

// 1. Check immediately when dashboard loads
syncAuthSession();

// 2. Periodic poll on dashboard tab (every 10 seconds) in case of background sign-in
setInterval(syncAuthSession, 10000);

// 3. Instant event listener for window.postMessage from Login.jsx
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRICE_GHOST_AUTH_SUCCESS') {
    const { token, user } = event.data;
    const apiBaseUrl = getDetectedApiUrl();
    if (token) {
      chrome.storage.local.set({ token, user, apiBaseUrl }, () => {
        console.log('[Price Ghost Extension] 👻 Token received via login event!');
        if (chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' }).catch(() => {});
        }
      });
    }
  } else if (event.data && event.data.type === 'PRICE_GHOST_LOGOUT') {
    chrome.storage.local.remove(['token', 'user'], () => {
      console.log('[Price Ghost Extension] 👻 Logged out via web event.');
    });
  }
});
