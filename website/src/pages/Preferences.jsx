import React, { useState, useEffect } from 'react';
import { userApi } from '../services/api.js';
import {
  Bell,
  Moon,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Puzzle,
  Save,
  Clock,
  Mail,
} from 'lucide-react';

export default function Preferences() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [frequency, setFrequency] = useState('realtime');
  const [defaultThreshold, setDefaultThreshold] = useState(10);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [extensionInstalled, setExtensionInstalled] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadPreferences() {
      try {
        const res = await userApi.getPreferences();
        const notif = res.data?.notifications || {};
        setEmailAlerts(notif.email !== false);
        setFrequency(notif.frequency || 'realtime');
        setDefaultThreshold(notif.defaultThreshold || 10);
        setQuietHoursStart(notif.quietHoursStart || '22:00');
        setQuietHoursEnd(notif.quietHoursEnd || '08:00');
        setExtensionInstalled(Boolean(res.data?.extensionInstalled));
      } catch (err) {
        console.error('Failed to load preferences:', err);
      } finally {
        setLoading(false);
      }
    }
    loadPreferences();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSavedSuccess(false);

    try {
      await userApi.updatePreferences({
        email: emailAlerts,
        frequency,
        defaultThreshold: Number(defaultThreshold),
        quietHoursStart,
        quietHoursEnd,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-500">
        Loading preferences...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Alert Preferences
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Control how and when Price Ghost notifies you about price drops.
        </p>
      </div>

      {savedSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 flex items-center space-x-2 text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>Your preferences have been saved successfully!</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-800 rounded-xl border border-red-200 flex items-center space-x-2 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Email Alerts Toggle Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl mt-0.5">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Email Price Drop Alerts</h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-md">
                  Receive instant HTML emails with direct store links whenever a tracked item drops below your target.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>

        {/* Default Drop Threshold Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Default Drop Percentage</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                The initial price drop required before an alert is triggered when you track a new product.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className="text-slate-600">Default Target Drop</span>
              <span className="text-indigo-600 font-bold text-sm">{defaultThreshold}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="75"
              value={defaultThreshold}
              onChange={(e) => setDefaultThreshold(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>1% (Minor drop)</span>
              <span>10% (Recommended)</span>
              <span>75% (Mega deals)</span>
            </div>
          </div>
        </div>

        {/* Quiet Hours Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Quiet Hours Suppression</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Alert emails will not be sent during these hours to avoid waking you up.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Quiet Hours Start (Sleep)
              </label>
              <input
                type="time"
                value={quietHoursStart}
                onChange={(e) => setQuietHoursStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Quiet Hours End (Wake)
              </label>
              <input
                type="time"
                value={quietHoursEnd}
                onChange={(e) => setQuietHoursEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center px-6 py-3 rounded-xl font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
