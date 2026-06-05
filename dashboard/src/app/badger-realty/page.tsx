"use client";

export default function BadgerRealtyPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Badger Realty
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Real estate brokerage &amp; market intelligence
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Services
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mt-2">
            Commercial Brokerage
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Leasing, sales, tenant representation
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Market Data Access
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mt-2">
            CoStar (Pending)
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Market comps, rent surveys, analytics
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Role in Portfolio
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mt-2">
            Market Intelligence
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Provides comps for KPI benchmarking
          </p>
        </div>
      </div>

      {/* Integration Status */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Data Integration Status
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                CoStar Market Data
              </span>
            </div>
            <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded">
              Pending Access
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Market Rent Comps → KPI Dashboard
              </span>
            </div>
            <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded">
              Awaiting CoStar
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Transaction/Commission Tracking
              </span>
            </div>
            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
              Future Phase
            </span>
          </div>
        </div>
      </div>

      {/* How it connects */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-5 border border-blue-100 dark:border-blue-800">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
          How Badger Realty fits in the Command Center
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li>Provides market rent comps for KPI in-place vs. market comparisons</li>
          <li>Sources releasing spread data when leases turn over</li>
          <li>Feeds submarket benchmark rates by asset class</li>
          <li>Tracks brokerage commissions and deal pipeline (future)</li>
        </ul>
      </div>
    </div>
  );
}
