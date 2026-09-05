import React from 'react';
import {
  Puzzle,
  Download,
  FolderCheck,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

export default function InstallExtension() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl mb-4">
          <Puzzle className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Install the Chrome Extension
        </h1>
        <p className="mt-3 text-slate-600 text-base leading-relaxed">
          Enable 1-click price tracking and instant drop notifications as you browse Amazon, Flipkart, and Myntra.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/price-ghost-extension.zip"
            download="price-ghost-extension.zip"
            className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm rounded-xl shadow-md transition transform hover:-translate-y-0.5"
          >
            <Download className="w-4 h-4 mr-2" />
            <span>Download Extension (.ZIP)</span>
          </a>
        </div>
      </div>

      {/* Step by Step Cards */}
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
            price-ghost-extension.zip → Extract All
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
            Click the <strong className="text-indigo-600">"Load unpacked"</strong> button in the top-left corner, and select the <code>extension/dist</code> folder.
          </p>
        </div>
      </div>

      {/* Success Celebration */}
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
    </div>
  );
}
