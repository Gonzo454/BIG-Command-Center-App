"use client";

import { LoadingState } from "@/components/LoadingState";
import { apiJson } from "@/lib/fetchRetry";
import { useEffect, useState, useCallback } from "react";
import { ProfitGauge } from "@/components/ProfitGauge";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExportButtons } from "@/components/ExportButtons";

interface CommunitySnapshot {
  name: string;
  slug: string;
  location: string;
  careTypes: string[];
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  occupancyRate: number;
  totalUnits: number;
  occupied: number;
}

interface PvData {
  communities: CommunitySnapshot[];
  portfolio: {
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
    totalUnits: number;
    occupied: number;
    occupancyRate: number;
    communityCount: number;
  };
  alerts: {
    leasesExpiring: number;
    agedReceivables: number;
  };
  period: { from: string; to: string; basis: string };
  ownershipView?: boolean;
}

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export default function PvDashboardPage() {
  const [data, setData] = useState<PvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownershipView, setOwnershipView] = useState(false);
  const [range, setRange] = useState({ from: firstOfMonth(), to: todayStr(), period: "mtd" });

  const fetchData = useCallback(() => {
    const view = ownershipView ? "&view=joe" : "";
    apiJson(`/api/park-vista?from=${range.from}&to=${range.to}&period=${range.period}${view}`)
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [ownershipView, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <LoadingState />
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Failed to load data</p>
      </div>
    );
  }

  const maxAbsolute = Math.max(
    ...data.communities.map((c) => Math.abs(c.netIncome)),
    1
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Park Vista Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Senior Housing Management — {data.portfolio.communityCount} communities
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-[#E07B2A] overflow-hidden">
            <button
              onClick={() => setOwnershipView(false)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-all ${
                !ownershipView
                  ? "bg-[#E07B2A] text-white"
                  : "bg-white text-gray-500 hover:bg-[#E07B2A]/10 hover:text-[#E07B2A] dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              Portfolio View
            </button>
            <button
              onClick={() => setOwnershipView(true)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-all border-l border-gray-200 dark:border-gray-600 ${
                ownershipView
                  ? "bg-[#E07B2A] text-white"
                  : "bg-white text-gray-500 hover:bg-[#E07B2A]/10 hover:text-[#E07B2A] dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              Joe&apos;s Share (51%)
            </button>
          </div>
        </div>
      </div>
      <div className="h-0.5 w-full bg-[#E07B2A] rounded" />
      <div className="flex flex-wrap items-center justify-between gap-3">
      <ExportButtons
        fileName={`park-vista-dashboard-${range.from}-to-${range.to}`}
        title="Park Vista Dashboard"
        headers={["Community", "Location", "Income", "Expenses", "Net Income", "Occupancy %", "Units", "Occupied"]}
        rows={data.communities.map((c) => [
          c.name,
          c.location,
          c.totalIncome,
          c.totalExpenses,
          c.netIncome,
          c.occupancyRate,
          c.totalUnits,
          c.occupied,
        ])}
      />
        <div className="ml-auto">
          <DateRangePicker
            onRangeChange={(from, to, period) => setRange({ from, to, period })}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label="Total Income" value={fmtK(data.portfolio.totalIncome)} color="text-emerald-600" />
        <KpiCard label="Total Expenses" value={fmtK(data.portfolio.totalExpenses)} color="text-red-600" />
        <KpiCard
          label="Net Income"
          value={fmtK(data.portfolio.netIncome)}
          color={data.portfolio.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}
        />
        <KpiCard
          label="Occupancy"
          value={`${data.portfolio.occupancyRate}%`}
          subtitle={`${data.portfolio.occupied} / ${data.portfolio.totalUnits} units`}
          color="text-blue-600"
        />
      </div>

      {/* Alerts */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
          <span>🔔</span> Needs Attention
        </p>
        <div className="flex flex-wrap gap-2">
          {data.alerts.leasesExpiring > 0 ? (
            <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {data.alerts.leasesExpiring} leases expiring &lt; 90d
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              No leases expiring &lt; 90d
            </span>
          )}
          {data.alerts.agedReceivables > 0 && (
            <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {fmtK(data.alerts.agedReceivables)} aged receivables
            </span>
          )}
        </div>
      </div>

      {/* Community Profitability Gauges */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Community Profitability
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {data.communities
            .sort((a, b) => b.netIncome - a.netIncome)
            .map((c) => (
              <ProfitGauge
                key={c.slug}
                name={c.name}
                netIncome={c.netIncome}
                maxAbsolute={maxAbsolute}
                href={`/pv/communities/${c.slug}`}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  subtitle,
}: {
  label: string;
  value: string;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`font-bold mt-1 ${color}`} style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
