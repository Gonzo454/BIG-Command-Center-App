"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface PropertyKPI {
  name: string;
  slug: string;
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
  vacancyLoss: number;
  laborPercent: number;
  laborTotal: number;
  debtService: number;
  dscr: number;
  oer: number;
  status: "Strong" | "Watch" | "Concern";
}

interface PortfolioKPI {
  revenue: number;
  noi: number;
  noiMargin: number;
  occupancyRate: number;
  totalUnits: number;
  occupied: number;
  vacant: number;
  vacancyLoss: number;
  laborPercent: number;
  oer: number;
  propertyCount: number;
  concernCount: number;
  watchCount: number;
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
  if (s === "Watch") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
};

function propertyHref(name: string): string {
  if (name === "Blackdeer Investment Group") return "/big/dashboard";
  if (name === "Badger Hotel Group") return "/hotel/dashboard";
  return `/properties/${encodeURIComponent(name)}`;
}

export default function KPIDashboardPage() {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetch("/api/kpi-dashboard")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-500">Loading KPI Dashboard...</div>;
  if (!data) return <div className="text-center py-20 text-gray-500">No data available</div>;

  const { portfolio: p, properties } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">KPI Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {p.propertyCount} Properties &middot; {data.period.label} {data.period.from} &ndash; {data.period.to} &middot; Operating Metrics
        </p>
      </div>

      {/* Top-level KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Portfolio Revenue" value={fmtM(p.revenue)} />
        <MetricCard label="Portfolio NOI" value={fmtM(p.noi)} sub={`${p.noiMargin}% margin`} />
        <MetricCard label="Occupancy" value={`${p.occupancyRate}%`} sub={`${p.occupied} of ${p.totalUnits} units`} />
        <MetricCard label="Vacancy Loss" value={fmtM(p.vacancyLoss)} sub={`${p.vacant} vacant units`} color="text-red-600" />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Labor % Revenue" value={`${p.laborPercent}%`} sub="Target: 45–50%" />
        <MetricCard label="Avg OER" value={`${p.oer}%`} sub="Target: 65–70%" />
        <MetricCard label="Properties — Concern" value={String(p.concernCount)} sub={`of ${p.propertyCount}`} color={p.concernCount > 0 ? "text-red-600" : "text-emerald-600"} />
        <MetricCard label="Properties — Watch" value={String(p.watchCount)} sub={`of ${p.propertyCount}`} color={p.watchCount > 0 ? "text-amber-600" : "text-emerald-600"} />
      </div>

      {/* All-Property Revenue & NOI Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">All-Property Revenue &amp; NOI Summary</h2>
          <p className="text-xs text-gray-500 mt-0.5">Sorted by revenue &middot; {data.period.label} actuals</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Property</th>
                <th className="text-center px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Revenue</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">NOI</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">NOI Margin</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Net After Debt</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Vacancy Loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {properties.map((c) => (
                <tr key={c.slug} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <Link href={propertyHref(c.name)} className="text-[#E07B2A] hover:underline font-medium">
                      {c.name}
                    </Link>
                    <span className="text-xs text-gray-400 ml-2">{Math.round(c.ownershipPct * 100)}% owned</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusColor(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{fmtK(c.revenue)}</td>
                  <td className={`px-3 py-3 text-right font-mono ${c.noi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtK(c.noi)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{c.noiMargin}%</td>
                  <td className={`px-3 py-3 text-right font-mono ${c.netAfterDebt >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtK(c.netAfterDebt)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-red-600">{fmtK(c.vacancyLoss)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Occupancy Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Occupancy &amp; Census KPIs</h2>
          <p className="text-xs text-gray-500 mt-0.5">From current rent roll &middot; Target: 90%+</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Property</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Occupancy</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Units</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Vacant</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Vacancy Loss</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">RevPOU</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">RevPAU</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {properties.filter((c) => c.totalUnits > 0).map((c) => {
                const months = data.period.monthsElapsed || 1;
                const revpou = c.occupied > 0 ? Math.round(c.revenue / c.occupied / months) : 0;
                const revpau = c.totalUnits > 0 ? Math.round(c.revenue / c.totalUnits / months) : 0;
                return (
                  <tr key={c.slug} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-4 py-3">
                      <Link href={propertyHref(c.name)} className="text-[#E07B2A] hover:underline font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-mono font-semibold ${c.occupancyRate >= 90 ? "text-emerald-600" : c.occupancyRate >= 80 ? "text-amber-600" : "text-red-600"}`}>
                        {c.occupancyRate}%
                      </span>
                      <span className="text-xs text-gray-400 ml-1">({c.occupied}/{c.totalUnits})</span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{c.totalUnits}</td>
                    <td className="px-3 py-3 text-right font-mono text-red-600">{c.vacant}</td>
                    <td className="px-3 py-3 text-right font-mono text-red-600">{fmtK(c.vacancyLoss)}</td>
                    <td className="px-3 py-3 text-right font-mono">{fmtK(revpou)}</td>
                    <td className="px-3 py-3 text-right font-mono">{fmtK(revpau)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Labor & Financial Health */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Financial Health &amp; Labor KPIs</h2>
          <p className="text-xs text-gray-500 mt-0.5">DSCR = NOI &divide; Debt Service &middot; OER = Expenses &divide; Revenue &middot; Labor target: 45–50%</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Property</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">DSCR</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">OER</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Labor %</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Total Labor</th>
                <th className="text-right px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Debt Svc</th>
                <th className="text-center px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
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
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${c.oer <= 70 ? "text-emerald-600" : c.oer <= 80 ? "text-amber-600" : "text-red-600"}`}>
                    {c.oer}%
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${c.laborPercent <= 50 ? "text-emerald-600" : c.laborPercent <= 55 ? "text-amber-600" : "text-red-600"}`}>
                    {c.laborPercent}%
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{fmtK(c.laborTotal)}</td>
                  <td className="px-3 py-3 text-right font-mono">{c.debtService > 0 ? fmtK(c.debtService) : "—"}</td>
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
