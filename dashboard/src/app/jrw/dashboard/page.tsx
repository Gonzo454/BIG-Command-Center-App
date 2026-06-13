"use client";

import { apiFetch } from "@/lib/fetchRetry";
import { LoadingState } from "@/components/LoadingState";
import { useEffect, useState, useRef } from "react";
import { ProfitGauge } from "@/components/ProfitGauge";
import { DateRangePicker } from "@/components/DateRangePicker";
import { resolvePersistedRange } from "@/lib/date-range";
import { ExportButtons } from "@/components/ExportButtons";

interface Property {
  name: string;
  netAmount: number;
  ownershipPct?: number;
}

interface PnlData {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
}

interface RentSummary {
  totalUnits: number;
  occupied: number;
  vacant: number;
}

interface DashboardCache {
  properties: Property[];
  pnl: PnlData;
  rent: RentSummary | null;
}

export default function ExecutiveDashboard() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [rent, setRent] = useState<RentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [ownershipView, setOwnershipView] = useState(false);
  const initialized = useRef(false);
  const dataCache = useRef<Map<string, DashboardCache>>(new Map());

  async function loadDashboard(qs: string): Promise<DashboardCache> {
    const [propRes, pnlRes, rentRes] = await Promise.all([
      apiFetch(`/api/account-totals${qs}`),
      apiFetch(`/api/income-statement${qs}`),
      apiFetch("/api/rent-roll"),
    ]);
    if (!propRes.ok || !pnlRes.ok || !rentRes.ok) {
      throw new Error("Dashboard data request failed");
    }
    const propData = await propRes.json();
    const pnlData = await pnlRes.json();
    const rentData = await rentRes.json();
    if (
      typeof pnlData?.totalIncome !== "number" ||
      typeof pnlData?.totalExpenses !== "number" ||
      typeof pnlData?.netIncome !== "number"
    ) {
      throw new Error("Dashboard data incomplete");
    }
    return {
      properties: propData.properties || [],
      pnl: pnlData,
      rent: rentData.summary || null,
    };
  }

  async function fetchData(from?: string, to?: string, period?: string) {
    const key = `${from || "default"}:${to || "default"}:${period || "mtd"}`;
    const cached = dataCache.current.get(key);
    if (cached) {
      setProperties(cached.properties);
      setPnl(cached.pnl);
      setRent(cached.rent);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (period) params.set("period", period);
    const qs = params.toString() ? `?${params.toString()}` : "";
    // Keep the spinner up and retry until valid data arrives — never render NaN
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await loadDashboard(qs);
        dataCache.current.set(key, data);
        setProperties(data.properties);
        setPnl(data.pnl);
        setRent(data.rent);
        setLoading(false);
        break;
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
        if (cached || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    setRefreshing(false);
    setLoading(false);
  }

  async function prefetchData(from: string, to: string, period: string) {
    const key = `${from}:${to}:${period}`;
    if (dataCache.current.has(key)) return;
    try {
      const params = new URLSearchParams({ from, to, period });
      const qs = `?${params.toString()}`;
      dataCache.current.set(key, await loadDashboard(qs));
    } catch {}
  }

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const persisted = resolvePersistedRange();
      if (persisted && persisted.period !== "mtd") {
        setDateRange({ from: persisted.from, to: persisted.to });
        fetchData(persisted.from, persisted.to, persisted.period);
      } else {
        fetchData();
      }
      const d = new Date();
      const todayStr = d.toISOString().split("T")[0];
      const q = Math.floor(d.getMonth() / 3) * 3;
      const qtdFrom = `${d.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
      const ytdFrom = `${d.getFullYear()}-01-01`;
      setTimeout(() => {
        prefetchData(qtdFrom, todayStr, "qtd");
        prefetchData(ytdFrom, todayStr, "ytd");
      }, 1500);
    }
  }, []);

  function handleRangeChange(from: string, to: string, period: string) {
    setDateRange({ from, to });
    fetchData(from, to, period);
  }

  // Compute ownership-weighted values client-side
  const portfolioNet = properties.reduce((sum, p) => sum + p.netAmount, 0);
  const joeNet = properties.reduce(
    (sum, p) => sum + Math.round(p.netAmount * (p.ownershipPct ?? 1)),
    0
  );
  const ownershipRatio =
    ownershipView && portfolioNet !== 0 ? joeNet / portfolioNet : 1;

  const displayProperties = ownershipView
    ? properties.map((p) => ({
        ...p,
        netAmount: Math.round(p.netAmount * (p.ownershipPct ?? 1)),
      }))
    : properties;

  const displayPnl = pnl
    ? {
        totalIncome: Math.round(pnl.totalIncome * ownershipRatio),
        totalExpenses: Math.round(pnl.totalExpenses * ownershipRatio),
        netIncome: Math.round(pnl.netIncome * ownershipRatio),
      }
    : null;

  const maxAbsolute = Math.max(
    ...displayProperties.map((p) => Math.abs(p.netAmount)),
    1
  );

  const occupancyRate = rent ? Math.round((rent.occupied / rent.totalUnits) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            JRW Real Estate Holdings
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Property Performance
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-[#E07B2A] overflow-hidden">
          <button
            onClick={() => setOwnershipView(false)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-all ${
              !ownershipView
                ? "bg-[#E07B2A] text-white"
                : "bg-white text-gray-500 hover:bg-[#E07B2A]/10 hover:text-[#E07B2A] dark:bg-gray-700 dark:text-gray-400"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
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
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
            Joe&apos;s Share
          </button>
        </div>
      </div>
      <div className="h-0.5 w-full bg-[#E07B2A] rounded" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {displayPnl && (
          <ExportButtons
            fileName="Executive_Dashboard"
            title="Executive Dashboard Summary"
            headers={["Property", "Net Income"]}
            rows={[
              ["TOTAL INCOME", `$${(displayPnl.totalIncome || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
              ["TOTAL EXPENSES", `$${(displayPnl.totalExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
              ["NET INCOME", `$${(displayPnl.netIncome || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
              ["OCCUPANCY", `${occupancyRate}% (${rent?.occupied || 0}/${rent?.totalUnits || 0} units)`],
              ["", ""],
              ...displayProperties.sort((a, b) => b.netAmount - a.netAmount).map((p) => [
                p.name,
                `$${p.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              ]),
            ]}
          />
        )}
        <div className="ml-auto">
          <DateRangePicker onRangeChange={handleRangeChange} />
        </div>
      </div>

      {refreshing && (
        <div className="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
          <div className="h-full bg-teal-500 animate-pulse w-full" />
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className={refreshing ? "opacity-75 transition-opacity" : ""}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total Income"
              value={displayPnl?.totalIncome ?? 0}
              color={(displayPnl?.totalIncome ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
            />
            <KpiCard
              label="Total Expenses"
              value={displayPnl?.totalExpenses ?? 0}
              color="text-red-600"
            />
            <KpiCard
              label="Net Income"
              value={displayPnl?.netIncome ?? 0}
              color={
                (displayPnl?.netIncome ?? 0) >= 0 ? "text-green-600" : "text-red-600"
              }
            />
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Occupancy
              </p>
              <p className="font-bold text-blue-600 mt-1" style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>
                {occupancyRate}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {rent?.occupied || 0} / {rent?.totalUnits || 0} units
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Property Profitability
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {displayProperties
                .sort((a, b) => b.netAmount - a.netAmount)
                .map((p) => (
                  <ProfitGauge
                    key={p.name}
                    name={p.name}
                    netIncome={p.netAmount}
                    maxAbsolute={maxAbsolute}
                    href={p.name === "Badger Hotel Group" ? "/hotel/dashboard" : `/properties/${encodeURIComponent(p.name)}`}
                  />
                ))}
            </div>
          </div>

          {dateRange.from && (
            <p className="text-xs text-gray-400 text-right">
              Period: {dateRange.from} → {dateRange.to}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const formatted =
    (value < 0 ? "-" : "") +
    "$" +
    Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`font-bold mt-1 ${color}`} style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>
        {formatted}
      </p>
    </div>
  );
}
