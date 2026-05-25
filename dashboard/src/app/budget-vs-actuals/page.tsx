"use client";

import { useEffect, useState, useRef } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";

interface Account {
  name: string;
  number: string;
  actual: number;
  budget: number;
  variance?: number;
  percentVariance?: number;
  ytd?: number;
  lastYearYtd?: number;
  yoyVariance?: number;
  type: string;
}

interface YoYSummary {
  totalIncome: number;
  lastYearIncome: number;
  incomeChange: number;
  totalExpenses: number;
  lastYearExpenses: number;
  expenseChange: number;
}

interface BudgetData {
  hasBudget: boolean;
  accounts: Account[];
  yoySummary?: YoYSummary;
}

const fmt = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtPct = (n: number) =>
  (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

export default function BudgetVsActualsPage() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  function fetchData(from?: string, to?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString() ? `?${params.toString()}` : "";
    fetch(`/api/budget${qs}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetchData();
  }, []);

  const incomeAccounts = data?.accounts.filter((a) => a.type === "income") || [];
  const expenseAccounts = data?.accounts.filter((a) => a.type === "expense") || [];
  const yoy = data?.yoySummary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {data?.hasBudget ? "Budget vs Actuals" : "Year-over-Year Comparison"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {data?.hasBudget ? "Variance analysis by account" : "Current YTD vs prior year performance"}
          </p>
        </div>
        <DateRangePicker onRangeChange={(from, to) => fetchData(from, to)} />
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : data?.hasBudget ? (
        <>
          <BudgetTable title="Income" accounts={incomeAccounts} />
          <BudgetTable title="Expenses" accounts={expenseAccounts} />
        </>
      ) : (
        <>
          {/* YoY Summary */}
          {yoy && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <YoYCard
                label="Total Income"
                current={yoy.totalIncome}
                lastYear={yoy.lastYearIncome}
                change={yoy.incomeChange}
              />
              <YoYCard
                label="Total Expenses"
                current={yoy.totalExpenses}
                lastYear={yoy.lastYearExpenses}
                change={yoy.expenseChange}
                invertColor
              />
            </div>
          )}

          {/* YoY Account Tables */}
          <YoYTable title="Income Accounts" accounts={incomeAccounts} />
          <YoYTable title="Expense Accounts" accounts={expenseAccounts} invertColor />
        </>
      )}
    </div>
  );
}

function BudgetTable({ title, accounts }: { title: string; accounts: Account[] }) {
  const sorted = [...accounts].sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual));
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-500">Account</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">Actual</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">Budget</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">Variance</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map((a) => (
              <tr key={a.number}>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                  <span className="text-xs text-gray-400 mr-2">{a.number}</span>{a.name}
                </td>
                <td className="px-4 py-2 text-right font-mono">{fmt(a.actual)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-500">{fmt(a.budget)}</td>
                <td className={`px-4 py-2 text-right font-mono ${(a.variance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmt(a.variance || 0)}
                </td>
                <td className={`px-4 py-2 text-right font-mono ${(a.percentVariance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmtPct(a.percentVariance || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function YoYCard({
  label,
  current,
  lastYear,
  change,
  invertColor,
}: {
  label: string;
  current: number;
  lastYear: number;
  change: number;
  invertColor?: boolean;
}) {
  const isPositive = invertColor ? change <= 0 : change >= 0;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <div className="flex items-end justify-between mt-2">
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtK(current)}</p>
          <p className="text-xs text-gray-500 mt-1">Last year: {fmtK(lastYear)}</p>
        </div>
        <span
          className={`text-lg font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}
        >
          {fmtPct(change)}
        </span>
      </div>
    </div>
  );
}

function YoYTable({ title, accounts, invertColor }: { title: string; accounts: Account[]; invertColor?: boolean }) {
  const sorted = [...accounts]
    .filter((a) => (a.ytd || 0) !== 0 || (a.lastYearYtd || 0) !== 0)
    .sort((a, b) => Math.abs(b.ytd || 0) - Math.abs(a.ytd || 0));

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-500">Account</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">This Month</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">YTD</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">Last Year YTD</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">YoY Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map((a) => (
              <tr key={a.number} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                  <span className="text-xs text-gray-400 mr-2">{a.number}</span>{a.name}
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">
                  {fmt(a.actual)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">
                  {fmt(a.ytd || 0)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-500">
                  {fmt(a.lastYearYtd || 0)}
                </td>
                <td className={`px-4 py-2 text-right font-mono font-semibold ${
                  (invertColor ? (a.yoyVariance || 0) <= 0 : (a.yoyVariance || 0) >= 0) ? "text-green-600" : "text-red-600"
                }`}>
                  {a.lastYearYtd ? fmtPct(a.yoyVariance || 0) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
