"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface SummaryData {
  jrw: {
    noi: number;
    occupancyRate: number;
    propertyCount: number;
    monthlyTrend?: number[];
  };
  big: {
    feeRevenue: number;
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
    margin: number;
    propertiesManaged: number;
    monthlyTrend?: number[];
  };
  hotel: {
    roomRevenue: number;
    totalRevenue: number;
    gop: number;
    monthlyTrend?: number[];
  };
  alerts: {
    leasesExpiring: number;
    agedReceivables: number;
    feeReconciliationGap: number;
  };
  period: {
    from: string;
    to: string;
    basis: string;
  };
}

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 32;
  const w = 100;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  // Green if trending up (last > first), red if down
  const trending = data[data.length - 1] >= data[0];
  const color = trending ? "#22c55e" : "#ef4444";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 mt-2" preserveAspectRatio="none">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CommandCenterPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetch("/api/command-center")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Loading Command Center...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Failed to load data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Command Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Three businesses, run independently
          </p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
          {data.period.basis} · {data.period.from} to {data.period.to}
        </span>
      </div>

      {/* Three Business Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* JRW Portfolio */}
        <Link href="/jrw/dashboard" className="block group">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-green-200 transition-all cursor-pointer h-full">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                <span className="text-lg">🏢</span>
              </div>
              <span className="text-gray-400 group-hover:text-green-600 transition-colors">→</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              JRW Portfolio
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {fmtK(data.jrw.noi)}
            </p>
            <p className="text-xs text-gray-400 mb-2">NOI · {data.period.basis}</p>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{data.jrw.occupancyRate}% occ.</span>
              <span>{data.jrw.propertyCount} properties</span>
            </div>
            {data.jrw.monthlyTrend && (
              <Sparkline data={data.jrw.monthlyTrend} />
            )}
          </div>
        </Link>

        {/* BIG Management */}
        <Link href="/big/dashboard" className="block group">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-amber-200 transition-all cursor-pointer h-full">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <img src="/logo-white.png" alt="" className="w-5 h-6 object-contain invert dark:invert-0" />
              </div>
              <span className="text-gray-400 group-hover:text-amber-600 transition-colors">→</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              BIG Management
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {fmtK(data.big.totalIncome)}
            </p>
            <p className="text-xs text-gray-400 mb-2">Total Revenue · {data.period.basis}</p>
            <div className="flex justify-between text-xs text-gray-500">
              <span className={data.big.margin < 0 ? "text-red-500" : ""}>{data.big.margin}% margin</span>
              <span>{data.big.propertiesManaged} managed</span>
            </div>
            {data.big.monthlyTrend && (
              <Sparkline data={data.big.monthlyTrend} />
            )}
          </div>
        </Link>

        {/* Badger Hotel */}
        <Link href="/hotel/dashboard" className="block group">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-purple-200 transition-all cursor-pointer h-full">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
                <span className="text-lg">🛎️</span>
              </div>
              <span className="text-gray-400 group-hover:text-purple-600 transition-colors">→</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Badger Hotel
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {fmtK(data.hotel.roomRevenue)}
            </p>
            <p className="text-xs text-gray-400 mb-2">Room Revenue · {data.period.basis}</p>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{fmtK(data.hotel.gop)} GOP</span>
              <span>{fmtK(data.hotel.totalRevenue)} total rev.</span>
            </div>
            {data.hotel.monthlyTrend && (
              <Sparkline data={data.hotel.monthlyTrend} />
            )}
          </div>
        </Link>
      </div>

      {/* Needs Attention Strip */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
          <span>🔔</span> Needs Attention
        </p>
        <div className="flex flex-wrap gap-2">
          {data.alerts.leasesExpiring > 0 ? (
            <Link href="/lease-expirations">
              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100 transition-colors cursor-pointer">
                {data.alerts.leasesExpiring} leases expiring &lt; 90d
              </span>
            </Link>
          ) : (
            <Link href="/lease-expirations">
              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100 transition-colors cursor-pointer">
                No leases expiring &lt; 90d
              </span>
            </Link>
          )}
          {data.alerts.agedReceivables > 0 && (
            <Link href="/aged-receivables">
              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100 transition-colors cursor-pointer">
                {fmtK(data.alerts.agedReceivables)} aged receivables
              </span>
            </Link>
          )}
          {data.alerts.feeReconciliationGap > 1000 ? (
            <Link href="/big/dashboard">
              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100 transition-colors cursor-pointer">
                Internal fee recon off {fmtK(data.alerts.feeReconciliationGap)}
              </span>
            </Link>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              Fee recon balanced
            </span>
          )}

        </div>
      </div>
    </div>
  );
}
