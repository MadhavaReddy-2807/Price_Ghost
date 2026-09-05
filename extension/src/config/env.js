/**
 * Environment configuration for Price Ghost Chrome Extension.
 * Loads variables from Vite's import.meta.env with resilient fallbacks.
 */

export const API_BASE_URL = 
  (import.meta.env?.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/+$/, '') : 'https://price-ghost.onrender.com/api');

export const WEB_URL = 
  (import.meta.env?.VITE_WEB_URL ? import.meta.env.VITE_WEB_URL.replace(/\/+$/, '') : 'https://price-ghost.netlify.app');

export default {
  API_BASE_URL,
  WEB_URL,
};
