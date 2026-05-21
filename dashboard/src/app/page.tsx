"use client";

import { useEffect, useState, useRef } from "react";
import { ProfitGauge } from "@/components/ProfitGauge";
import { DateRangePicker } from "@/components/DateRangePicker";

interface Property {
  name: string;
  netAmount: number;
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

export default function ExecutiveDashboard() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [rent, setRent] = useState<RentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const initialized = useRef(false);

  async function fetchData(from?: string, to?: string, period?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (period) params.set("period", period);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const [propRes, pnlRes, rentRes] = await Promise.all([
        fetch("/api/account-totals"),
        fetch(`/api/income-statement${qs}`),
        fetch("/api/rent-roll"),
      ]);

      const propData = await propRes.json();
      const pnlData = await pnlRes.json();
      const rentData = await rentRes.json();

      setProperties(propData.properties || []);
      setPnl(pnlData);
      setRent(rentData.summary || null);
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      fetchData();
    }
  }, []);

  function handleRangeChange(from: string, to: string, period: string) {
    setDateRange({ from, to });
    fetchData(from, to, period);
  }

  const maxAbsolute = Math.max(
    ...properties.map((p) => Math.abs(p.netAmount)),
    1
  );

  const occupancyRate = rent ? Math.round((rent.occupied / rent.totalUnits) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Executive Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Portfolio performance overview
          </p>
        </div>
        <DateRangePicker onRangeChange={handleRangeChange} />
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total Income"
              value={pnl?.totalIncome || 0}
              color="text-green-600"
            />
            <KpiCard
              label="Total Expenses"
              value={pnl?.totalExpenses || 0}
              color="text-red-600"
            />
            <KpiCard
              label="Net Income"
              value={pnl?.netIncome || 0}
              color={
                (pnl?.netIncome || 0) >= 0 ? "text-green-600" : "text-red-600"
              }
            />
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Occupancy
              </p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {occupancyRate}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {rent?.occupied || 0} / {rent?.totalUnits || 0} units
              </p>
            </div>
          </div>

          {/* Property Profitability Gauges */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Property Profitability
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {properties
                .sort((a, b) => b.netAmount - a.netAmount)
                .map((p) => (
                  <ProfitGauge
                    key={p.name}
                    name={p.name}
                    netIncome={p.netAmount}
                    maxAbsolute={maxAbsolute}
                  />
                ))}
            </div>
          </div>

          {/* Date range info */}
          {dateRange.from && (
            <p className="text-xs text-gray-400 text-right">
              Period: {dateRange.from} → {dateRange.to}
            </p>
          )}
        </>
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
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>
        ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}
