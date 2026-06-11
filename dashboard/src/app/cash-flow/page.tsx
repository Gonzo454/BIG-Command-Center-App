"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { ExportButtons } from "@/components/ExportButtons";

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cash Flow Statement</h1>
        <p className="text-sm text-gray-500 mt-1">Operating, investing & financing activities</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {data && (
          <ExportButtons
            fileName={`cash-flow-${period}`}
            title="Cash Flow Statement"
            headers={["Section", "Account", "Number", "Amount"]}
            rows={[
              ...data.operating.items.map((i) => ["Operating", i.name, i.number, i.amount]),
              ...data.investing.items.map((i) => ["Investing", i.name, i.number, i.amount]),
              ...data.financing.items.map((i) => ["Financing", i.name, i.number, i.amount]),
              ["Net Cash Flow", "", "", data.netCashFlow],
            ]}
          />
        )}
        <div className="ml-auto flex gap-2">
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

interface DetailTransaction {
  date: string;
  vendor: string;
  property: string;
  description: string;
  amount: number;
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailTransaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedTotal, setExpandedTotal] = useState(0);

  function toggleDrillDown(accountNum: string, accountAmount: number) {
    if (expanded === accountNum) {
      setExpanded(null);
      setDetail([]);
      return;
    }
    setExpanded(accountNum);
    setExpandedTotal(Math.abs(accountAmount));
    setDetailLoading(true);
    const params = new URLSearchParams({ account: accountNum });
    fetch(`/api/property-pnl/detail?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.transactions || []))
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden border-l-4 ${borderColor}`}>
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
            <tr>
              <th className="text-left px-6 py-2 font-semibold text-gray-600 dark:text-gray-300">Account</th>
              <th className="text-right px-6 py-2 font-semibold text-gray-600 dark:text-gray-300">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((item) => {
              const isOpen = expanded === item.number;
              return (
                <Fragment key={item.number + item.name}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                    onClick={() => toggleDrillDown(item.number, item.amount)}
                  >
                    <td className="px-6 py-2 text-gray-700 dark:text-gray-300">
                      <span className="text-xs text-gray-400 mr-1">{isOpen ? "▼" : "▶"}</span>
                      <span className="text-xs text-gray-400 mr-2">{item.number}</span>
                      {item.name}
                    </td>
                    <td className={`px-6 py-2 text-right font-mono ${item.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmt(item.amount)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={2} className="p-0">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-t border-gray-200 dark:border-gray-600">
                          {detailLoading ? (
                            <p className="text-xs text-gray-500 py-1">Loading...</p>
                          ) : detail.length === 0 ? (
                            <p className="text-xs text-gray-400 py-1">No transactions found</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left py-1 pr-2 font-medium">Date</th>
                                  <th className="text-left py-1 pr-2 font-medium">Vendor / Payee</th>
                                  <th className="text-left py-1 pr-2 font-medium">Property</th>
                                  <th className="text-left py-1 pr-2 font-medium">Description</th>
                                  <th className="text-right py-1 font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {detail.map((t, i) => (
                                  <tr key={i} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                                    <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{t.date || "—"}</td>
                                    <td className="py-1 pr-2 text-gray-900 dark:text-white font-medium">{t.vendor}</td>
                                    <td className="py-1 pr-2 text-gray-600 dark:text-gray-300">{t.property || "—"}</td>
                                    <td className="py-1 pr-2 text-gray-500 truncate max-w-[150px]">{t.description || "—"}</td>
                                    <td className="py-1 text-right font-mono text-gray-900 dark:text-white">{fmt(t.amount)}</td>
                                  </tr>
                                ))}
                                {(() => {
                                  const detailSum = detail.reduce((s, t) => s + t.amount, 0);
                                  const remainder = expandedTotal - detailSum;
                                  if (Math.abs(remainder) < 0.01) return null;
                                  return (
                                    <tr className="bg-gray-100 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-600">
                                      <td className="py-1 pr-2 text-gray-400">—</td>
                                      <td colSpan={3} className="py-1 pr-2 text-gray-500 italic">Payroll, journal entries & other</td>
                                      <td className="py-1 text-right font-mono text-gray-500 italic">{fmt(remainder)}</td>
                                    </tr>
                                  );
                                })()}
                                <tr className="border-t-2 border-gray-300 dark:border-gray-500 font-semibold">
                                  <td className="py-1 pr-2" />
                                  <td colSpan={3} className="py-1 pr-2 text-gray-700 dark:text-gray-200">Total</td>
                                  <td className="py-1 text-right font-mono text-gray-900 dark:text-white">{fmt(expandedTotal)}</td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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
