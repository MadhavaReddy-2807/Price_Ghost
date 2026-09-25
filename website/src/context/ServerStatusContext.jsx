import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { healthApi } from '../services/api.js';

const ServerStatusContext = createContext(null);

export function ServerStatusProvider({ children }) {
  const [isServerDown, setIsServerDown] = useState(false);
  const [serverDownInfo, setServerDownInfo] = useState(null);

  // Health check helper to test if server is back up
  const checkServerHealth = useCallback(async () => {
    try {
      const res = await healthApi.checkHealth();
      // Server returned healthy response
      if (res.status === 200) {
        setIsServerDown(false);
        setServerDownInfo(null);
        return true;
      }
      return false;
    } catch (err) {
      const status = err.response?.status || 'OFFLINE';
      const isDown = !err.response || [502, 503, 504].includes(status);
      if (isDown) {
        setIsServerDown(true);
        setServerDownInfo({
          status,
          error: err.response?.data?.error || 'Server Down',
          message:
            err.response?.data?.message ||
            'Maintenance is going on, please contact user',
          timestamp: new Date().toLocaleTimeString(),
        });
        return false;
      }
      // If server responded with e.g. 404 or other status, server process itself is reachable
      setIsServerDown(false);
      return true;
    }
  }, []);

  const resetServerDown = useCallback(() => {
    setIsServerDown(false);
    setServerDownInfo(null);
  }, []);

  // Listen for global server down events dispatched by Axios interceptor
  useEffect(() => {
    const handleServerDownEvent = (event) => {
      setIsServerDown(true);
      if (event.detail) {
        setServerDownInfo(event.detail);
      }
    };

    window.addEventListener('price_ghost_server_down', handleServerDownEvent);
    return () => {
      window.removeEventListener('price_ghost_server_down', handleServerDownEvent);
    };
  }, []);

  // Initial connectivity check on startup
  useEffect(() => {
    checkServerHealth();
  }, [checkServerHealth]);

  return (
    <ServerStatusContext.Provider
      value={{
        isServerDown,
        serverDownInfo,
        checkServerHealth,
        resetServerDown,
        setIsServerDown,
      }}
    >
      {children}
    </ServerStatusContext.Provider>
  );
}

export function useServerStatus() {
  const ctx = useContext(ServerStatusContext);
  if (!ctx) {
    throw new Error('useServerStatus must be used within a ServerStatusProvider');
  }
  return ctx;
}
