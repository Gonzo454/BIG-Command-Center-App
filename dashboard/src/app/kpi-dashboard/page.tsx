"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExportButtons } from "@/components/ExportButtons";

interface PropertyKPI {
  name: string;
  slug: string;
  assetClass: string;
  assetClassLabel: string;
  businessEntity: string;
  managedOnly: boolean;
  ownershipPct: number;
  revenue: number;
  expenses: number;
  noi: number;
  noiMargin: number;
  netAfterDebt: number | null;
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

interface EntitySummary {
  revenue: number;
  noi: number;
  noiMargin: number;
  occupancyRate: number;
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

interface EntitySection {
  entity: string;
  label: string;
  summary: EntitySummary;
  properties: PropertyKPI[];
}

interface KPIData {
  portfolio: EntitySummary;
  sections: EntitySection[];
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
  return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
};

function propertyHref(p: PropertyKPI): string {
  if (p.businessEntity === "park_vista") return `/pv/communities/${p.slug}`;
  if (p.name === "Badger Hotel Group") return "/hotel/dashboard";
  return `/properties/${encodeURIComponent(p.name)}`;
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

  const { sections } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">KPI Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.period.label} {data.period.from} &ndash; {data.period.to} &middot; Performance by Business Entity
          </p>
        </div>
        <DateRangePicker onRangeChange={handleRangeChange} />
      </div>

      <ExportButtons
        fileName={`kpi-dashboard-${data.period.label.toLowerCase()}`}
        title="KPI Dashboard"
        headers={["Entity", "Property", "Asset Class", "Revenue", "Expenses", "NOI", "NOI Margin %", "DSCR", "OER %", "Occupancy %", "Status"]}
        rows={sections.flatMap((sec) =>
          sec.properties.map((p) => [
            sec.label,
            p.name,
            p.assetClassLabel,
            p.revenue,
            p.expenses,
            p.noi,
            p.noiMargin,
            p.dscr,
            p.oer,
            p.occupancyRate,
            p.status,
          ])
        )}
      />

      {refreshing && (
        <div className="text-xs text-blue-500 animate-pulse">Updating...</div>
      )}

      {/* Per-entity sections */}
      {sections.map((section) => (
        <EntityPanel key={section.entity} section={section} periodLabel={data.period.label} />
      ))}
    </div>
  );
}

function EntityPanel({ section, periodLabel }: { section: EntitySection; periodLabel: string }) {
  const s = section.summary;
  const props = section.properties;
  const isBIG = section.entity === "big";
  const managedProps = props.filter((p) => p.managedOnly);
  const ownedProps = props.filter((p) => !p.managedOnly);

  return (
    <div className="space-y-4">
      {/* Entity Header */}
      <div className="border-l-4 border-[#E07B2A] pl-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{section.label}</h2>
        <p className="text-xs text-gray-500">
          {isBIG ? `${managedProps.length} managed properties` : `${s.propertyCount} ${s.propertyCount === 1 ? "property" : "properties"}`} &middot; {periodLabel}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Revenue" value={fmtM(s.revenue)} color="text-emerald-600" />
        <MetricCard label="NOI" value={fmtM(s.noi)} sub={`${s.noiMargin}% margin`} color={s.noi >= 0 ? "text-emerald-600" : "text-red-600"} />
        <MetricCard
          label="DSCR"
          value={s.dscr > 0 ? `${s.dscr}x` : "—"}
          sub={s.dscr > 0 ? (s.dscr >= 1.25 ? "Healthy" : s.dscr >= 1.0 ? "Tight" : "Below 1.0x") : "No debt data"}
          color={s.dscr >= 1.25 ? "text-emerald-600" : s.dscr >= 1.0 ? "text-amber-600" : s.dscr > 0 ? "text-red-600" : undefined}
        />
        <MetricCard
          label="OER"
          value={`${s.oer}%`}
          color={s.oer <= 50 ? "text-emerald-600" : s.oer <= 65 ? "text-amber-600" : "text-red-600"}
        />
        <MetricCard
          label="Occupancy"
          value={s.totalUnits > 0 ? `${s.occupancyRate}%` : "—"}
          sub={s.totalUnits > 0 ? `${s.occupied}/${s.totalUnits} units` : undefined}
        />
      </div>

      {/* Property Table */}
      {isBIG && managedProps.length > 0 && (
        <PropertyTable title="Managed Properties" subtitle="Properties managed by BIG" rows={managedProps} />
      )}
      {isBIG && ownedProps.length > 0 && (
        <PropertyTable title="BIG Operations" rows={ownedProps} />
      )}
      {!isBIG && props.length > 0 && (
        <PropertyTable rows={props} />
      )}
    </div>
  );
}

function PropertyTable({ title, subtitle, rows }: { title?: string; subtitle?: string; rows: PropertyKPI[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      {title && (
        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      )}
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
              <th className="text-right px-3 py-3 font-bold text-gray-700 dark:text-gray-300">Occupancy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((c) => (
              <tr key={c.slug} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                <td className="px-4 py-3">
                  <Link href={propertyHref(c)} className="text-[#E07B2A] hover:underline font-medium">
                    {c.name}
                  </Link>
                  {c.managedOnly && <span className="text-xs text-blue-400 ml-2">(managed)</span>}
                </td>
                <td className="px-3 py-3 text-center text-xs text-gray-500">{c.assetClassLabel}</td>
                <td className="px-3 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusColor(c.status)}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-mono text-emerald-600">{fmtK(c.revenue)}</td>
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
                <td className="px-3 py-3 text-right font-mono">
                  {c.totalUnits > 0 ? (
                    <span className={c.occupancyRate >= c.targets.occupancy ? "text-emerald-600" : c.occupancyRate >= c.targets.occupancy - 10 ? "text-amber-600" : "text-red-600"}>
                      {c.occupancyRate}%
                      <span className="text-xs text-gray-400 ml-1">({c.occupied}/{c.totalUnits})</span>
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
