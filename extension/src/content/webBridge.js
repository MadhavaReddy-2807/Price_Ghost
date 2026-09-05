/**
 * Content script bridge that runs on Price Ghost Web Dashboard (localhost:5173)
 * Automatically transfers the login JWT and user profile from localStorage into chrome.storage.local
 */

function syncAuthSession() {
  try {
    const token = localStorage.getItem('price_ghost_token');
    const userStr = localStorage.getItem('price_ghost_user');

    if (token) {
      let user = null;
      try {
        user = userStr ? JSON.parse(userStr) : null;
      } catch {
        user = null;
      }

      chrome.storage.local.set({ token, user }, () => {
        console.log('[Price Ghost Extension] 👻 Session successfully synced from Web Dashboard!');
      });
    }
  } catch (err) {
    console.warn('[Price Ghost Extension] Sync error:', err);
  }
}

// 1. Check immediately when dashboard loads
syncAuthSession();

// 2. Periodic poll on dashboard tab (every 15 seconds) in case of background sign-in
setInterval(syncAuthSession, 15000);

// 3. Instant event listener for window.postMessage from Login.jsx
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRICE_GHOST_AUTH_SUCCESS') {
    const { token, user } = event.data;
    if (token) {
      chrome.storage.local.set({ token, user }, () => {
        console.log('[Price Ghost Extension] 👻 Token received via login event!');
      });
    }
  }
});
