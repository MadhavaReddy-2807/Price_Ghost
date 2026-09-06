import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
  : '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization header if token exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('price_ghost_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 Unauthorized globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token if expired
      localStorage.removeItem('price_ghost_token');
      localStorage.removeItem('price_ghost_user');
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  getConfig: () => api.get('/auth/config'),
  googleLogin: (credential) => api.post('/auth/google', { credential }),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

// User API
export const userApi = {
  getPreferences: () => api.get('/user/preferences'),
  updatePreferences: (prefs) => api.put('/user/preferences', prefs),
  updateExtensionStatus: (installed) => api.put('/user/extension-status', { installed }),
};

// Items API
export const itemsApi = {
  getTracked: () => api.get('/items/tracked'),
  trackItem: (itemData) => api.post('/items/track', itemData),
  trackUrl: (urlData) => api.post('/items/track-url', urlData),
  untrackItem: (itemId) => api.delete(`/items/untrack/${itemId}`),
  updateThreshold: (itemId, targetPercentageDrop, baseline = 'initial') =>
    api.put(`/items/${itemId}/threshold`, { targetPercentageDrop, baseline }),
  getItemHistory: (itemId) => api.get(`/items/${itemId}/history`),
};

// Dashboard API
export const dashboardApi = {
  getSummary: () => api.get('/dashboard/summary'),
  getAlerts: () => api.get('/dashboard/alerts'),
};

// Poller API
export const pollerApi = {
  getStatus: () => api.get('/poller/status'),
  trigger: (data = {}) => api.post('/poller/trigger', data),
  updateConfig: (config) => api.post('/poller/config', config),
};

// Admin API
export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getUsers: (params) => api.get('/admin/users', { params }),
  updateUserAccess: (userId, hasAccess) => api.patch(`/admin/users/${userId}/access`, { hasAccess }),
  updateUserRole: (userId, role) => api.patch(`/admin/users/${userId}/role`, { role }),
  deleteUser: (userId) => api.delete(`/admin/users/${userId}`),
  getPoller: () => api.get('/admin/poller'),
  updatePollerConfig: (config) => api.post('/admin/poller/config', config),
  triggerPoller: (mode = 'all') => api.post('/admin/poller/trigger', { mode }),
};

export default api;
