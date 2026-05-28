"use client";

import { useEffect, useState, useRef } from "react";

interface CashFlowItem {
  name: string;
  number: string;
  amount: number;
}

interface Section {
  items: CashFlowItem[];
  total: number;
  income?: number;
  expenses?: number;
}

interface CashFlowData {
  operating: Section;
  investing: Section;
  financing: Section;
  netCashFlow: number;
  period: string;
}

const fmt = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function CashFlowPage() {
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"mtd" | "ytd">("mtd");
  const initialized = useRef(false);

  function fetchData(p: string) {
    setLoading(true);
    fetch(`/api/cash-flow?period=${p}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetchData(period);
  }, []);

  function togglePeriod(p: "mtd" | "ytd") {
    setPeriod(p);
    fetchData(p);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cash Flow Statement</h1>
          <p className="text-sm text-gray-500 mt-1">Operating, investing & financing activities</p>
        </div>
        <div className="flex gap-2">
          {(["mtd", "ytd"] as const).map((p) => (
            <button
              key={p}
              onClick={() => togglePeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                period === p
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SummaryCard label="Operating" value={data.operating.total} />
            <SummaryCard label="Investing" value={data.investing.total} />
            <SummaryCard label="Financing" value={data.financing.total} />
            <SummaryCard label="Net Cash Flow" value={data.netCashFlow} highlight />
          </div>

          {/* Sections */}
          <CashFlowSection
            title="Operating Activities"
            subtitle={
              data.operating.income && data.operating.expenses
                ? `Income: ${fmtK(data.operating.income)} — Expenses: ${fmtK(data.operating.expenses)}`
                : undefined
            }
            items={data.operating.items}
            total={data.operating.total}
            color="blue"
          />
          <CashFlowSection
            title="Investing Activities"
            items={data.investing.items}
            total={data.investing.total}
            color="purple"
          />
          <CashFlowSection
            title="Financing Activities"
            items={data.financing.items}
            total={data.financing.total}
            color="emerald"
          />
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  const color = highlight
    ? value >= 0
      ? "text-green-600"
      : "text-red-600"
    : value >= 0
    ? "text-green-600"
    : "text-red-600";
  return (
    <div
      className={`rounded-xl p-4 md:p-5 shadow-sm border text-center ${
        highlight
          ? "bg-gray-900 dark:bg-gray-700 border-gray-700"
          : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700"
      }`}
    >
      <p className={`text-xs font-medium uppercase tracking-wide ${highlight ? "text-gray-400" : "text-gray-500"}`}>
        {label}
      </p>
      <p className={`font-bold mt-1 ${highlight ? (value >= 0 ? "text-green-400" : "text-red-400") : color}`} style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>
        {fmtK(value)}
      </p>
    </div>
  );
}

function CashFlowSection({
  title,
  subtitle,
  items,
  total,
  color,
}: {
  title: string;
  subtitle?: string;
  items: CashFlowItem[];
  total: number;
  color: string;
}) {
  const borderColors: Record<string, string> = {
    blue: "border-l-blue-500",
    purple: "border-l-purple-500",
    emerald: "border-l-emerald-500",
  };
  const borderColor = borderColors[color] || "border-l-gray-500";
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden border-l-4 ${borderColor}`}>
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
            <tr>
              <th className="text-left px-6 py-2 font-medium text-gray-500">Account</th>
              <th className="text-right px-6 py-2 font-medium text-gray-500">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((item) => (
              <tr key={item.number + item.name} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                <td className="px-6 py-2 text-gray-700 dark:text-gray-300">
                  <span className="text-xs text-gray-400 mr-2">{item.number}</span>
                  {item.name}
                </td>
                <td className={`px-6 py-2 text-right font-mono ${item.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmt(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-700 font-semibold">
            <tr>
              <td className="px-6 py-3 text-gray-900 dark:text-white">Total</td>
              <td className={`px-6 py-3 text-right font-mono ${total >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmt(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
