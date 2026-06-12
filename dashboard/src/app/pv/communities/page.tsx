"use client";

import { LoadingState } from "@/components/LoadingState";
import { apiJson } from "@/lib/fetchRetry";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
  ownershipView?: boolean;
}

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function PvCommunitiesPage() {
  const [data, setData] = useState<PvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownershipView, setOwnershipView] = useState(false);
  const [range, setRange] = useState({
    from: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`,
    to: new Date().toISOString().split("T")[0],
    period: "mtd",
  });

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

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Park Vista Communities
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.portfolio.communityCount} communities · {data.portfolio.totalUnits} total units
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-[#E07B2A] overflow-hidden">
          <button
            onClick={() => setOwnershipView(false)}
            className={`px-3 py-1.5 text-xs font-medium transition-all ${
              !ownershipView
                ? "bg-[#E07B2A] text-white"
                : "bg-white text-gray-500 hover:bg-[#E07B2A]/10 hover:text-[#E07B2A] dark:bg-gray-700 dark:text-gray-400"
            }`}
          >
            Portfolio View
          </button>
          <button
            onClick={() => setOwnershipView(true)}
            className={`px-3 py-1.5 text-xs font-medium transition-all border-l border-gray-200 dark:border-gray-600 ${
              ownershipView
                ? "bg-[#E07B2A] text-white"
                : "bg-white text-gray-500 hover:bg-[#E07B2A]/10 hover:text-[#E07B2A] dark:bg-gray-700 dark:text-gray-400"
            }`}
          >
            Joe&apos;s Share (51%)
          </button>
        </div>
      </div>
      <div className="h-0.5 w-full bg-[#E07B2A] rounded" />
      <div className="flex flex-wrap items-center justify-between gap-3">
      <ExportButtons
        fileName={`park-vista-communities-${range.from}-to-${range.to}`}
        title="Park Vista Communities"
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

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <p className="text-xs font-medium text-gray-500 uppercase">Total Income</p>
          <p className="text-lg font-bold text-emerald-600 mt-1">{fmtK(data.portfolio.totalIncome)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <p className="text-xs font-medium text-gray-500 uppercase">Total Expenses</p>
          <p className="text-lg font-bold text-red-600 mt-1">{fmtK(data.portfolio.totalExpenses)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <p className="text-xs font-medium text-gray-500 uppercase">Net Income</p>
          <p className={`text-lg font-bold mt-1 ${data.portfolio.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {fmtK(data.portfolio.netIncome)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <p className="text-xs font-medium text-gray-500 uppercase">Occupancy</p>
          <p className="text-lg font-bold text-blue-600 mt-1">{data.portfolio.occupancyRate}%</p>
          <p className="text-xs text-gray-500">{data.portfolio.occupied} / {data.portfolio.totalUnits} units</p>
        </div>
      </div>

      {/* Communities Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold text-gray-700 dark:text-gray-300">
                <th className="text-left px-4 py-3">Community</th>
                <th className="text-left px-4 py-3">Location</th>
                <th className="text-left px-4 py-3">Care Types</th>
                <th className="text-right px-4 py-3">Income</th>
                <th className="text-right px-4 py-3">Expenses</th>
                <th className="text-right px-4 py-3">Net Income</th>
                <th className="text-right px-4 py-3">Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {data.communities
                .sort((a, b) => b.netIncome - a.netIncome)
                .map((c) => (
                  <tr
                    key={c.slug}
                    className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/pv/communities/${c.slug}`}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.location}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.careTypes.map((ct) => (
                          <span
                            key={ct}
                            className="text-[10px] bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded"
                          >
                            {ct}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                      {fmtK(c.totalIncome)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">
                      {fmtK(c.totalExpenses)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${c.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmtK(c.netIncome)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${c.occupancyRate >= 90 ? "text-emerald-600" : c.occupancyRate >= 80 ? "text-amber-600" : "text-red-600"}`}>
                        {c.occupancyRate}%
                      </span>
                      <span className="text-gray-400 text-xs ml-1">
                        ({c.occupied}/{c.totalUnits})
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
