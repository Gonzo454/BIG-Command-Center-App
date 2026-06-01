"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ProfitGauge } from "@/components/ProfitGauge";
import { ExportButtons } from "@/components/ExportButtons";

interface Account {
  name: string;
  number: string;
  amount: number;
  type: string;
}

interface Transaction {
  date: string;
  vendor: string;
  property: string;
  description: string;
  amount: number;
}

interface PropertyPnl {
  propertyName: string;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  accounts: Account[];
}

const fmt = (n: number) =>
  "$" +
  Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function PropertyDetailPage() {
  const params = useParams();
  const rawSlug = params.slug as string;
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const [data, setData] = useState<PropertyPnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [ownershipView, setOwnershipView] = useState(false);

  async function fetchData(from?: string, to?: string, period?: string) {
    setLoading(true);
    setError(null);
    setDateFrom(from);
    setDateTo(to);
    try {
      const qp = new URLSearchParams();
      qp.set("property", slug);
      if (from) qp.set("from", from);
      if (to) qp.set("to", to);
      if (period) qp.set("period", period);
      if (ownershipView) qp.set("view", "joe");

      const res = await fetch(`/api/property-pnl?${qp.toString()}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
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

  useEffect(() => {
    if (initialized.current) {
      fetchData(dateFrom, dateTo);
    }
  }, [ownershipView]);

  function handleRangeChange(from: string, to: string, period: string) {
    fetchData(from, to, period);
  }

  const incomeAccounts = data?.accounts.filter((a) => a.type === "income") || [];
  const expenseAccounts = data?.accounts.filter((a) => a.type === "expense") || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/properties"
              className="text-sm text-blue-600 hover:underline"
            >
              ← Properties
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {slug}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Property Income Statement
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        {data && data.accounts.length > 0 && (
          <ExportButtons
            fileName={`Property_PnL_${slug.replace(/[^a-zA-Z0-9]/g, "_")}`}
            title={`${slug} — Income Statement`}
            headers={["Account #", "Account Name", "Type", "Amount"]}
            rows={[
              ...data.accounts
                .filter((a) => a.type === "income")
                .sort((a, b) => b.amount - a.amount)
                .map((a) => [a.number, a.name, "Income", fmt(a.amount)]),
              ["" , "Total Income", "", fmt(data.totalIncome)],
              ...data.accounts
                .filter((a) => a.type === "expense")
                .sort((a, b) => b.amount - a.amount)
                .map((a) => [a.number, a.name, "Expense", fmt(a.amount)]),
              ["", "Total Expenses", "", fmt(data.totalExpenses)],
              ["", "Net Income", "", fmt(data.netIncome)],
            ]}
          />
        )}
        <div className="ml-auto">
          <DateRangePicker onRangeChange={handleRangeChange} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : error ? (
        <div className="text-center py-20 text-red-500">{error}</div>
      ) : data ? (
        <>
          {/* KPI + Gauge */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total Income"
              value={data.totalIncome}
              color="text-green-600"
            />
            <KpiCard
              label="Total Expenses"
              value={data.totalExpenses}
              color="text-red-600"
            />
            <KpiCard
              label="Net Income"
              value={data.netIncome}
              color={data.netIncome >= 0 ? "text-green-600" : "text-red-600"}
            />
            <div className="flex items-center justify-center">
              <ProfitGauge
                name="Profitability"
                netIncome={data.netIncome}
                maxAbsolute={Math.max(data.totalIncome, data.totalExpenses, 1)}
              />
            </div>
          </div>

          {/* Income / Expense Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PropertyAccountPanel
              title="Income"
              accounts={incomeAccounts}
              total={data.totalIncome}
              isExpense={false}
              propertyName={slug}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
            <PropertyAccountPanel
              title="Expenses"
              accounts={expenseAccounts}
              total={data.totalExpenses}
              isExpense
              propertyName={slug}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function PropertyAccountPanel({
  title,
  accounts,
  total,
  isExpense,
  propertyName,
  dateFrom,
  dateTo,
}: {
  title: string;
  accounts: Account[];
  total: number;
  isExpense: boolean;
  propertyName: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Transaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedAccountTotal, setExpandedAccountTotal] = useState(0);

  function toggleDrillDown(accountNum: string, accountAmount: number) {
    if (expanded === accountNum) {
      setExpanded(null);
      setDetail([]);
      return;
    }
    setExpanded(accountNum);
    setExpandedAccountTotal(Math.abs(accountAmount));
    setDetailLoading(true);
    const params = new URLSearchParams({ account: accountNum, property: propertyName });
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    fetch(`/api/property-pnl/detail?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.transactions || []))
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  const sorted = accounts.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const colorClass = isExpense ? "text-red-600" : "text-green-600";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className={`text-sm font-mono ${colorClass}`}>
          ${Math.abs(total).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">
                Account
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map((a) => {
              const isOpen = expanded === a.number;
              return (
                <Fragment key={a.number + a.name}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                    onClick={() => toggleDrillDown(a.number, a.amount)}
                  >
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      <span className="text-xs text-gray-400 mr-1">
                        {isOpen ? "▼" : "▶"}
                      </span>
                      <span className="text-xs text-gray-400 mr-1">{a.number}</span>
                      {a.name}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${colorClass}`}>
                      {fmt(a.amount)}
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
                                  <th className="text-left py-1 pr-2 font-medium">Description</th>
                                  <th className="text-right py-1 font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {detail.map((t, i) => (
                                  <tr key={i} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                                    <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{t.date || "—"}</td>
                                    <td className="py-1 pr-2 text-gray-900 dark:text-white font-medium">{t.vendor}</td>
                                    <td className="py-1 pr-2 text-gray-500 truncate max-w-[200px]">{t.description || "—"}</td>
                                    <td className="py-1 text-right font-mono text-gray-900 dark:text-white">{fmt(t.amount)}</td>
                                  </tr>
                                ))}
                                {(() => {
                                  const detailSum = detail.reduce((s, t) => s + t.amount, 0);
                                  const remainder = expandedAccountTotal - detailSum;
                                  if (Math.abs(remainder) < 0.01) return null;
                                  return (
                                    <tr className="bg-gray-100 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-600">
                                      <td className="py-1 pr-2 text-gray-400">—</td>
                                      <td colSpan={2} className="py-1 pr-2 text-gray-500 italic">
                                        Payroll, journal entries & other
                                      </td>
                                      <td className="py-1 text-right font-mono text-gray-500 italic">{fmt(remainder)}</td>
                                    </tr>
                                  );
                                })()}
                                <tr className="border-t-2 border-gray-300 dark:border-gray-500 font-semibold">
                                  <td className="py-1 pr-2" />
                                  <td colSpan={2} className="py-1 pr-2 text-gray-700 dark:text-gray-200">Total</td>
                                  <td className="py-1 text-right font-mono text-gray-900 dark:text-white">{fmt(expandedAccountTotal)}</td>
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
            {sorted.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-center text-gray-400">
                  No {isExpense ? "expense" : "income"} accounts
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`font-bold mt-1 ${color}`} style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>
        ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}
