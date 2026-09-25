import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ServerOff,
  RefreshCw,
  AlertTriangle,
  Mail,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Activity,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { API_BASE_URL, healthApi } from '../services/api.js';
import { useServerStatus } from '../context/ServerStatusContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function ServerDown() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const {
    isServerDown,
    serverDownInfo,
    checkServerHealth,
    resetServerDown,
  } = useServerStatus();

  const [isChecking, setIsChecking] = useState(false);
  const [statusResult, setStatusResult] = useState(null); // 'online' | 'offline' | null
  const [lastCheckedTime, setLastCheckedTime] = useState(() => new Date().toLocaleTimeString());
  const [countdown, setCountdown] = useState(15);
  const [isPaused, setIsPaused] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const contactEmail =
    import.meta.env.VITE_ADMIN_CONTACT_EMAIL || 'madhava2807@gmail.com';
  const returnTo = location.state?.returnTo || (isAuthenticated ? '/dashboard' : '/');

  // Trigger manual or automatic health check
  const handleCheckHealth = useCallback(async () => {
    setIsChecking(true);
    setStatusResult(null);
    try {
      const isUp = await checkServerHealth();
      setLastCheckedTime(new Date().toLocaleTimeString());
      if (isUp) {
        setStatusResult('online');
        resetServerDown();
        // Automatically redirect back after brief moment of success confirmation
        setTimeout(() => {
          navigate(returnTo, { replace: true });
        }, 1800);
      } else {
        setStatusResult('offline');
        setCountdown(15);
      }
    } catch {
      setStatusResult('offline');
      setLastCheckedTime(new Date().toLocaleTimeString());
      setCountdown(15);
    } finally {
      setIsChecking(false);
    }
  }, [checkServerHealth, resetServerDown, navigate, returnTo]);

  // Countdown timer for automatic re-check
  useEffect(() => {
    if (statusResult === 'online' || isPaused) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleCheckHealth();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [statusResult, isPaused, handleCheckHealth]);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(contactEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  return (
    <div className="min-h-[88vh] flex items-center justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-6">
        
        {/* Main Status Container */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden text-center relative">
          {/* Top colored status stripe */}
          <div
            className={`h-2.5 w-full transition-colors duration-500 ${
              statusResult === 'online'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                : 'bg-gradient-to-r from-rose-500 via-amber-500 to-red-600'
            }`}
          />

          <div className="p-8 sm:p-12 space-y-6">
            
            {/* Status Icon Badge */}
            <div className="relative inline-flex items-center justify-center">
              <div
                className={`w-24 h-24 rounded-3xl flex items-center justify-center transition-all duration-500 shadow-lg ${
                  statusResult === 'online'
                    ? 'bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/70 scale-105'
                    : 'bg-rose-50 text-rose-600 ring-8 ring-rose-50/70'
                }`}
              >
                {statusResult === 'online' ? (
                  <CheckCircle2 className="w-12 h-12 animate-bounce" />
                ) : (
                  <ServerOff className="w-12 h-12" />
                )}
              </div>
              
              {/* Pulsing state indicator dot */}
              <span className="absolute top-0 right-0 flex h-5 w-5 -mt-1 -mr-1">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    statusResult === 'online' ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-5 w-5 border-2 border-white ${
                    statusResult === 'online' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
              </span>
            </div>

            {/* Title & Primary Headings */}
            <div className="space-y-2">
              <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-rose-100 text-rose-800">
                <Radio className="w-3.5 h-3.5 animate-pulse text-rose-600" />
                <span>Service Unavailable</span>
              </div>
              
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Server Down
              </h1>

              {/* Explicit Maintenance Notice */}
              <div className="mt-3 p-4 bg-amber-50 border border-amber-200/90 rounded-2xl text-amber-900 shadow-sm max-w-lg mx-auto">
                <div className="flex items-center justify-center space-x-2 text-base sm:text-lg font-bold">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <span>Maintenance is going on, please contact user</span>
                </div>
                <p className="mt-1 text-xs sm:text-sm text-amber-800">
                  Our core backend engine is currently offline for scheduled maintenance or upgrades.
                  All tracked items are safely preserved.
                </p>
              </div>
            </div>

            {/* Online Reconnect Notification Banner */}
            {statusResult === 'online' && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 flex items-center justify-center space-x-3 text-sm font-semibold animate-fade-in">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span>Backend connection restored! Redirecting you back...</span>
              </div>
            )}

            {/* Real-time Health Checker & Countdown */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
              <div className="flex items-center space-x-2.5">
                <Activity className="w-4 h-4 text-slate-400" />
                <span>
                  Last check: <strong className="text-slate-800">{lastCheckedTime}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Auto-check in <strong>{countdown}s</strong></span>
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPaused(!isPaused)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-600 font-medium transition"
                >
                  {isPaused ? 'Resume Auto-check' : 'Pause'}
                </button>

                <button
                  type="button"
                  onClick={handleCheckHealth}
                  disabled={isChecking}
                  className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  <span>{isChecking ? 'Testing...' : 'Check Status'}</span>
                </button>
              </div>
            </div>

            {/* Contact User / Administrator Section */}
            <div className="border-t border-slate-100 pt-6 space-y-3 text-left">
              <div className="flex items-center space-x-2 text-slate-800 font-semibold text-sm">
                <Mail className="w-4 h-4 text-indigo-600" />
                <span>Contact Administrator / User</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                If this downtime is unexpected or you need immediate assistance with an active tracking alert,
                please contact the user/administrator directly:
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="truncate text-xs font-mono text-slate-700 select-all">
                  {contactEmail}
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-medium text-slate-700 transition"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`mailto:${contactEmail}?subject=Price%20Ghost%20Server%20Maintenance%20Query&body=Hello,%0A%0AI%20am%20seeing%20the%20Server%20Down%20maintenance%20page%20on%20Price%20Ghost.%20Could%20you%20please%20provide%20an%20update?`}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg text-xs font-medium text-indigo-700 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Send Email</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Diagnostic Drawer */}
            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-600 transition"
              >
                <span>Technical Diagnostics</span>
                {showDiagnostics ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showDiagnostics && (
                <div className="mt-3 p-3.5 bg-slate-900 text-slate-200 rounded-xl text-left text-xs font-mono space-y-1.5 overflow-x-auto shadow-inner">
                  <p>
                    <span className="text-slate-400">Target API Base: </span>
                    <span className="text-indigo-300">{API_BASE_URL}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">Probe Endpoint: </span>
                    <span className="text-indigo-300">{API_BASE_URL}/health</span>
                  </p>
                  <p>
                    <span className="text-slate-400">Detected Status: </span>
                    <span className="text-rose-400">
                      {serverDownInfo?.status || '503 Service Unavailable / Connection Refused'}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-400">Last Probe: </span>
                    <span className="text-slate-300">{serverDownInfo?.timestamp || lastCheckedTime}</span>
                  </p>
                  {serverDownInfo?.error && (
                    <p>
                      <span className="text-slate-400">Reason: </span>
                      <span className="text-amber-300">{serverDownInfo.error}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Back / Navigation button */}
            <div className="pt-2 flex justify-center">
              <Link
                to={returnTo}
                className="inline-flex items-center space-x-1.5 text-xs text-slate-500 hover:text-indigo-600 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Try Returning to {isAuthenticated ? 'Dashboard' : 'Home'}</span>
              </Link>
            </div>

          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-400">
          👻 Price Ghost Tracker • Multi-Platform Automated E-Commerce Monitor
        </p>

      </div>
    </div>
  );
}
