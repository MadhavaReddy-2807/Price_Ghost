import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  TrendingDown,
  ShieldCheck,
  Zap,
  Bell,
  ArrowRight,
  Puzzle,
  CheckCircle2,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-24 lg:pt-28 lg:pb-32 bg-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45rem_50rem_at_top,theme(colors.indigo.100),theme(colors.white))] opacity-60" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold mb-8 shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Automated E-Commerce Price Tracker for India</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight max-w-4xl mx-auto">
            Never Overpay Again on{' '}
            <span className="bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 bg-clip-text text-transparent">
              Amazon, Flipkart & Myntra
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Price Ghost silently tracks product prices in the background while you shop. 
            Get instant email alerts the exact moment prices drop below your custom target threshold.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={isAuthenticated ? '/dashboard' : '/login'}
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-xl font-bold text-base text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition"
            >
              <span>{isAuthenticated ? 'Go to Dashboard' : 'Start Tracking Free'}</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>

            <Link
              to="/install"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-xl font-bold text-base text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
            >
              <Puzzle className="w-4 h-4 mr-2 text-indigo-600" />
              <span>Get Chrome Extension</span>
            </Link>
          </div>

          {/* Supported Stores Logos */}
          <div className="mt-16 pt-8 border-t border-slate-100 max-w-2xl mx-auto">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Supported Platforms
            </p>
            <div className="flex justify-center items-center gap-8 text-slate-600 text-sm font-semibold">
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Amazon.in</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>Flipkart.com</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>Myntra.com</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Engineered for Smart Shoppers</h2>
            <p className="mt-3 text-slate-600 text-base">
              Say goodbye to fake sales, misleading discounts, and constantly refreshing tabs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">1-Click Manual Price Tracking</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Track only the products you care about. Click the sleek "👻 Track Price" button on any shopping page or paste a link in your dashboard.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
                <TrendingDown className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Autonomous Price Poller</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Our backend background scheduler continuously checks tracked products every 1–2 hours, maintaining up to 365 days of price history curves.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
              <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-5">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Smart Quiet Hours Alerts</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Define quiet hours (e.g. 10 PM to 8 AM) so non-urgent alerts never wake you up. Receive high-converting HTML emails with direct buy links.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-500">
        <p>© 2026 Price Ghost. Free, open-source personal shopping intelligence.</p>
      </footer>
    </div>
  );
}
