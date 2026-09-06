import React, { useState, useEffect } from 'react';
import {
  Search,
  ExternalLink,
  TrendingDown,
  Trash2,
  Sliders,
  RefreshCw,
  LogOut,
  Sparkles,
  ShoppingBag,
  CheckCircle,
  AlertCircle,
  Eye,
} from 'lucide-react';
import {
  trackItem,
  fetchTrackedItems,
  untrackItem,
  updateThreshold,
  fetchDashboardSummary,
  fetchCurrentUser,
} from '../utils/api.js';
import { getAuthToken, setAuthToken, clearAuth, getStorage, setStorage } from '../utils/storage.js';
import { WEB_URL } from '../config/env.js';

export default function Popup() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('all');

  // Active shopping tab product state
  const [currentPageProduct, setCurrentPageProduct] = useState(null);
  const [trackingCurrent, setTrackingCurrent] = useState(false);
  const [currentTabThreshold, setCurrentTabThreshold] = useState(10);

  // Threshold modal state
  const [editingItem, setEditingItem] = useState(null);
  const [customThreshold, setCustomThreshold] = useState(10);
  const [savingThreshold, setSavingThreshold] = useState(false);

  const [syncingTab, setSyncingTab] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualToken, setManualToken] = useState('');

  useEffect(() => {
    initAuth();

    // Auto-sync when user logs in via Web Dashboard
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const listener = (changes, area) => {
        if (area === 'local' && changes.token?.newValue) {
          setToken(changes.token.newValue);
          loadUserData(changes.token.newValue);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  // Inspect current active tab for product details
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs?.[0];
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PAGE_PRODUCT' }, (response) => {
            if (chrome.runtime?.lastError) {
              // Fallback to last seen product in storage
              getStorage(['lastSeenProduct']).then((res) => {
                if (res.lastSeenProduct && (Date.now() - (res.lastSeenProduct.detectedAt || 0) < 600000)) {
                  setCurrentPageProduct(res.lastSeenProduct);
                }
              });
            } else if (response?.product) {
              setCurrentPageProduct(response.product);
            }
          });
        }
      });
    }
  }, [items]);

  async function syncFromWebTab() {
    setSyncingTab(true);
    setSyncMessage('');
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting) {
        const tabs = await chrome.tabs.query({});
        const dashboardTab = tabs.find(t => t.url && (
          (WEB_URL && t.url.includes(WEB_URL)) ||
          t.url.includes('price-ghost.netlify.app') ||
          t.url.includes('netlify.app') ||
          t.url.includes('localhost:5173') || 
          t.url.includes('127.0.0.1:5173') || 
          t.url.includes('onrender.com') ||
          t.url.includes('localhost:3000') ||
          t.url.includes('127.0.0.1:3000')
        ));

        if (dashboardTab) {
          const isLocal = dashboardTab.url.includes('localhost') || dashboardTab.url.includes('127.0.0.1');
          const apiBaseUrl = isLocal ? 'http://localhost:5000/api' : 'https://price-ghost.onrender.com/api';

          const results = await chrome.scripting.executeScript({
            target: { tabId: dashboardTab.id },
            func: () => ({
              token: localStorage.getItem('price_ghost_token'),
              user: localStorage.getItem('price_ghost_user'),
            }),
          });

          const data = results[0]?.result;
          if (data && data.token) {
            let userObj = null;
            try { userObj = JSON.parse(data.user); } catch {}
            await setAuthToken(data.token);
            await setStorage({ user: userObj, apiBaseUrl });
            setToken(data.token);
            setUser(userObj);
            setSyncMessage('✅ Successfully connected to ' + (userObj?.email || 'account') + '!');
            await loadUserData(data.token);
            return;
          } else {
            setSyncMessage('⚠️ Open dashboard tab found, but not signed in. Log in on that tab first.');
            return;
          }
        }
      }

      // Check storage again in case webBridge already set it
      const stored = await getAuthToken();
      if (stored) {
        setToken(stored);
        await loadUserData(stored);
        return;
      }

      setSyncMessage('No active Price Ghost Web tab found. Click "1. Sign In on Web Dashboard" first.');
    } catch (err) {
      setSyncMessage('Sync note: ' + (err.message || 'Could not access web tab.'));
    } finally {
      setSyncingTab(false);
    }
  }

  async function handleManualTokenSubmit(e) {
    e.preventDefault();
    if (!manualToken.trim()) return;
    setLoading(true);
    setSyncMessage('');
    try {
      const cleanToken = manualToken.trim();
      await setAuthToken(cleanToken);
      setToken(cleanToken);
      const profile = await fetchCurrentUser().catch(() => null);
      if (profile?.user) {
        setUser(profile.user);
        await setStorage({ user: profile.user });
        setSyncMessage('✅ Connected successfully to ' + (profile.user.email || 'account') + '!');
      }
      await loadUserData(cleanToken);
    } catch (err) {
      setSyncMessage('Token rejected: ' + (err.message || 'Invalid or expired token'));
    } finally {
      setLoading(false);
    }
  }

  async function initAuth() {
    setLoading(true);
    try {
      const storedToken = await getAuthToken();
      if (storedToken) {
        setToken(storedToken);
        await loadUserData(storedToken);
      }
    } catch (err) {
      console.error('Init error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadUserData(authToken) {
    try {
      const [profileRes, itemsRes, summaryRes] = await Promise.all([
        fetchCurrentUser().catch((e) => {
          if (e.status === 401) {
            handleLogout();
            setSyncMessage('⚠️ Session expired. Please sign in again.');
          }
          return null;
        }),
        fetchTrackedItems().catch(() => []),
        fetchDashboardSummary().catch(() => null),
      ]);

      if (profileRes?.user) setUser(profileRes.user);
      if (Array.isArray(itemsRes)) {
        setItems(itemsRes);
        // Sync tracked keys into local storage for the in-page button
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const trackedKeys = {};
          itemsRes.forEach((entry) => {
            if (entry.item?.platform && entry.item?.externalId) {
              const key = `${entry.item.platform}:${entry.item.externalId}`;
              trackedKeys[key] = {
                itemId: entry.item._id,
                targetPercentageDrop: entry.tracking?.targetPercentageDrop || 10,
                targetPrice: entry.tracking?.targetPrice,
              };
            }
          });
          chrome.storage.local.set({ trackedKeys });
        }
      }
      if (summaryRes) setSummary(summaryRes);
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await loadUserData(token);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout() {
    await clearAuth();
    setToken(null);
    setUser(null);
    setItems([]);
    setSummary(null);
  }

  async function handleUntrack(itemId) {
    if (!window.confirm('Remove this product from your tracked list?')) return;
    try {
      await untrackItem(itemId);
      setItems((prev) => prev.filter((entry) => entry.item?._id !== itemId));
    } catch (err) {
      const msg = err.message?.includes('Failed to fetch')
        ? 'Network error. Please verify backend connection.'
        : err.message;
      alert('Failed to remove item: ' + msg);
    }
  }

  async function handleTrackCurrentPage() {
    if (!currentPageProduct || !token) return;
    setTrackingCurrent(true);
    try {
      const payload = {
        ...currentPageProduct,
        targetPercentageDrop: currentTabThreshold,
        baseline: 'initial',
      };
      await trackItem(payload);
      await loadUserData(token);

      // Refresh in-page button on active tab
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs?.[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'REFRESH_PAGE_BUTTON' }).catch(() => {});
          }
        });
      }
    } catch (err) {
      const msg = err.message?.includes('Failed to fetch')
        ? 'Could not connect to Price Ghost tracker service. Please check connection.'
        : err.message;
      alert('Track failed: ' + msg);
    } finally {
      setTrackingCurrent(false);
    }
  }

  function openEditModal(entry) {
    setEditingItem(entry);
    setCustomThreshold(entry.tracking?.targetPercentageDrop || 10);
  }

  async function handleSaveThreshold() {
    if (!editingItem) return;
    setSavingThreshold(true);
    try {
      await updateThreshold(editingItem.item._id, customThreshold, editingItem.tracking?.baseline || 'initial');
      setItems((prev) =>
        prev.map((entry) => {
          if (entry.item._id === editingItem.item._id) {
            return {
              ...entry,
              tracking: {
                ...entry.tracking,
                targetPercentageDrop: Number(customThreshold),
              },
            };
          }
          return entry;
        })
      );
      setEditingItem(null);
    } catch (err) {
      const msg = err.message?.includes('Failed to fetch')
        ? 'Network error updating threshold. Please check connection.'
        : err.message;
      alert('Failed to update threshold: ' + msg);
    } finally {
      setSavingThreshold(false);
    }
  }

  function openLink(url) {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  }

  // Filter items
  const filteredItems = items.filter((entry) => {
    const item = entry.item;
    if (!item) return false;
    const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = selectedPlatform === 'all' || item.platform === selectedPlatform;
    return matchesSearch && matchesPlatform;
  });

  const getPlatformBadge = (platform) => {
    switch (platform) {
      case 'amazon':
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded">Amazon</span>;
      case 'flipkart':
        return <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded">Flipkart</span>;
      case 'myntra':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-semibold px-2 py-0.5 rounded">Myntra</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 text-[10px] font-semibold px-2 py-0.5 rounded">{platform}</span>;
    }
  };

  const isCurrentPageTracked = currentPageProduct && items.some(
    (entry) => entry.item?.platform === currentPageProduct.platform && 
               entry.item?.externalId === currentPageProduct.externalId
  );

  return (
    <div className="flex flex-col h-[560px] bg-white select-none">
      {/* Top Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <span className="text-xl">👻</span>
          <div>
            <h1 className="font-bold text-sm tracking-tight leading-none">Price Ghost</h1>
            <p className="text-[10px] text-indigo-200">Price Tracker</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {token && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh"
              className="p-1.5 hover:bg-white/10 rounded-md transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}

          <button
            onClick={() => openLink(`${WEB_URL}/dashboard`)}
            title="Open Web Dashboard"
            className="p-1.5 hover:bg-white/10 rounded-md transition flex items-center text-xs space-x-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          {token && (
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 hover:bg-white/10 rounded-md transition text-red-200 hover:text-white"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Body */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-2">
          <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
          <p className="text-xs text-gray-500">Loading Price Ghost...</p>
        </div>
      ) : !token ? (
        /* Login State */
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center overflow-y-auto">
          <div className="w-14 h-14 bg-gradient-to-tr from-indigo-50 to-violet-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-3 shadow-xs">
            <span className="text-3xl">👻</span>
          </div>
          <h2 className="font-bold text-gray-900 text-base">Sign In with Google</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-[260px] leading-relaxed">
            Connect your account to track product prices and get instant alerts when prices drop.
          </p>

          {/* Current Page Detected Banner (When Not Signed In) */}
          {currentPageProduct && currentPageProduct.currentPrice > 0 && (
            <div className="w-full my-3 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-left text-xs">
              <div className="flex items-center justify-between space-x-1 mb-1">
                <span className="text-amber-800 font-bold text-[10px] uppercase tracking-wider flex items-center space-x-1">
                  <Eye className="w-3 h-3" />
                  <span>Detected on this page</span>
                </span>
                {getPlatformBadge(currentPageProduct.platform)}
              </div>
              <p className="font-semibold text-gray-900 truncate text-[11px]" title={currentPageProduct.title}>
                {currentPageProduct.title}
              </p>
              <p className="text-xs font-extrabold text-amber-900 mt-0.5">
                ₹{currentPageProduct.currentPrice?.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-amber-700 mt-1">
                👉 Connect below to track price drops!
              </p>
            </div>
          )}

          {syncMessage && (
            <div className={`w-full my-2 p-2 text-[11px] rounded-lg text-center ${
              syncMessage.includes('✅') 
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' 
                : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
            }`}>
              {syncMessage}
            </div>
          )}

          <div className="w-full mt-3 space-y-2.5">
            <button
              onClick={() => openLink(`${WEB_URL}/login`)}
              className="w-full bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs py-2.5 px-4 rounded-xl border border-gray-300 shadow-xs transition flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>1. Sign In on Web Dashboard</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-1" />
            </button>

            <button
              onClick={syncFromWebTab}
              disabled={syncingTab}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingTab ? 'animate-spin' : ''}`} />
              <span>{syncingTab ? 'Checking Tab...' : '2. Sync Account from Web Tab'}</span>
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 w-full text-center">
            {!showManualInput ? (
              <button
                onClick={() => setShowManualInput(true)}
                className="text-[11px] text-gray-400 hover:text-indigo-600 underline"
              >
                Or paste session token manually
              </button>
            ) : (
              <form onSubmit={handleManualTokenSubmit} className="space-y-2 mt-2">
                <input
                  type="password"
                  placeholder="Paste JWT token from web dashboard"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowManualInput(false)}
                    className="flex-1 py-1 text-[11px] text-gray-500 hover:bg-gray-100 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
                  >
                    Save Token
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* Authenticated State */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Summary Strip */}
          <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3 text-gray-600">
              <span>
                Tracked: <strong className="text-gray-900">{summary?.totalTracked || items.length}</strong>
              </span>
              <span>
                Active Drops:{' '}
                <strong className="text-emerald-600">{summary?.activeAlerts || 0}</strong>
              </span>
            </div>
            <span className="text-[11px] text-gray-400 truncate max-w-[120px]">{user?.email}</span>
          </div>

          {/* Extension Access Pending Notice */}
          {user && user.hasAccess !== true && user.role !== 'admin' && (
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-start space-x-2">
              <span className="text-sm">🔒</span>
              <div className="flex-1">
                <p className="font-bold text-[11px] text-amber-900">Extension Access Pending</p>
                <p className="text-[10px] text-amber-700 leading-tight mt-0.5">
                  Your account has not been approved for extension tracking yet. You can still use your{' '}
                  <a
                    href="https://price-ghost.netlify.app/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold underline hover:text-amber-950"
                  >
                    Web Dashboard
                  </a>.
                </p>
              </div>
            </div>
          )}

          {/* Active Tab Product Banner (Authenticated) */}
          {currentPageProduct && currentPageProduct.currentPrice > 0 && (
            <div className="bg-gradient-to-r from-indigo-50/90 to-violet-50/90 border-b border-indigo-100 px-3 py-2 flex items-center justify-between text-xs shadow-xs">
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center space-x-1 mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center space-x-1">
                    <Eye className="w-3 h-3" />
                    <span>Active Page</span>
                  </span>
                  {getPlatformBadge(currentPageProduct.platform)}
                </div>
                <p className="font-semibold text-gray-900 truncate text-[11px]" title={currentPageProduct.title}>
                  {currentPageProduct.title}
                </p>
                <p className="text-[11px] font-extrabold text-indigo-700">
                  ₹{currentPageProduct.currentPrice?.toLocaleString('en-IN')}
                </p>
              </div>

              {isCurrentPageTracked ? (
                <span className="flex-shrink-0 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded-md flex items-center space-x-1">
                  <CheckCircle className="w-3 h-3" />
                  <span>Tracked</span>
                </span>
              ) : (
                <div className="flex flex-col items-end space-y-1">
                  <div className="flex space-x-1">
                    {[5, 10, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setCurrentTabThreshold(pct)}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition ${
                          currentTabThreshold === pct
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleTrackCurrentPage}
                    disabled={trackingCurrent || (user && user.hasAccess !== true && user.role !== 'admin')}
                    className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md shadow-xs transition flex items-center space-x-1 disabled:opacity-50"
                    title={user && user.hasAccess !== true && user.role !== 'admin' ? 'Extension access requires administrator approval' : ''}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>
                      {user && user.hasAccess !== true && user.role !== 'admin'
                        ? 'Access Pending'
                        : trackingCurrent
                        ? 'Tracking...'
                        : `Track (-${currentTabThreshold}%)`}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="p-3 border-b space-y-2 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tracked products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-gray-100 rounded-md text-xs focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none transition"
              />
            </div>

            <div className="flex space-x-1">
              {['all', 'amazon', 'flipkart', 'myntra'].map((platform) => (
                <button
                  key={platform}
                  onClick={() => setSelectedPlatform(platform)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md capitalize transition ${
                    selectedPlatform === platform
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {platform}
                </button>
              ))}
            </div>
          </div>

          {/* Products List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                <ShoppingBag className="w-10 h-10 stroke-1 text-gray-300 mb-2" />
                <p className="text-xs font-semibold text-gray-600">No tracked products yet</p>
                <p className="text-[11px] text-gray-400 mt-1 max-w-[240px]">
                  Use the "👻 Track Price" button on any shopping page (Amazon, Flipkart, Myntra) to track products!
                </p>
              </div>
            ) : (
              filteredItems.map((entry) => {
                const item = entry.item;
                const tracking = entry.tracking || {};
                const baselinePrice = tracking.baseline === 'mrp' && item.mrpPrice > 0 ? item.mrpPrice : tracking.baselinePrice;
                const dropPercent = baselinePrice > item.currentPrice 
                  ? Math.round(((baselinePrice - item.currentPrice) / baselinePrice) * 100) 
                  : 0;
                const isTargetMet = dropPercent >= (tracking.targetPercentageDrop || 10);

                return (
                  <div
                    key={item._id}
                    className="border border-gray-200 rounded-lg p-3 hover:border-indigo-300 transition bg-white shadow-xs flex flex-col space-y-2"
                  >
                    <div className="flex space-x-3 items-start">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-14 h-14 object-contain rounded border border-gray-100 flex-shrink-0 bg-white"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-gray-100 rounded flex items-center justify-center flex-shrink-0 text-gray-400">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between space-x-1 mb-1">
                          {getPlatformBadge(item.platform)}
                          {isTargetMet ? (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center space-x-0.5">
                              <TrendingDown className="w-3 h-3" />
                              <span>-{dropPercent}%</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-500">
                              Target: -{tracking.targetPercentageDrop || 10}%
                            </span>
                          )}
                        </div>

                        <h3
                          onClick={() => openLink(item.url)}
                          title={item.title}
                          className="text-xs font-semibold text-gray-900 truncate hover:text-indigo-600 cursor-pointer"
                        >
                          {item.title}
                        </h3>

                        <div className="flex items-baseline space-x-2 mt-1">
                          <span className="text-sm font-extrabold text-gray-900">
                            ₹{item.currentPrice?.toLocaleString('en-IN')}
                          </span>
                          {baselinePrice > item.currentPrice && (
                            <span className="text-xs text-gray-400 line-through">
                              ₹{baselinePrice?.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Strip */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                      <button
                        onClick={() => openEditModal(entry)}
                        className="text-gray-500 hover:text-indigo-600 flex items-center space-x-1 text-[11px] font-medium"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>Set Alert ({tracking.targetPercentageDrop || 10}%)</span>
                      </button>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleUntrack(item._id)}
                          title="Untrack"
                          className="text-gray-400 hover:text-red-600 p-1 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => openLink(item.url)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] px-2.5 py-1 rounded shadow-xs flex items-center space-x-1 transition"
                        >
                          <span>Buy Now</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Threshold Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[320px] p-4 space-y-3">
            <h3 className="font-bold text-sm text-gray-900">Alert Drop Threshold</h3>
            <p className="text-xs text-gray-500">
              Notify me when <strong>"{editingItem.item.title.slice(0, 30)}..."</strong> drops by:
            </p>

            <div className="grid grid-cols-4 gap-1.5 my-2">
              {[5, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setCustomThreshold(pct)}
                  className={`py-1.5 text-xs font-semibold rounded border transition ${
                    customThreshold === pct
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="range"
                min="1"
                max="90"
                value={customThreshold}
                onChange={(e) => setCustomThreshold(Number(e.target.value))}
                className="flex-1 accent-indigo-600"
              />
              <span className="text-xs font-bold text-indigo-700 w-9 text-right">
                {customThreshold}%
              </span>
            </div>

            <div className="flex space-x-2 pt-2 border-t">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveThreshold}
                disabled={savingThreshold}
                className="flex-1 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition"
              >
                {savingThreshold ? 'Saving...' : 'Save Target'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
