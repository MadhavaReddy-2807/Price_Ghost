import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ServerStatusProvider, useServerStatus } from './context/ServerStatusContext.jsx';
import Navbar from './components/Navbar.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Preferences from './pages/Preferences.jsx';
import InstallExtension from './pages/InstallExtension.jsx';
import Admin from './pages/Admin.jsx';
import ServerDown from './pages/ServerDown.jsx';

function ServerStatusListener() {
  const { isServerDown } = useServerStatus();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // If server is down and not already on server-down or install page, redirect to /server-down
    if (
      isServerDown &&
      location.pathname !== '/server-down' &&
      location.pathname !== '/install'
    ) {
      navigate('/server-down', {
        state: { returnTo: location.pathname + location.search },
        replace: true,
      });
    }
  }, [isServerDown, location.pathname, location.search, navigate]);

  return null;
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Checking session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Checking session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function App() {
  return (
    <ServerStatusProvider>
      <AuthProvider>
        <BrowserRouter>
          <ServerStatusListener />
          <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/preferences"
                  element={
                    <ProtectedRoute>
                      <Preferences />
                    </ProtectedRoute>
                  }
                />
                <Route path="/install" element={<InstallExtension />} />
                <Route
                  path="/admin"
                  element={
                    <AdminRoute>
                      <Admin />
                    </AdminRoute>
                  }
                />
                <Route path="/server-down" element={<ServerDown />} />
                <Route path="/maintenance" element={<Navigate to="/server-down" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ServerStatusProvider>
  );
}
