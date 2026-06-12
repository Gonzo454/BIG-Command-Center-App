"use client";

import { LoadingState } from "@/components/LoadingState";
import { useEffect, useState, useRef, useCallback } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExportButtons } from "@/components/ExportButtons";
import { fetchJsonRetry, apiJson } from "@/lib/fetchRetry";

interface Account {
  name: string;
  number: string;
  amount: number;
  type: string;
}

interface PnLData {
  communityName: string;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  accounts: Account[];
  period: { from: string; to: string; method: string };
}

type Period = "mtd" | "qtd" | "ytd";

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

function periodDates(p: Period) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  let from: string;
  if (p === "mtd") {
    from = `${year}-${String(month).padStart(2, "0")}-01`;
  } else if (p === "qtd") {
    const q = Math.floor((month - 1) / 3) * 3 + 1;
    from = `${year}-${String(q).padStart(2, "0")}-01`;
  } else {
    from = `${year}-01-01`;
  }
  return { from, to };
}

export default function PvFinancialsPage() {
  const [period, setPeriod] = useState<Period>("mtd");
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [ownershipView, setOwnershipView] = useState(false);
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const cache = useRef<Record<string, PnLData>>({});

  const fetchData = useCallback(() => {
    const { from, to } = customRange ?? periodDates(period);
    const cacheKey = `${from}:${to}:${ownershipView}`;
    if (cache.current[cacheKey]) {
      setData(cache.current[cacheKey]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const view = ownershipView ? "&view=joe" : "";
    fetchJsonRetry<PnLData>(`/api/park-vista/community-pnl?community=portfolio&from=${from}&to=${to}&period=${customRange ? "custom" : period}${view}`)
      .then((d) => {
        cache.current[cacheKey] = d;
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period, customRange, ownershipView]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      fetchData();
      return;
    }
    fetchData();
  }, [fetchData]);

  // Prefetch other periods in background
  useEffect(() => {
    const others: Period[] = (["mtd", "qtd", "ytd"] as Period[]).filter((p) => p !== period);
    others.forEach((p) => {
      const { from, to } = periodDates(p);
      const key = `${from}:${to}:${ownershipView}`;
      if (cache.current[key]) return;
      const view = ownershipView ? "&view=joe" : "";
      apiJson(`/api/park-vista/community-pnl?community=portfolio&from=${from}&to=${to}&period=${p}${view}`)
        .then((d) => {
          if (!d.error) cache.current[key] = d;
        })
        .catch(() => {});
    });
  }, [period, ownershipView]);

  const exportRows = (data?.accounts || []).map((a) => [
    a.type === "income" ? "Income" : "Expense",
    a.name,
    a.number,
    a.amount,
  ]);

  const incomeAccounts = data?.accounts?.filter((a) => a.type === "income") || [];
  const expenseAccounts = data?.accounts?.filter((a) => a.type === "expense") || [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Park Vista Financial Reports
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Portfolio-level P&L
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-[#E07B2A] overflow-hidden">
            <button
              onClick={() => setOwnershipView(false)}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                !ownershipView
                  ? "bg-[#E07B2A] text-white"
                  : "bg-white text-gray-500 hover:bg-[#E07B2A]/10 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              Portfolio
            </button>
            <button
              onClick={() => setOwnershipView(true)}
              className={`px-3 py-1.5 text-xs font-medium transition-all border-l border-gray-200 dark:border-gray-600 ${
                ownershipView
                  ? "bg-[#E07B2A] text-white"
                  : "bg-white text-gray-500 hover:bg-[#E07B2A]/10 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              Joe&apos;s 51%
            </button>
          </div>
        </div>
      </div>
      <div className="h-0.5 w-full bg-[#E07B2A] rounded" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ExportButtons
          fileName="park-vista-financials"
          title="Park Vista Financial Reports"
          headers={["Type", "Account", "Number", "Amount"]}
          rows={exportRows}
        />
        <div className="ml-auto">
          <DateRangePicker
            onRangeChange={(from, to, p) => {
              if (p === "custom") {
                setCustomRange({ from, to });
              } else {
                setCustomRange(null);
                setPeriod(p as Period);
              }
            }}
          />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : data ? (
        <>
          {/* Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">Total Income</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{fmtK(data.totalIncome)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">Total Expenses</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{fmtK(data.totalExpenses)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">Net Income</p>
              <p className={`text-2xl font-bold mt-1 ${data.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {fmtK(data.netIncome)}
              </p>
            </div>
          </div>

          {/* Income Table */}
          {incomeAccounts.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">Income</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold text-gray-700 dark:text-gray-300">
                    <th className="text-left px-4 py-2">Account</th>
                    <th className="text-left px-4 py-2">Number</th>
                    <th className="text-right px-4 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeAccounts.sort((a, b) => b.amount - a.amount).map((a) => (
                    <tr key={a.number} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-2">{a.name}</td>
                      <td className="px-4 py-2 text-gray-400 font-mono text-xs">{a.number}</td>
                      <td className="px-4 py-2 text-right text-emerald-600 font-medium">{fmtK(a.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-700/50 font-bold">
                    <td className="px-4 py-2" colSpan={2}>Total Income</td>
                    <td className="px-4 py-2 text-right text-emerald-600">{fmtK(data.totalIncome)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Expense Table */}
          {expenseAccounts.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">Expenses</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold text-gray-700 dark:text-gray-300">
                    <th className="text-left px-4 py-2">Account</th>
                    <th className="text-left px-4 py-2">Number</th>
                    <th className="text-right px-4 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseAccounts.sort((a, b) => b.amount - a.amount).map((a) => (
                    <tr key={a.number} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-2">{a.name}</td>
                      <td className="px-4 py-2 text-gray-400 font-mono text-xs">{a.number}</td>
                      <td className="px-4 py-2 text-right text-red-600 font-medium">{fmtK(a.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-700/50 font-bold">
                    <td className="px-4 py-2" colSpan={2}>Total Expenses</td>
                    <td className="px-4 py-2 text-right text-red-600">{fmtK(data.totalExpenses)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Net Income footer */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 dark:text-white">Net Income</span>
              <span className={`text-xl font-bold ${data.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {fmtK(data.netIncome)}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
