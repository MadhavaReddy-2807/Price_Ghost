import React, { useState, useEffect } from 'react';
import {
  Search,
  ExternalLink,
  TrendingDown,
  Trash2,
  Sliders,
  LineChart as ChartIcon,
  ShoppingBag,
  Bell,
  CheckCircle,
  RefreshCw,
  IndianRupee,
  Calendar,
  X,
  Plus,
  Link as LinkIcon,
  Zap,
  Settings,
  Clock,
  Power,
  Play,
  Check,
} from 'lucide-react';
import { itemsApi, dashboardApi, pollerApi } from '../services/api.js';
import PriceChart from '../components/PriceChart.jsx';

export default function Dashboard() {
  const [trackedItems, setTrackedItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('all');

  // Chart Modal state
  const [chartItem, setChartItem] = useState(null);
  const [chartHistory, setChartHistory] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);

  // Threshold Modal state
  const [editingItem, setEditingItem] = useState(null);
  const [targetPercentageDrop, setTargetPercentageDrop] = useState(10);
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Manual Track Modal state
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [manualThreshold, setManualThreshold] = useState(10);
  const [submittingTrack, setSubmittingTrack] = useState(false);
  const [trackError, setTrackError] = useState('');

  // Poller & Auto-Sync state
  const [pollerStatus, setPollerStatus] = useState(null);
  const [isTriggeringPoll, setIsTriggeringPoll] = useState(false);
  const [showPollerModal, setShowPollerModal] = useState(false);
  const [pollToast, setPollToast] = useState(null);
  const [savingPollerConfig, setSavingPollerConfig] = useState(false);
  const [clientAutoSync, setClientAutoSync] = useState(false);

  useEffect(() => {
    loadData();
    loadPollerStatus();
  }, []);

  // Client-side live auto-sync while Dashboard tab remains open
  useEffect(() => {
    if (!clientAutoSync) return;
    const intervalId = setInterval(() => {
      loadData();
      loadPollerStatus();
    }, 45000);
    return () => clearInterval(intervalId);
  }, [clientAutoSync]);

  async function loadPollerStatus() {
    try {
      const res = await pollerApi.getStatus();
      setPollerStatus(res.data);
    } catch (e) {
      console.warn('Failed to fetch poller status:', e.message);
    }
  }

  async function handleTriggerPoller(mode = 'user') {
    setIsTriggeringPoll(true);
    setPollToast({
      type: 'info',
      message: mode === 'user' ? '⚡ Polling live prices for your tracked items...' : '🌐 Running background poller cycle across queue...',
    });
    try {
      const res = await pollerApi.trigger({ mode });
      const data = res.data;
      if (data.success) {
        setPollToast({
          type: 'success',
          message: data.message || `Price check completed! Polled ${data.itemsChecked || 0} item(s).`,
        });
        await loadData();
        await loadPollerStatus();
      } else {
        setPollToast({
          type: 'error',
          message: data.message || 'Price checking cycle is currently busy.',
        });
      }
    } catch (err) {
      setPollToast({
        type: 'error',
        message: err.response?.data?.message || err.message || 'Failed to trigger price polling.',
      });
    } finally {
      setIsTriggeringPoll(false);
      setTimeout(() => setPollToast(null), 7000);
    }
  }

  async function handleUpdatePollerConfig(newConfig) {
    setSavingPollerConfig(true);
    try {
      const res = await pollerApi.updateConfig(newConfig);
      setPollerStatus(res.data.status);
      setPollToast({
        type: 'success',
        message: res.data.message || 'Auto-polling schedule updated successfully!',
      });
    } catch (err) {
      setPollToast({
        type: 'error',
        message: err.response?.data?.error || err.message || 'Failed to update auto-polling configuration.',
      });
    } finally {
      setSavingPollerConfig(false);
      setTimeout(() => setPollToast(null), 5000);
    }
  }

  async function handleManualTrack(e) {
    e.preventDefault();
    if (!manualUrl.trim()) return;
    setSubmittingTrack(true);
    setTrackError('');
    try {
      await itemsApi.trackUrl({
        url: manualUrl.trim(),
        targetPercentageDrop: manualThreshold,
        baseline: 'initial',
      });
      setManualUrl('');
      setShowTrackModal(false);
      await loadData();
    } catch (err) {
      setTrackError(err.response?.data?.error || err.message || 'Failed to track product from URL.');
    } finally {
      setSubmittingTrack(false);
    }
  }

  function detectUrlPlatform(url) {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('amazon.')) return 'amazon';
    if (lower.includes('flipkart.')) return 'flipkart';
    if (lower.includes('myntra.')) return 'myntra';
    return null;
  }

  async function loadData() {
    try {
      const [itemsRes, summaryRes, alertsRes] = await Promise.all([
        itemsApi.getTracked().catch(() => ({ data: [] })),
        dashboardApi.getSummary().catch(() => ({ data: null })),
        dashboardApi.getAlerts().catch(() => ({ data: [] })),
      ]);

      setTrackedItems(itemsRes.data || []);
      setSummary(summaryRes.data);
      setAlerts(alertsRes.data || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleUntrack(itemId) {
    if (!window.confirm('Remove this product from tracking?')) return;
    try {
      await itemsApi.untrackItem(itemId);
      setTrackedItems((prev) => prev.filter((t) => t.item?._id !== itemId));
      setAlerts((prev) => prev.filter((a) => a.itemId !== itemId));
    } catch (err) {
      alert('Failed to remove item: ' + err.message);
    }
  }

  async function openChart(item) {
    setChartItem(item);
    setLoadingChart(true);
    try {
      const res = await itemsApi.getItemHistory(item._id);
      setChartHistory(res.data?.history || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingChart(false);
    }
  }

  function openEditModal(entry) {
    setEditingItem(entry);
    setTargetPercentageDrop(entry.tracking?.targetPercentageDrop || 10);
  }

  async function handleSaveThreshold() {
    if (!editingItem) return;
    setSavingThreshold(true);
    try {
      await itemsApi.updateThreshold(
        editingItem.item._id,
        targetPercentageDrop,
        editingItem.tracking?.baseline || 'initial'
      );
      setTrackedItems((prev) =>
        prev.map((entry) => {
          if (entry.item._id === editingItem.item._id) {
            return {
              ...entry,
              tracking: {
                ...entry.tracking,
                targetPercentageDrop: Number(targetPercentageDrop),
              },
            };
          }
          return entry;
        })
      );
      setEditingItem(null);
    } catch (err) {
      alert('Failed to update threshold: ' + err.message);
    } finally {
      setSavingThreshold(false);
    }
  }

  const filteredItems = trackedItems.filter((entry) => {
    const item = entry.item;
    if (!item) return false;
    const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = selectedPlatform === 'all' || item.platform === selectedPlatform;
    return matchesSearch && matchesPlatform;
  });

  const getPlatformBadge = (platform) => {
    switch (platform) {
      case 'amazon':
        return <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5 rounded-md">Amazon</span>;
      case 'flipkart':
        return <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-md">Flipkart</span>;
      case 'myntra':
        return <span className="bg-rose-100 text-rose-800 text-xs font-semibold px-2.5 py-0.5 rounded-md">Myntra</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 text-xs font-semibold px-2.5 py-0.5 rounded-md">{platform}</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading your tracking dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Tracked Products
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time price monitoring across Amazon, Flipkart, and Myntra.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Instant Trigger Poller Button */}
          <button
            onClick={() => handleTriggerPoller('user')}
            disabled={isTriggeringPoll || pollerStatus?.isRunning}
            title="Poll current prices immediately from live stores for your tracked products"
            className="inline-flex items-center px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 mr-1.5 ${isTriggeringPoll ? 'animate-bounce text-yellow-200' : ''}`} />
            <span>{isTriggeringPoll ? 'Checking Prices...' : '⚡ Check Prices Now'}</span>
          </button>

          {/* Auto-Poll Settings & Schedule Indicator */}
          <button
            onClick={() => setShowPollerModal(true)}
            title="Configure automatic background polling schedule"
            className="inline-flex items-center px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition"
          >
            <span
              className={`w-2 h-2 rounded-full mr-2 ${
                pollerStatus?.autoPollEnabled
                  ? pollerStatus?.isRunning
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-emerald-500 animate-pulse'
                  : 'bg-slate-400'
              }`}
            />
            <span>
              Auto-Poll: {pollerStatus?.autoPollEnabled ? `${(pollerStatus?.intervalMinutes || 180) >= 60 ? `${Math.round((pollerStatus?.intervalMinutes || 180) / 60)}h` : `${pollerStatus?.intervalMinutes}m`}` : 'Off'}
            </span>
            <Settings className="w-3.5 h-3.5 ml-1.5 text-slate-400" />
          </button>

          {/* Track Product Manually */}
          <button
            onClick={() => {
              setShowTrackModal(true);
              setTrackError('');
            }}
            className="inline-flex items-center px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>Track Product</span>
          </button>

          {/* Refresh Local View */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh dashboard view"
            className="inline-flex items-center px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Poller Status / Result Toast Banner */}
      {pollToast && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-semibold shadow-xs transition-all ${
            pollToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : pollToast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 flex-shrink-0 text-amber-500" />
            <span>{pollToast.message}</span>
          </div>
          <button
            onClick={() => setPollToast(null)}
            className="text-slate-400 hover:text-slate-600 ml-4 text-xs font-bold px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Tracked</span>
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{summary?.totalTracked || trackedItems.length}</p>
          <p className="text-xs text-slate-400 mt-1">Active items in monitoring</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Drops</span>
            <TrendingDown className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600">{summary?.activeAlerts || alerts.length}</p>
          <p className="text-xs text-slate-400 mt-1">Targets met ready to buy</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Recent Drops</span>
            <Calendar className="w-4 h-4 text-violet-600" />
          </div>
          <p className="text-2xl font-black text-violet-600">{summary?.recentDrops || 0}</p>
          <p className="text-xs text-slate-400 mt-1">Within the last 7 days</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Savings Potential</span>
            <IndianRupee className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            ₹{(summary?.totalSavingsPotential || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-400 mt-1">Total discounts unlocked</p>
        </div>
      </div>

      {/* Active Alerts Banner Feed */}
      {alerts.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-sm space-y-3">
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5 animate-bounce" />
            <h2 className="font-bold text-base">Price Drop Targets Reached!</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.slice(0, 2).map((alert) => (
              <div
                key={alert.itemId}
                className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 flex items-center justify-between space-x-3 border border-white/15"
              >
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                    {alert.platform}
                  </span>
                  <p className="text-xs font-semibold text-white truncate mt-1">{alert.productTitle}</p>
                  <p className="text-xs text-emerald-100">
                    Dropped to <strong>₹{alert.currentPrice?.toLocaleString('en-IN')}</strong> (-{alert.dropPercentage}%)
                  </p>
                </div>
                <a
                  href={alert.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-white text-emerald-700 font-bold text-xs px-3 py-2 rounded-lg shadow-xs hover:bg-emerald-50 transition flex-shrink-0"
                >
                  Buy Now →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Platform Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative max-w-md w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tracked products by title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
          />
        </div>

        <div className="flex space-x-1.5 overflow-x-auto pb-1">
          {['all', 'amazon', 'flipkart', 'myntra'].map((platform) => (
            <button
              key={platform}
              onClick={() => setSelectedPlatform(platform)}
              className={`text-xs font-semibold px-3.5 py-2 rounded-xl capitalize transition ${
                selectedPlatform === platform
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {platform}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No tracked products found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Paste any Amazon, Flipkart, or Myntra link to track manually, or use the "👻 Track Price" button with the Chrome Extension!
          </p>
          <button
            onClick={() => {
              setShowTrackModal(true);
              setTrackError('');
            }}
            className="mt-4 inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>Track Your First Product</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((entry) => {
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
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    {getPlatformBadge(item.platform)}
                    {isTargetMet ? (
                      <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                        <TrendingDown className="w-3.5 h-3.5" />
                        <span>-{dropPercent}% Drop</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">
                        Target: -{tracking.targetPercentageDrop || 10}%
                      </span>
                    )}
                  </div>

                  <div className="flex space-x-4 mb-4">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-20 h-20 object-contain rounded-xl border border-slate-100 bg-white p-1 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 flex-shrink-0">
                        <ShoppingBag className="w-8 h-8" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3
                        title={item.title}
                        className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug"
                      >
                        {item.title}
                      </h3>

                      <div className="mt-2 flex items-baseline space-x-2">
                        <span className="text-lg font-black text-slate-900">
                          ₹{item.currentPrice?.toLocaleString('en-IN')}
                        </span>
                        {baselinePrice > item.currentPrice && (
                          <span className="text-xs text-slate-400 line-through">
                            ₹{baselinePrice?.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Target: <strong>₹{tracking.targetPrice?.toLocaleString('en-IN')}</strong>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => openChart(item)}
                      className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                      title="View Price History Chart"
                    >
                      <ChartIcon className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => openEditModal(entry)}
                      className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                      title="Adjust Drop Threshold"
                    >
                      <Sliders className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleUntrack(item._id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="Untrack Product"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center px-3.5 py-1.5 rounded-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition"
                  >
                    <span>Buy Now</span>
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Price History Chart Modal */}
      {chartItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {chartItem.platform}
                </span>
                <h3 className="font-bold text-base text-slate-900 truncate max-w-lg">
                  {chartItem.title}
                </h3>
              </div>
              <button
                onClick={() => setChartItem(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingChart ? (
              <div className="h-72 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : (
              <PriceChart
                history={chartHistory}
                baselinePrice={chartItem.highestPrice || chartItem.currentPrice}
                targetPrice={chartItem.lowestPrice}
              />
            )}

            <div className="grid grid-cols-3 gap-3 pt-2 text-center text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <p className="text-slate-400">Lowest Recorded</p>
                <p className="font-bold text-emerald-600 text-sm mt-0.5">
                  ₹{chartItem.lowestPrice?.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <p className="text-slate-400">Current Deal</p>
                <p className="font-bold text-slate-900 text-sm mt-0.5">
                  ₹{chartItem.currentPrice?.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <p className="text-slate-400">Highest Recorded</p>
                <p className="font-bold text-slate-600 text-sm mt-0.5">
                  ₹{chartItem.highestPrice?.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Threshold Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900">Customize Drop Threshold</h3>
            <p className="text-xs text-slate-500">
              Notify me when <strong>"{editingItem.item.title}"</strong> drops by:
            </p>

            <div className="grid grid-cols-4 gap-2 my-2">
              {[5, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setTargetPercentageDrop(pct)}
                  className={`py-2 rounded-xl text-xs font-bold border transition ${
                    targetPercentageDrop === pct
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Custom Target Drop</span>
                <span className="font-bold text-indigo-600">{targetPercentageDrop}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="90"
                value={targetPercentageDrop}
                onChange={(e) => setTargetPercentageDrop(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="flex space-x-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveThreshold}
                disabled={savingThreshold}
                className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
              >
                {savingThreshold ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Track Product Manually Modal */}
      {showTrackModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-xl">👻</span>
                <h3 className="font-bold text-base text-slate-900">Track Product Manually</h3>
              </div>
              <button
                onClick={() => {
                  setShowTrackModal(false);
                  setTrackError('');
                }}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualTrack} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Product Link (Amazon India, Flipkart, or Myntra)
                </label>
                <div className="relative">
                  <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    placeholder="https://www.amazon.in/dp/... or flipkart.com/..."
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                  />
                </div>
                {detectUrlPlatform(manualUrl) && (
                  <div className="mt-1.5 flex items-center space-x-1.5 text-xs text-slate-500">
                    <span>Detected Store:</span>
                    {getPlatformBadge(detectUrlPlatform(manualUrl))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Alert Drop Target
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setManualThreshold(pct)}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        manualThreshold === pct
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Custom Target Drop</span>
                    <span className="font-bold text-indigo-600">{manualThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="90"
                    value={manualThreshold}
                    onChange={(e) => setManualThreshold(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>
              </div>

              {trackError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
                  {trackError}
                </div>
              )}

              <div className="flex space-x-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTrackModal(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTrack || !manualUrl.trim()}
                  className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {submittingTrack ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Fetching & Tracking...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Start Tracking Product</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auto-Polling & Engine Settings Modal */}
      {showPollerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-50 rounded-xl">
                  <Zap className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Auto-Polling & Price Engine</h3>
                  <p className="text-xs text-slate-500">Configure background price scraping & automatic triggers</p>
                </div>
              </div>
              <button
                onClick={() => setShowPollerModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section 1: Auto-Polling Engine Master Switch */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-900">Automatic Background Poller</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      pollerStatus?.autoPollEnabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {pollerStatus?.autoPollEnabled ? 'ACTIVE' : 'PAUSED'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Automatically triggers background price checks and dispatches price drop alert emails.
                </p>
              </div>

              <button
                disabled={savingPollerConfig}
                onClick={() =>
                  handleUpdatePollerConfig({
                    enabled: !pollerStatus?.autoPollEnabled,
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  pollerStatus?.autoPollEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    pollerStatus?.autoPollEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Section 2: Frequency Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Polling Frequency Interval
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '15m (Testing)', val: 15 },
                  { label: '30 Minutes', val: 30 },
                  { label: '1 Hour', val: 60 },
                  { label: '3 Hours (Rec.)', val: 180 },
                  { label: '6 Hours', val: 360 },
                  { label: '12 Hours', val: 720 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    disabled={savingPollerConfig || !pollerStatus?.autoPollEnabled}
                    onClick={() => handleUpdatePollerConfig({ intervalMinutes: item.val })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition text-center ${
                      pollerStatus?.intervalMinutes === item.val
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    } ${!pollerStatus?.autoPollEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">
                Current schedule: {pollerStatus?.cronExpression || '*/180 * * * *'}
              </p>
            </div>

            {/* Section 3: Live Dashboard Auto-Sync while Open */}
            <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Clock className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-900">Dashboard Live Auto-Sync</span>
                  <p className="text-[11px] text-slate-500">
                    Automatically refresh price updates every 45s while this tab is open
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={clientAutoSync}
                onChange={(e) => setClientAutoSync(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 focus:ring-indigo-500"
              />
            </div>

            {/* Section 4: Manual Trigger Actions */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700">
                Manual Polling Triggers
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isTriggeringPoll || pollerStatus?.isRunning}
                  onClick={() => {
                    handleTriggerPoller('user');
                    setShowPollerModal(false);
                  }}
                  className="py-2.5 px-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Check My Items</span>
                </button>

                <button
                  type="button"
                  disabled={isTriggeringPoll || pollerStatus?.isRunning}
                  onClick={() => {
                    handleTriggerPoller('all');
                    setShowPollerModal(false);
                  }}
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Poll Full Queue</span>
                </button>
              </div>
            </div>

            {/* Section 5: Telemetry Status */}
            {pollerStatus && (
              <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Engine State:</span>
                  <span className={`font-semibold ${pollerStatus.isRunning ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {pollerStatus.isRunning ? 'Active Cycle Running...' : 'Idle (Ready)'}
                  </span>
                </div>
                {pollerStatus.lastCycleFinishedAt && (
                  <div className="flex justify-between">
                    <span>Last Finished:</span>
                    <span className="font-semibold text-slate-700">
                      {new Date(pollerStatus.lastCycleFinishedAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {pollerStatus.lastCycleStats && (
                  <div className="flex justify-between">
                    <span>Last Cycle Stats:</span>
                    <span className="font-semibold text-slate-700">
                      Checked: {pollerStatus.lastCycleStats.itemsChecked} | Changes: {pollerStatus.lastCycleStats.priceChangesDetected} | Alerts: {pollerStatus.lastCycleStats.alertsSent}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Close */}
            <div className="pt-2 border-t border-slate-100 text-right">
              <button
                type="button"
                onClick={() => setShowPollerModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
