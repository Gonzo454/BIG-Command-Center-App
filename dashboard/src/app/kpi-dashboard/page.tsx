"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { DateRangePicker } from "@/components/DateRangePicker";

interface PropertyKPI {
  name: string;
  slug: string;
  assetClass: string;
  assetClassLabel: string;
  managedOnly: boolean;
  ownershipPct: number;
  revenue: number;
  expenses: number;
  noi: number;
  noiMargin: number;
  netAfterDebt: number;
  totalUnits: number;
  occupied: number;
  vacant: number;
  occupancyRate: number;
  totalSqft: number;
  occupiedSqft: number;
  vacancyLoss: number;
  debtService: number;
  dscr: number;
  oer: number;
  walt: number | null;
  leaseExposure12mo: number;
  rentPerSf: number | null;
  collectionRate: number;
  delinquent: number;
  status: "Strong" | "Stable" | "Review";
  targets: {
    oer: string;
    noiMargin: string;
    dscrMin: number;
    waltYears: number | null;
    occupancy: number;
  };
}

interface PortfolioKPI {
  revenue: number;
  noi: number;
  noiMargin: number;
  occupancyRate: number;
  occupancySf: number;
  totalUnits: number;
  occupied: number;
  vacant: number;
  totalSqft: number;
  occupiedSqft: number;
  vacancyLoss: number;
  oer: number;
  dscr: number;
  debtService: number;
  walt: number | null;
  delinquent: number;
  propertyCount: number;
  reviewCount: number;
  stableCount: number;
  strongCount: number;
}

interface KPIData {
  portfolio: PortfolioKPI;
  properties: PropertyKPI[];
  period: { from: string; to: string; label: string; monthsElapsed: number };
}

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtM = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n < 0 ? "-" : "") + "$" + (abs / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return (n < 0 ? "-" : "") + "$" + (abs / 1_000).toFixed(0) + "K";
  return fmtK(n);
};

const statusColor = (s: string) => {
  if (s === "Strong") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (s === "Review") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  // Stable = neutral/black
  return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
};

function propertyHref(name: string): string {
  if (name === "Badger Hotel Group") return "/hotel/dashboard";
  return `/properties/${encodeURIComponent(name)}`;
}

