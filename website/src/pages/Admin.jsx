import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  ShieldCheck,
  Clock,
  Activity,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RefreshCw,
  Sliders,
  Power,
  Trash2,
  UserCheck,
  UserX,
  Mail,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { adminApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Admin() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'poller' | 'system'
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'admin'
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);

  // Poller form state
  const [pollerConfig, setPollerConfig] = useState({
    enabled: true,
    intervalMinutes: 60,
  });
  const [pollerRunning, setPollerRunning] = useState(false);
  const [savingPoller, setSavingPoller] = useState(false);
  const [triggeringPoller, setTriggeringPoller] = useState(false);
  const [lastCycleResult, setLastCycleResult] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, pollerRes] = await Promise.all([
        adminApi.getStats(),
        adminApi.getUsers({ limit: 100 }),
        adminApi.getPoller(),
      ]);

      if (statsRes.data?.stats) setStats(statsRes.data.stats);
      if (usersRes.data?.users) setUsers(usersRes.data.users);
      if (pollerRes.data?.poller) {
        setPollerConfig({
          enabled: pollerRes.data.poller.autoPollEnabled,
          intervalMinutes: pollerRes.data.poller.intervalMinutes || 60,
        });
        setPollerRunning(pollerRes.data.poller.isRunning);
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load administrator data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (userFilter === 'pending') return u.hasAccess === false;
      if (userFilter === 'approved') return u.hasAccess === true;
      if (userFilter === 'admin') return u.role === 'admin';
      return true;
    });
  }, [users, searchQuery, userFilter]);

  // Toggle user access (Grant / Revoke)
  const handleToggleAccess = async (targetUser) => {
    const newAccessState = !targetUser.hasAccess;
    setActionLoading((prev) => ({ ...prev, [targetUser._id]: true }));

    try {
      const res = await adminApi.updateUserAccess(targetUser._id, newAccessState);
      setUsers((prev) =>
        prev.map((u) => (u._id === targetUser._id ? { ...u, hasAccess: newAccessState } : u))
      );
      showToast(res.data.message || (newAccessState ? 'Access granted!' : 'Access revoked!'));
      // Refresh stats
      const statsRes = await adminApi.getStats();
      if (statsRes.data?.stats) setStats(statsRes.data.stats);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update access', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUser._id]: false }));
    }
  };

  // Toggle role (Admin / User)
  const handleToggleRole = async (targetUser) => {
    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    setActionLoading((prev) => ({ ...prev, [`role_${targetUser._id}`]: true }));

    try {
      const res = await adminApi.updateUserRole(targetUser._id, newRole);
      setUsers((prev) =>
        prev.map((u) =>
          u._id === targetUser._id
            ? { ...u, role: newRole, hasAccess: newRole === 'admin' ? true : u.hasAccess }
            : u
        )
      );
      showToast(res.data.message || `User role updated to ${newRole}`);
      const statsRes = await adminApi.getStats();
      if (statsRes.data?.stats) setStats(statsRes.data.stats);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to change role', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`role_${targetUser._id}`]: false }));
    }
  };

  // Delete user
  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`Are you sure you want to permanently delete user ${targetUser.email}?`)) {
      return;
    }
    setActionLoading((prev) => ({ ...prev, [`del_${targetUser._id}`]: true }));

    try {
      await adminApi.deleteUser(targetUser._id);
      setUsers((prev) => prev.filter((u) => u._id !== targetUser._id));
      showToast(`User ${targetUser.email} deleted successfully`);
      const statsRes = await adminApi.getStats();
      if (statsRes.data?.stats) setStats(statsRes.data.stats);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete user', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`del_${targetUser._id}`]: false }));
    }
  };

  // Save poller configuration
  const handleSavePollerConfig = async (e) => {
    if (e) e.preventDefault();
    setSavingPoller(true);
    try {
      const res = await adminApi.updatePollerConfig({
        enabled: pollerConfig.enabled,
        intervalMinutes: Number(pollerConfig.intervalMinutes),
      });
      showToast(res.data.message || 'Default polling schedule updated successfully!');
      const statsRes = await adminApi.getStats();
      if (statsRes.data?.stats) setStats(statsRes.data.stats);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update polling configuration', 'error');
    } finally {
      setSavingPoller(false);
    }
  };

  // Trigger manual poller cycle
  const handleTriggerPoller = async () => {
    setTriggeringPoller(true);
    setLastCycleResult(null);
    try {
      const res = await adminApi.triggerPoller('all');
      setLastCycleResult(res.data?.result || res.data);
      showToast(res.data?.result?.message || 'Poller check completed across all items!');
      const statsRes = await adminApi.getStats();
      if (statsRes.data?.stats) setStats(statsRes.data.stats);
    } catch (err) {
      showToast(err.response?.data?.message || err.response?.data?.error || 'Failed to run poller', 'error');
    } finally {
      setTriggeringPoller(false);
    }
  };

  const pendingCount = users.filter((u) => u.hasAccess === false).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-lg border flex items-center space-x-3 text-sm font-medium transition transform translate-y-0 ${
            toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-slate-800">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-400/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Administrator Control Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Admin Portal & Access Management
          </h1>
          <p className="text-slate-400 text-sm max-w-xl">
            Authorize users, govern platform permissions, and manage the automated background price polling engine.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Users</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-slate-900">{stats?.users?.total || users.length}</span>
            <span className="text-xs text-slate-500">registered</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Access Granted</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-emerald-600">
              {stats?.users?.approved ?? users.filter((u) => u.hasAccess).length}
            </span>
            <span className="text-xs text-emerald-700 font-medium">active users</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Access</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-amber-600">
              {stats?.users?.pending ?? pendingCount}
            </span>
            <span className="text-xs text-amber-700 font-medium">awaiting approval</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Polling Engine</span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                pollerConfig.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-xl font-bold text-slate-900">
              {pollerConfig.enabled ? `Every ${pollerConfig.intervalMinutes}m` : 'Paused'}
            </span>
            <span
              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                pollerConfig.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {pollerConfig.enabled ? 'Active' : 'Off'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-4 px-1 inline-flex items-center text-sm font-bold border-b-2 transition ${
              activeTab === 'users'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Users className="w-4 h-4 mr-2" />
            <span>User Management & Access Control</span>
            {pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full font-extrabold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('poller')}
            className={`pb-4 px-1 inline-flex items-center text-sm font-bold border-b-2 transition ${
              activeTab === 'poller'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Sliders className="w-4 h-4 mr-2" />
            <span>Default Polling Configuration</span>
          </button>

          <button
            onClick={() => setActiveTab('system')}
            className={`pb-4 px-1 inline-flex items-center text-sm font-bold border-b-2 transition ${
              activeTab === 'system'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Activity className="w-4 h-4 mr-2" />
            <span>System & Metrics</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: User Management & Access Control */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Action Bar: Search & Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>

            <div className="flex items-center space-x-1.5 w-full sm:w-auto overflow-x-auto">
              {[
                { id: 'all', label: 'All Users' },
                { id: 'pending', label: `Pending Approval (${pendingCount})` },
                { id: 'approved', label: 'Approved' },
                { id: 'admin', label: 'Admins' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setUserFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    userFilter === f.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* User Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider">Access Status</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider">Tracked</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider">Joined</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Access Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        No users found matching the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelf = currentUser?.email?.toLowerCase() === u.email?.toLowerCase();
                      const isLoadingAccess = actionLoading[u._id];
                      const isLoadingRole = actionLoading[`role_${u._id}`];
                      const isLoadingDel = actionLoading[`del_${u._id}`];

                      return (
                        <tr key={u._id} className="hover:bg-slate-50/70 transition">
                          {/* User Name & Email */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover border" />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm">
                                  {u.name?.charAt(0) || u.email?.charAt(0) || 'U'}
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-900 flex items-center space-x-1.5">
                                  <span>{u.name}</span>
                                  {isSelf && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-bold">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">{u.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Access Status Badge */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {u.hasAccess ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                Access Granted
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                                <XCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                                Pending Approval
                              </span>
                            )}
                          </td>

                          {/* Role Badge */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                u.role === 'admin'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200/60'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {u.role === 'admin' ? 'Administrator' : 'Standard User'}
                            </span>
                          </td>

                          {/* Tracked Items Count */}
                          <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-sm">
                            <span className="font-bold text-slate-900">{u.trackedItemsCount}</span> items
                          </td>

                          {/* Joined Date */}
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                            {/* Toggle Access Button */}
                            <button
                              onClick={() => handleToggleAccess(u)}
                              disabled={isLoadingAccess || isSelf}
                              title={isSelf ? 'Cannot revoke your own access' : undefined}
                              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs ${
                                u.hasAccess
                                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                              } ${isSelf ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {isLoadingAccess ? (
                                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                              ) : u.hasAccess ? (
                                <UserX className="w-3.5 h-3.5 mr-1" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5 mr-1" />
                              )}
                              <span>{u.hasAccess ? 'Revoke Access' : 'Grant Access'}</span>
                            </button>

                            {/* Toggle Role Button */}
                            <button
                              onClick={() => handleToggleRole(u)}
                              disabled={isLoadingRole || isSelf}
                              className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                u.role === 'admin'
                                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                  : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                              } ${isSelf ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                            </button>

                            {/* Delete User */}
                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                disabled={isLoadingDel}
                                title="Delete user account"
                                className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded-lg hover:bg-rose-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Default Polling Configuration */}
      {activeTab === 'poller' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Polling Settings Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Default Polling Schedule & Controls</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Configure how frequently Price Ghost automatically inspects external e-commerce sites (Amazon, Flipkart, Myntra) for price drops.
                </p>
              </div>

              {/* Master Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border bg-slate-50">
                <div className="space-y-0.5">
                  <span className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Power className={`w-4 h-4 ${pollerConfig.enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>Automatic Background Polling</span>
                  </span>
                  <p className="text-xs text-slate-500">
                    When active, the scheduler checks prices periodically in the background according to the configured interval.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pollerConfig.enabled}
                    onChange={(e) => setPollerConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Polling Interval Presets */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-900">
                  Default Polling Frequency
                </label>
                <p className="text-xs text-slate-500">
                  Select how often the background poller wakes up to inspect tracked products.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { minutes: 5, label: '5 min', desc: 'Testing' },
                    { minutes: 15, label: '15 min', desc: 'High frequency' },
                    { minutes: 30, label: '30 min', desc: 'Standard' },
                    { minutes: 60, label: '1 hour', desc: 'Recommended' },
                    { minutes: 180, label: '3 hours', desc: 'Light' },
                    { minutes: 360, label: '6 hours', desc: 'Gentle' },
                    { minutes: 720, label: '12 hours', desc: 'Twice daily' },
                    { minutes: 1440, label: '24 hours', desc: 'Daily' },
                  ].map((preset) => {
                    const isSelected = Number(pollerConfig.intervalMinutes) === preset.minutes;
                    return (
                      <button
                        key={preset.minutes}
                        type="button"
                        onClick={() => setPollerConfig((prev) => ({ ...prev, intervalMinutes: preset.minutes }))}
                        className={`p-3 rounded-xl border text-left transition ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="font-bold text-sm text-slate-900">{preset.label}</div>
                        <div className="text-[11px] text-slate-500">{preset.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Interval Input */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600">
                  Or enter custom interval (in minutes):
                </label>
                <div className="flex items-center space-x-3 max-w-xs">
                  <input
                    type="number"
                    min="1"
                    max="10080"
                    value={pollerConfig.intervalMinutes}
                    onChange={(e) => setPollerConfig((prev) => ({ ...prev, intervalMinutes: Number(e.target.value) }))}
                    className="w-32 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-500 font-medium">minutes</span>
                </div>
              </div>

              {/* Save Poller Button */}
              <div className="pt-4 border-t flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleSavePollerConfig}
                  disabled={savingPoller}
                  className="inline-flex items-center px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50"
                >
                  {savingPoller && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                  <span>Save Default Polling Settings</span>
                </button>
              </div>
            </div>
          </div>

          {/* Immediate Run Card & Live Status */}
          <div className="space-y-6">
            {/* Manual Run Box */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-6 shadow-xs space-y-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <Play className="w-5 h-5 ml-0.5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Immediate Poller Trigger</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Perform an instant price scrape across all tracked products without waiting for the background schedule.
                </p>
              </div>

              <button
                type="button"
                onClick={handleTriggerPoller}
                disabled={triggeringPoller || pollerRunning}
                className="w-full inline-flex items-center justify-center px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {triggeringPoller ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    <span>Scraping items in progress...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    <span>Run Poller Cycle Now</span>
                  </>
                )}
              </button>

              {lastCycleResult && (
                <div className="p-3 bg-white/80 rounded-xl border border-indigo-200 text-xs space-y-1">
                  <div className="font-bold text-indigo-900">Last Run Result:</div>
                  <div className="text-slate-700">{lastCycleResult.message}</div>
                  <div className="text-[11px] text-slate-500">
                    Checked: {lastCycleResult.itemsChecked} | Changes: {lastCycleResult.priceChangesDetected} | Alerts:{' '}
                    {lastCycleResult.alertsSent}
                  </div>
                </div>
              )}
            </div>

            {/* Poller Metrics Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Poller Engine Status</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Scheduler State:</span>
                  <span className="font-bold text-slate-900">
                    {pollerConfig.enabled ? '🟢 Auto-polling active' : '⚪ Paused'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Interval:</span>
                  <span className="font-mono font-bold text-indigo-600">{pollerConfig.intervalMinutes}m</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Polite Delay:</span>
                  <span className="font-mono text-slate-700">2000ms - 5000ms</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Execution Mode:</span>
                  <span className="font-mono text-slate-700">Cron Scheduler</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: System & Metrics */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Server Uptime</div>
              <div className="text-2xl font-black text-slate-900">
                {stats?.system?.uptimeSeconds ? `${Math.floor(stats.system.uptimeSeconds / 60)} mins` : 'Active'}
              </div>
              <p className="text-xs text-slate-400">Node runtime: {stats?.system?.nodeVersion || 'v24'}</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Memory Consumption</div>
              <div className="text-2xl font-black text-slate-900">
                {stats?.system?.memoryMb ? `${stats.system.memoryMb} MB` : 'N/A'}
              </div>
              <p className="text-xs text-slate-400">Resident set size</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Tracked Products</div>
              <div className="text-2xl font-black text-indigo-600">
                {stats?.items?.total || 0}
              </div>
              <p className="text-xs text-slate-400">Across Amazon, Flipkart, Myntra</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
