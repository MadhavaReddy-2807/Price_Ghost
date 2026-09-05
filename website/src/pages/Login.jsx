import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { authApi } from '../services/api.js';
import { AlertCircle, RefreshCw, Sparkles, ShieldCheck } from 'lucide-react';

export default function Login() {
  const { loginWithGoogle, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const googleBtnRef = useRef(null);

  const redirectPath = location.state?.from || '/dashboard';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectPath, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectPath]);

  // Fetch Google Client ID from Vite env or backend
  useEffect(() => {
    const viteCid = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (viteCid) {
      setGoogleClientId(viteCid);
      return;
    }

    async function loadConfig() {
      try {
        const res = await authApi.getConfig();
        const cid = res.data?.googleClientId;
        if (cid) {
          setGoogleClientId(cid);
        }
      } catch (err) {
        console.error('Failed to load auth config:', err);
      }
    }
    loadConfig();
  }, []);

  // Initialize Google Identity Services button
  useEffect(() => {
    if (!googleClientId) return;

    const initGoogle = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse,
        });

        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
        });
      }
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const timer = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(timer);
          initGoogle();
        }
      }, 300);
      return () => clearInterval(timer);
    }
  }, [googleClientId]);

  async function handleCredentialResponse(response) {
    if (!response.credential) {
      setError('Google Sign-In was cancelled or failed.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await loginWithGoogle(response.credential);

      // Post message so webBridge extension content script receives token immediately
      window.postMessage({
        type: 'PRICE_GHOST_AUTH_SUCCESS',
        token: data.token,
        user: data.user,
      }, '*');

      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/80 shadow-sm text-center">
        <div>
          <div className="w-16 h-16 mx-auto bg-gradient-to-tr from-indigo-50 to-violet-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-xs">
            <span className="text-3xl">👻</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Sign In with Google
          </h2>
          <p className="mt-2 text-sm text-slate-500 max-w-xs mx-auto">
            Log in to Price Ghost to track prices and receive price-drop alert emails.
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center space-x-2 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Google Sign-In Button Container */}
        <div className="pt-4 pb-2 flex flex-col items-center justify-center space-y-4">
          {loading ? (
            <div className="flex items-center space-x-2 text-sm text-indigo-600 font-medium py-3">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Authenticating with Google...</span>
            </div>
          ) : (
            <div className="flex justify-center w-full min-h-[44px]">
              <div ref={googleBtnRef} className="flex justify-center" />
            </div>
          )}

          {!googleClientId && (
            <div className="p-3.5 bg-amber-50 text-amber-800 text-xs rounded-xl border border-amber-200 text-left space-y-1">
              <p className="font-semibold">⚠️ GOOGLE_CLIENT_ID missing in server/.env</p>
              <p className="text-[11px] text-amber-700">
                Please paste your Google OAuth Client ID in <code>server/.env</code> and restart the server to enable the official Google button.
              </p>
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-slate-100 flex items-center justify-center space-x-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Secure Google OAuth 2.0 authentication</span>
        </div>
      </div>
    </div>
  );
}