export default function KPIDashboardPage() {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialized = useRef(false);
  const dataCache = useRef<Map<string, KPIData>>(new Map());

  async function fetchData(from?: string, to?: string, period?: string, prefetchOnly = false) {
    const key = `${from || "default"}:${to || "default"}:${period || "mtd"}`;
    const cached = dataCache.current.get(key);
    if (prefetchOnly && cached) return;
    if (!prefetchOnly) {
      if (cached) {
        setData(cached);
        setLoading(false);
        setRefreshing(true);
      } else {
        setLoading(true);
      }
    }
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (period) params.set("period", period);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/kpi-dashboard${qs}`);
      const d = await res.json();
      dataCache.current.set(key, d);
      if (!prefetchOnly) setData(d);
    } catch (err) {
      console.error("Failed to fetch KPI data:", err);
    } finally {
      if (!prefetchOnly) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetchData();
    // Prefetch QTD and YTD
    const d = new Date();
    const todayStr = d.toISOString().split("T")[0];
    const q = Math.floor(d.getMonth() / 3) * 3;
    const qtdFrom = `${d.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
    const ytdFrom = `${d.getFullYear()}-01-01`;
    setTimeout(() => {
      fetchData(qtdFrom, todayStr, "qtd", true);
      fetchData(ytdFrom, todayStr, "ytd", true);
    }, 1500);
  }, []);

  function handleRangeChange(from: string, to: string, period: string) {
    fetchData(from, to, period);
  }

  if (loading && !data) return <div className="text-center py-20 text-gray-500">Loading KPI Dashboard...</div>;
  if (!data) return <div className="text-center py-20 text-gray-500">No data available</div>;

  const { portfolio: p, properties } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">KPI Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {p.propertyCount} Properties &middot; {data.period.label} {data.period.from} &ndash; {data.period.to} &middot; CRE Operating Metrics
          </p>
        </div>
        <DateRangePicker onRangeChange={handleRangeChange} />
      </div>

      {refreshing && (
        <div className="text-xs text-blue-500 animate-pulse">Updating...</div>
      )}

      {/* Top-level Financial KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Portfolio Revenue (EGI)" value={fmtM(p.revenue)} />
        <MetricCard label="Portfolio NOI" value={fmtM(p.noi)} sub={`${p.noiMargin}% margin`} />
        <MetricCard
          label="Portfolio DSCR"
          value={p.dscr > 0 ? `${p.dscr}x` : "—"}
          sub={p.dscr > 0 ? (p.dscr >= 1.25 ? "Healthy" : p.dscr >= 1.0 ? "Tight" : "Below 1.0x") : "No debt data"}
          color={p.dscr >= 1.25 ? "text-emerald-600" : p.dscr >= 1.0 ? "text-amber-600" : p.dscr > 0 ? "text-red-600" : undefined}
        />
        <MetricCard
          label="Avg OER"
          value={`${p.oer}%`}
          sub="Target: 35–50% (blended)"
          color={p.oer <= 50 ? "text-emerald-600" : p.oer <= 60 ? "text-amber-600" : "text-red-600"}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Occupancy" value={`${p.occupancyRate}%`} sub={`${p.occupied} of ${p.totalUnits} units`} />
        <MetricCard label="Vacancy Loss" value={fmtM(p.vacancyLoss)} sub={`${p.vacant} vacant units`} color={p.vacancyLoss > 0 ? "text-red-600" : undefined} />
        <MetricCard label="WALT" value={p.walt ? `${p.walt} yrs` : "—"} sub="Weighted Avg Lease Term" />
        <MetricCard
          label="AR Delinquent (>30d)"
          value={p.delinquent > 0 ? fmtM(p.delinquent) : "$0"}
          color={p.delinquent > 0 ? "text-red-600" : "text-emerald-600"}
        />
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
        <MetricCard label="Strong" value={String(p.strongCount)} sub={`of ${p.propertyCount}`} color="text-emerald-600" />
        <MetricCard label="Stable" value={String(p.stableCount)} sub={`of ${p.propertyCount}`} color="text-gray-700 dark:text-gray-300" />
        <MetricCard label="Review" value={String(p.reviewCount)} sub={`of ${p.propertyCount}`} color={p.reviewCount > 0 ? "text-red-600" : "text-emerald-600"} />
      </div>

      {/* All-Property Revenue & NOI Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">All-Property Revenue &amp; NOI Summary</h2>
          <p className="text-xs text-gray-500 mt-0.5">Sorted by revenue &middot; {data.period.label} actuals</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blue-50 dark:bg-gray-700 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Property</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Type</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Status</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Revenue</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">NOI</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">DSCR</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">OER</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Net After Debt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {properties.map((c) => (
                <tr key={c.slug} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <Link href={propertyHref(c.name)} className="text-[#E07B2A] hover:underline font-medium">
                      {c.name}
                    </Link>
                    <span className="text-xs text-gray-400 ml-2">
                      {Math.round(c.ownershipPct * 100)}% owned
                      {c.managedOnly && <span className="ml-1 text-blue-400">(managed-only)</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-gray-500">{c.assetClassLabel}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusColor(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{fmtK(c.revenue)}</td>
                  <td className={`px-3 py-3 text-right font-mono ${c.noi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtK(c.noi)}
                  </td>
                  <td className={`px-3 py-3 text-right font-mono font-semibold ${c.dscr === 0 ? "text-gray-400" : c.dscr >= 1.25 ? "text-emerald-600" : c.dscr >= 1.0 ? "text-amber-600" : "text-red-600"}`}>
                    {c.dscr > 0 ? `${c.dscr}x` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    <span>{c.oer}%</span>
                    <span className="text-xs text-gray-400 ml-1">({c.targets.oer})</span>
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${c.netAfterDebt >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtK(c.netAfterDebt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leasing & Occupancy Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Leasing &amp; Occupancy</h2>
          <p className="text-xs text-gray-500 mt-0.5">From current rent roll &middot; WALT = weighted average lease term by rent</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blue-50 dark:bg-gray-700 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Property</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Occupancy</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">SF</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Vacant</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Vacancy Loss</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Rent/SF</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">WALT</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Lease Exp. 12mo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {properties.filter((c) => c.totalUnits > 0).map((c) => (
                <tr key={c.slug} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <Link href={propertyHref(c.name)} className="text-[#E07B2A] hover:underline font-medium">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-mono font-semibold ${c.occupancyRate >= c.targets.occupancy ? "text-emerald-600" : c.occupancyRate >= c.targets.occupancy - 10 ? "text-amber-600" : "text-red-600"}`}>
                      {c.occupancyRate}%
                    </span>
                    <span className="text-xs text-gray-400 ml-1">({c.occupied}/{c.totalUnits})</span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs">
                    {c.totalSqft > 0 ? `${c.totalSqft.toLocaleString()} sf` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-red-600">{c.vacant}</td>
                  <td className="px-3 py-3 text-right font-mono text-red-600">{c.vacancyLoss > 0 ? fmtK(c.vacancyLoss) : "$0"}</td>
                  <td className="px-3 py-3 text-right font-mono">
                    {c.rentPerSf ? `$${c.rentPerSf.toFixed(2)}` : "—"}
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${c.walt !== null && c.targets.waltYears !== null ? (c.walt >= c.targets.waltYears ? "text-emerald-600" : c.walt >= c.targets.waltYears * 0.6 ? "text-amber-600" : "text-red-600") : ""}`}>
                    {c.walt !== null ? `${c.walt} yr` : "—"}
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${c.leaseExposure12mo > 25 ? "text-red-600 font-semibold" : c.leaseExposure12mo > 15 ? "text-amber-600" : ""}`}>
                    {c.leaseExposure12mo}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Health & Collections */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Financial Health &amp; Collections</h2>
          <p className="text-xs text-gray-500 mt-0.5">DSCR = NOI &divide; Debt Service &middot; OER targets vary by asset class &middot; Collection target: 95%+</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blue-50 dark:bg-gray-700 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Property</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">DSCR</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">OER</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Debt Svc</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Collection</th>
                <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Delinquent</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {properties.filter((c) => c.revenue > 0).map((c) => (
                <tr key={c.slug} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <Link href={propertyHref(c.name)} className="text-[#E07B2A] hover:underline font-medium">
                      {c.name}
                    </Link>
                  </td>
                  <td className={`px-3 py-3 text-right font-mono font-semibold ${c.dscr === 0 ? "text-gray-400" : c.dscr >= 1.25 ? "text-emerald-600" : c.dscr >= 1.0 ? "text-amber-600" : "text-red-600"}`}>
                    {c.dscr > 0 ? `${c.dscr}x` : "—"}
                    {c.dscr > 0 && <span className="text-xs text-gray-400 ml-1">(min {c.targets.dscrMin}x)</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    <span>{c.oer}%</span>
                    <span className="text-xs text-gray-400 ml-1">({c.targets.oer})</span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{c.debtService > 0 ? fmtK(c.debtService) : "—"}</td>
                  <td className={`px-3 py-3 text-right font-mono ${c.collectionRate >= 95 ? "text-emerald-600" : c.collectionRate >= 90 ? "text-amber-600" : "text-red-600"}`}>
                    {c.collectionRate}%
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${c.delinquent > 0 ? "text-red-600" : ""}`}>
                    {c.delinquent > 0 ? fmtK(c.delinquent) : "$0"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusColor(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || "text-gray-900 dark:text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
