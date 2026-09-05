/**
 * Promise-based wrappers for chrome.storage.local
 */

export async function getStorage(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, (result) => resolve(result || {}));
    } else {
      // Fallback for non-extension environment
      const res = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => {
        try {
          const val = localStorage.getItem(k);
          if (val) res[k] = JSON.parse(val);
        } catch {
          res[k] = localStorage.getItem(k);
        }
      });
      resolve(res);
    }
  });
}

export async function setStorage(items) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(items, () => resolve(true));
    } else {
      Object.entries(items).forEach(([k, v]) => {
        localStorage.setItem(k, typeof v === 'object' ? JSON.stringify(v) : v);
      });
      resolve(true);
    }
  });
}

export async function removeStorage(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(keys, () => resolve(true));
    } else {
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => localStorage.removeItem(k));
      resolve(true);
    }
  });
}

export async function getAuthToken() {
  const data = await getStorage(['token']);
  return data.token || null;
}

export async function setAuthToken(token) {
  return setStorage({ token });
}

export async function clearAuth() {
  return removeStorage(['token', 'user']);
}
