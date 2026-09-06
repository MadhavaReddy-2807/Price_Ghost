import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Puzzle,
  Download,
  CheckCircle2,
  Lock,
  Clock,
  LayoutDashboard,
  LogIn,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export default function InstallExtension() {
  const { user, isAuthenticated } = useAuth();
  const hasExtensionAccess = isAuthenticated && (user?.hasAccess === true || user?.role === 'admin');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12">
      {/* Header Banner */}
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl mb-4">
          <Puzzle className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Price Ghost Chrome Extension
        </h1>
        <p className="mt-3 text-slate-600 text-base leading-relaxed">
          Enable 1-click in-page price tracking and instant drop notifications as you browse Amazon, Flipkart, and Myntra.
        </p>

        {/* State 1: Approved User -> Provide Extension Download */}
        {hasExtensionAccess && (
          <div className="mt-8 space-y-4">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Extension Access Approved for {user.email}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href="/extension.zip"
                download="extension.zip"
                className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm rounded-xl shadow-md transition transform hover:-translate-y-0.5"
              >
                <Download className="w-4 h-4 mr-2" />
                <span>Download Extension (.ZIP)</span>
              </a>
            </div>
          </div>
        )}

        {/* State 2: Logged In but No Extension Access -> Extension Locked */}
        {isAuthenticated && !hasExtensionAccess && (
          <div className="mt-8 max-w-xl mx-auto bg-amber-50/90 border border-amber-200 rounded-2xl p-6 text-left shadow-xs space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                <Lock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">
                  Extension Access Pending Approval
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  The Price Ghost Chrome Extension is currently restricted to approved accounts. Your account (<strong className="text-slate-800">{user?.email}</strong>) has not been granted extension access yet.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-amber-200/70 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Account:</span>
                <span className="font-semibold text-slate-900">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Extension Status:</span>
                <span className="inline-flex items-center text-amber-700 font-bold">
                  <Clock className="w-3.5 h-3.5 mr-1 animate-pulse" />
                  Pending Admin Approval
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-slate-600">
                💡 You can still track items and monitor prices directly on your Web Dashboard!
              </p>
              <Link
                to="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition shrink-0"
              >
                <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
                <span>Go to Dashboard</span>
              </Link>
            </div>
          </div>
        )}

        {/* State 3: Not Logged In -> Prompt to Sign In */}
        {!isAuthenticated && (
          <div className="mt-8 space-y-3">
            <p className="text-sm text-slate-500">
              Sign in with your Google account to check extension access eligibility.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition transform hover:-translate-y-0.5"
            >
              <LogIn className="w-4 h-4 mr-2" />
              <span>Sign In to Check Access</span>
            </Link>
          </div>
        )}
      </div>

      {/* Step by Step Cards (Shown when approved or general reference) */}
      <div className={!hasExtensionAccess ? 'opacity-50 pointer-events-none filter grayscale transition' : 'transition'}>
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold text-slate-900">
            {hasExtensionAccess ? 'Installation Instructions' : 'Installation Steps (Unlocks once approved)'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Step 1 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center">
              1
            </div>
            <h3 className="text-base font-bold text-slate-900">Download & Extract ZIP</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Download the pre-configured extension ZIP file above and extract it into a folder on your computer.
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-indigo-700 break-all select-all">
              extension.zip → Extract All
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center">
              2
            </div>
            <h3 className="text-base font-bold text-slate-900">Open Extensions Page</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Open a new tab in <strong>Google Chrome</strong>, <strong>Brave</strong>, or <strong>Microsoft Edge</strong> and enter:
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 select-all">
              chrome://extensions
            </div>
            <p className="text-[11px] text-slate-400">
              (On Microsoft Edge, navigate to <code>edge://extensions</code>)
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center">
              3
            </div>
            <h3 className="text-base font-bold text-slate-900">Enable Developer Mode</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Look in the <strong>top-right corner</strong> of the extensions page and turn on the 
              <strong className="text-indigo-600"> "Developer mode"</strong> toggle switch.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center">
              4
            </div>
            <h3 className="text-base font-bold text-slate-900">Load Unpacked</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Click the <strong className="text-indigo-600">"Load unpacked"</strong> button in the top-left corner, and select the <code className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">extension</code> folder.
            </p>
          </div>
        </div>
      </div>

      {/* Success Celebration (Only when approved) */}
      {hasExtensionAccess && (
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-8 border border-indigo-100 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">You're All Set!</h3>
              <p className="text-sm text-slate-600 mt-1 max-w-lg">
                Click the puzzle piece icon on your browser toolbar and pin <strong>Price Ghost</strong>. Whenever you browse Amazon, Flipkart, or Myntra, products are silently added to your tracking list!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
