"use client";

import { apiJson } from "@/lib/fetchRetry";
import { LoadingState } from "@/components/LoadingState";
import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExportButtons } from "@/components/ExportButtons";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";

interface Account {
  name: string;
  number: string;
  amount: number;
  mtd: number;
  ytd: number;
  lastYearAmount: number;
}

interface Transaction {
  date: string;
  vendor: string;
  property: string;
  description: string;
  amount: number;
}

interface CapitalAccount {
  name: string;
  number: string;
  amount: number;
}

interface Summary {
  totalRevenue: number;
  totalRevenueLY: number;
  revenueChange: number;
  totalExpenses: number;
  totalExpensesLY: number;
  expenseChange: number;
  netIncome: number;
  netIncomeLY: number;
  netIncomeChange: number;
  totalCapital?: number;
}

interface PnlData {
  summary: Summary;
  revenueAccounts: Account[];
  expenseAccounts: Account[];
  capitalAccounts: CapitalAccount[];
}

const fmt = (n: number) =>
  "$" +
  Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function BigPnlPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueAccounts, setRevenueAccounts] = useState<Account[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [capitalAccounts, setCapitalAccounts] = useState<CapitalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const initialized = useRef(false);
  const dataCache = useRef<Map<string, PnlData>>(new Map());

  const load = useCallback(
    (fromDate?: string, toDate?: string, period?: string, cacheKey?: string) => {
      const key = cacheKey || `${fromDate || "default"}:${toDate || "default"}:${period || "ytd"}`;

      // If we have cached data, show it instantly and refresh in background
      const cached = dataCache.current.get(key);
      if (cached) {
        setSummary(cached.summary);
        setRevenueAccounts(cached.revenueAccounts);
        setExpenseAccounts(cached.expenseAccounts);
        setCapitalAccounts(cached.capitalAccounts);
        setLoading(false);
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (period) params.set("period", period);
      const qs = params.toString() ? `?${params.toString()}` : "";
      apiJson(`/api/big-management${qs}`)
        .then((d) => {
          const data: PnlData = {
            summary: d.summary || null,
            revenueAccounts: d.revenueAccounts || [],
            expenseAccounts: d.expenseAccounts || [],
            capitalAccounts: d.capitalAccounts || [],
          };
          dataCache.current.set(key, data);
          setSummary(data.summary);
          setRevenueAccounts(data.revenueAccounts);
          setExpenseAccounts(data.expenseAccounts);
          setCapitalAccounts(data.capitalAccounts);
        })
        .catch(console.error)
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    []
  );

  // Background prefetch for other periods
  const prefetch = useCallback((fromDate: string, toDate: string, period: string) => {
    const key = `${fromDate}:${toDate}:${period}`;
    if (dataCache.current.has(key)) return;
    const params = new URLSearchParams({ from: fromDate, to: toDate, period });
    apiJson(`/api/big-management?${params.toString()}`)
      .then((d) => {
        dataCache.current.set(key, {
          summary: d.summary || null,
          revenueAccounts: d.revenueAccounts || [],
          expenseAccounts: d.expenseAccounts || [],
          capitalAccounts: d.capitalAccounts || [],
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    load(undefined, undefined, "ytd", "default:default:ytd");

    // Prefetch MTD and QTD in background after initial load
    const d = new Date();
    const todayStr = d.toISOString().split("T")[0];
    const mtdFrom = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const q = Math.floor(d.getMonth() / 3) * 3;
    const qtdFrom = `${d.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;

    setTimeout(() => {
      prefetch(mtdFrom, todayStr, "mtd");
      prefetch(qtdFrom, todayStr, "qtd");
    }, 1000);
  }, [load, prefetch]);

  function handleRangeChange(fromDate: string, toDate: string, period: string) {
    setFrom(fromDate);
    setTo(toDate);
    load(fromDate, toDate, period);
  }

  const totalRevenue = summary?.totalRevenue || 0;
  const totalExpenses = Math.abs(summary?.totalExpenses || 0);
  const netIncome = summary?.netIncome || 0;

  const allRows = [
    ...revenueAccounts.map((a) => ({ ...a, section: "Revenue" })),
    ...expenseAccounts.map((a) => ({
      ...a,
      section: "Expense",
      ytd: a.ytd,
      mtd: a.mtd,
      lastYearAmount: Math.abs(a.lastYearAmount),
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          BIG Management — P&L Statement
        </h1>
      </div>

      {/* Refresh indicator bar */}
      {refreshing && (
        <div className="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
          <div className="h-full bg-teal-500 animate-pulse w-full" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {allRows.length > 0 && (
          <ExportButtons
            fileName="BIG_Management_PnL"
            title="BIG Management P&L Statement"
            headers={["Section", "Account", "Number", "MTD", "YTD", "Last Year YTD"]}
            rows={allRows.map((a) => [
              a.section,
              a.name,
              a.number,
              a.mtd < 0 ? `(${fmt(Math.abs(a.mtd))})` : fmt(a.mtd),
              a.ytd < 0 ? `(${fmt(Math.abs(a.ytd))})` : fmt(a.ytd),
              fmt(a.lastYearAmount),
            ])}
          />
        )}
        <div className="ml-auto">
          <DateRangePicker onRangeChange={handleRangeChange} />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : !summary ? (
        <div className="text-center py-20 text-gray-500">No data available</div>
      ) : (
        <div className={refreshing ? "opacity-75 transition-opacity" : ""}>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Total Revenue" value={fmtK(totalRevenue)} color="text-green-600" href="#section-income" />
            <KpiCard label="Total Expenses" value={fmtK(totalExpenses)} color="text-red-600" href="#section-expenses" />
            <KpiCard
              label="Net Income"
              value={fmtK(netIncome)}
              color={netIncome >= 0 ? "text-green-600" : "text-red-600"}
            />
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <AccountPanel
              title="Income"
              accounts={revenueAccounts}
              total={totalRevenue}
              isExpense={false}
              from={from}
              to={to}
            />
            <AccountPanel
              title="Expenses"
              accounts={expenseAccounts}
              total={totalExpenses}
              isExpense
              from={from}
              to={to}
            />
          </div>

          {/* Capital Activity */}
          {capitalAccounts.length > 0 && (
            <div className="mt-6">
              <CapitalPanel accounts={capitalAccounts} total={summary.totalCapital || 0} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AccountPanel({
  title,
  accounts,
  total,
  isExpense,
  from,
  to,
}: {
  title: string;
  accounts: Account[];
  total: number;
  isExpense: boolean;
  from?: string;
  to?: string;
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
    const params = new URLSearchParams({ account: accountNum });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    apiJson(`/api/big-management/detail?${params.toString()}`)
      .then((d) => {
        setDetail(d.transactions || []);
        if (d.total !== undefined) setExpandedAccountTotal(Math.abs(d.total));
      })
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  const sorted = accounts
    .slice()
    .sort((a, b) => Math.abs(b.ytd) - Math.abs(a.ytd));

  return (
    <CollapsiblePanel
      title={title}
      id={`section-${title.toLowerCase()}`}
      headerRight={
        <p className={`text-sm font-mono font-semibold ${isExpense ? "text-red-600" : "text-green-600"}`}>
          ${Math.abs(total).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
      }
    >
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Account</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map((a) => {
              const isOpen = expanded === a.number;
              // For expenses: positive = cost (red), negative = credit/billback (green)
              const displayAmount = Math.abs(a.ytd);
              const isCredit = isExpense && a.ytd < 0;
              const rowColor = isCredit ? "text-green-600" : (isExpense ? "text-red-600" : "text-green-600");
              return (
                <Fragment key={a.number}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                    onClick={() => toggleDrillDown(a.number, a.ytd)}
                  >
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      <span className="text-xs text-gray-400 mr-1">
                        {isOpen ? "▼" : "▶"}
                      </span>
                      <span className="text-xs text-gray-400 mr-1">{a.number}</span>
                      {a.name}
                      {isCredit && <span className="ml-1 text-xs text-green-600 font-medium">(credit)</span>}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${rowColor}`}>
                      {isCredit ? `(${fmt(displayAmount)})` : fmt(displayAmount)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={2} className="p-0">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-t border-gray-200 dark:border-gray-600">
                          {detailLoading ? (
                            <p className="text-xs text-gray-500 py-1">Lots of cash loading here, please be patient.</p>
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
                                  const remainder = expandedAccountTotal - detailSum;
                                  if (Math.abs(remainder) < 0.01) return null;
                                  return (
                                    <tr className="bg-gray-100 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-600">
                                      <td className="py-1 pr-2 text-gray-400">—</td>
                                      <td colSpan={3} className="py-1 pr-2 text-gray-500 italic">
                                        Payroll, journal entries & other
                                      </td>
                                      <td className="py-1 text-right font-mono text-gray-500 italic">{fmt(remainder)}</td>
                                    </tr>
                                  );
                                })()}
                                <tr className="border-t-2 border-gray-300 dark:border-gray-500 font-semibold">
                                  <td className="py-1 pr-2" />
                                  <td colSpan={3} className="py-1 pr-2 text-gray-700 dark:text-gray-200">Total</td>
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
    </CollapsiblePanel>
  );
}

function CapitalPanel({ accounts, total }: { accounts: CapitalAccount[]; total: number }) {
  const sorted = accounts.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return (
    <CollapsiblePanel
      title="Capital Activity"
      normalMaxHeight={300}
      headerRight={
        <p className={`text-sm font-mono ${total >= 0 ? "text-blue-600" : "text-orange-600"}`}>
          {total >= 0 ? "" : "-"}${Math.abs(total).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          <span className="text-xs text-gray-500 ml-2">
            {total >= 0 ? "net contributions" : "net distributions"}
          </span>
        </p>
      }
    >
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Account</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map((a) => {
              const isContribution = a.amount > 0;
              return (
                <tr key={a.number} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                    <span className="text-xs text-gray-400 mr-1">{a.number}</span>
                    {a.name}
                    <span className={`ml-1 text-xs font-medium ${isContribution ? "text-blue-600" : "text-orange-600"}`}>
                      ({isContribution ? "contribution" : "distribution"})
                    </span>
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${isContribution ? "text-blue-600" : "text-orange-600"}`}>
                    {isContribution ? "" : "-"}${Math.abs(a.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
    </CollapsiblePanel>
  );
}

function KpiCard({ label, value, color, href }: { label: string; value: string; color: string; href?: string }) {
  const inner = (
    <>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`font-bold mt-1 ${color}`} style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}>
        {value}
      </p>
    </>
  );
  const base = "bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center";
  if (href) {
    const tint = color.includes("green") ? "kpi-green" : color.includes("red") ? "kpi-red" : "kpi-neutral";
    return <a href={href} className={`${base} kpi-card-link ${tint}`}>{inner}</a>;
  }
  return <div className={base}>{inner}</div>;
}
