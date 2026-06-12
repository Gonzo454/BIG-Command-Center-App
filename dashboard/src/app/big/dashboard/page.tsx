"use client";

import { apiJson } from "@/lib/fetchRetry";
import { LoadingState } from "@/components/LoadingState";
import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { ExportButtons } from "@/components/ExportButtons";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ProfitGauge } from "@/components/ProfitGauge";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
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
  mgmtFees: number;
  commissions: number;
  otherRevenue: number;
  totalCapital?: number;
  netIncomeWithCapital?: number;
}

interface Account {
  name: string;
  number: string;
  amount: number;
  lastYearAmount: number;
}

interface CapitalTransaction {
  date: string;
  vendor: string;
  description: string;
  amount: number;
}

interface CapitalAccount {
  name: string;
  number: string;
  amount: number;
  transactions?: CapitalTransaction[];
}

interface Transaction {
  date: string;
  vendor: string;
  property: string;
  description: string;
  amount: number;
}

const fmt = (n: number) =>
  "$" +
  Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtShort = (n: number) =>
  "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

interface BigDashCache {
  summary: Summary;
  revenueAccounts: Account[];
  expenseAccounts: Account[];
  capitalAccounts: CapitalAccount[];
}

export default function BigDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueAccounts, setRevenueAccounts] = useState<Account[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [capitalAccounts, setCapitalAccounts] = useState<CapitalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodLabel, setPeriodLabel] = useState("MTD");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const initialized = useRef(false);
  const dataCache = useRef<Map<string, BigDashCache>>(new Map());

  const fetchData = useCallback(
    (from?: string, to?: string, period?: string) => {
      const key = `${from || "default"}:${to || "default"}:${period || "mtd"}`;
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
      setDateFrom(from);
      setDateTo(to);
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (period) params.set("period", period);
      const qs = params.toString() ? `?${params.toString()}` : "";
      apiJson(`/api/big-management${qs}`)
        .then((d) => {
          const data: BigDashCache = {
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
        .finally(() => { setLoading(false); setRefreshing(false); });
    },
    []
  );

  const prefetch = useCallback((from: string, to: string, period: string) => {
    const key = `${from}:${to}:${period}`;
    if (dataCache.current.has(key)) return;
    const params = new URLSearchParams({ from, to, period });
    apiJson(`/api/big-management?${params.toString()}`)
      .then((d) => {
        if (!d.summary) return;
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
    const d = new Date();
    const mtdFrom = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const mtdTo = d.toISOString().split("T")[0];
    fetchData(mtdFrom, mtdTo, "mtd");
    const q = Math.floor(d.getMonth() / 3) * 3;
    const qtdFrom = `${d.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
    const ytdFrom = `${d.getFullYear()}-01-01`;
    setTimeout(() => {
      prefetch(qtdFrom, mtdTo, "qtd");
      prefetch(ytdFrom, mtdTo, "ytd");
    }, 1000);
  }, [fetchData, prefetch]);

  function handleRangeChange(from: string, to: string, period: string) {
    setPeriodLabel(
      period === "mtd"
        ? "MTD"
        : period === "qtd"
        ? "QTD"
        : period === "ytd"
        ? "YTD"
        : period === "prevmo"
        ? "Prev Mo"
        : "Period"
    );
    fetchData(from, to, period);
  }

  const allAccounts = [...revenueAccounts, ...expenseAccounts];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          BIG Management Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Blackdeer Investment Group — Management Company Performance
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {allAccounts.length > 0 && (
          <ExportButtons
            fileName="BIG_Management"
            title="BIG Management Company — Financial Summary"
            headers={["Account", "Number", periodLabel, "Last Year", "YoY"]}
            rows={allAccounts.map((a) => [
              a.name,
              a.number,
              fmt(a.amount),
              fmt(a.lastYearAmount),
              a.lastYearAmount !== 0
                ? pct(
                    ((a.amount - a.lastYearAmount) /
                      Math.abs(a.lastYearAmount)) *
                      100
                  )
                : "—",
            ])}
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
      ) : !summary ? (
        <div className="text-center py-20 text-gray-500">
          No data available
        </div>
      ) : (
        <div className={`space-y-6 ${refreshing ? "opacity-75 transition-opacity" : ""}`}>
          {/* KPI Cards + Profitability Gauge */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total Revenue"
              value={summary.totalRevenue}
              color="text-green-600"
              href="#section-revenue"
            />
            <KpiCard
              label="Total Expenses"
              value={summary.totalExpenses}
              color="text-red-600"
              href="#section-expenses"
              subLabel={summary.totalCapital && summary.totalCapital > 0 ? "Owner Capital Contributions" : undefined}
              sub={
                summary.totalCapital && summary.totalCapital > 0
                  ? `+${fmt(summary.totalCapital)}`
                  : undefined
              }
              subColor="text-blue-600"
            />
            {summary.totalCapital && summary.totalCapital > 0 ? (
              <KpiCard
                label="Reconciled Net Income"
                value={summary.netIncomeWithCapital ?? summary.netIncome + summary.totalCapital}
                color={(summary.netIncomeWithCapital ?? summary.netIncome + summary.totalCapital) >= 0 ? "text-green-600" : "text-red-600"}
                sub="revenue − expenses + owner capital"
                subColor="text-gray-400"
              />
            ) : (
              <KpiCard
                label="Net Income"
                value={summary.netIncome}
                color={summary.netIncome >= 0 ? "text-green-600" : "text-red-600"}
                sub="revenue − expenses"
                subColor="text-gray-400"
              />
            )}
            <div className="flex items-center justify-center">
              <ProfitGauge
                name="Profitability"
                netIncome={summary.netIncome}
                maxAbsolute={Math.max(
                  summary.totalRevenue,
                  summary.totalExpenses,
                  1
                )}
              />
            </div>
          </div>

          {/* Revenue / Expense Tables — two-column like property pages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue */}
            <AccountPanel
              title="Revenue"
              total={summary.totalRevenue}
              accounts={revenueAccounts}
              isExpense={false}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />

            {/* Expenses */}
            <AccountPanel
              title="Expenses"
              total={summary.totalExpenses}
              accounts={expenseAccounts}
              isExpense
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          </div>

          {/* Capital Activity */}
          {capitalAccounts.length > 0 && (
            <CapitalPanel accounts={capitalAccounts} total={summary.totalCapital || 0} />
          )}

          {/* Net Income Bar */}
          <div
            className={`rounded-xl p-5 shadow-sm border text-center ${
              summary.netIncome >= 0
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            }`}
          >
            <p className="text-xs font-medium text-gray-500 uppercase">
              BIG Management Operating Net Income ({periodLabel})
            </p>
            <p
              className={`font-bold mt-1 ${
                summary.netIncome >= 0 ? "text-green-700" : "text-red-700"
              }`}
              style={{ fontSize: "clamp(1.25rem, 3vw, 2rem)" }}
            >
              {summary.netIncome < 0 ? "-" : ""}
              {fmt(summary.netIncome)}
            </p>
            {!!summary.totalCapital && (
              <p
                className={`text-sm mt-1 font-semibold ${
                  (summary.netIncomeWithCapital ?? summary.netIncome + summary.totalCapital) >= 0
                    ? "text-green-700"
                    : "text-red-700"
                }`}
              >
                Reconciled Net Income (incl. owner capital):{" "}
                {(summary.netIncomeWithCapital ?? summary.netIncome + summary.totalCapital) < 0 ? "-" : ""}
                {fmt(summary.netIncomeWithCapital ?? summary.netIncome + summary.totalCapital)}
              </p>
            )}
            {summary.netIncomeLY !== 0 && (
              <p
                className={`text-sm mt-1 ${
                  summary.netIncomeChange >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {pct(summary.netIncomeChange)} vs last year (
                {fmt(summary.netIncomeLY)})
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Account Panel with expandable drill-down (property-style layout) ── */

function AccountPanel({
  title,
  total,
  accounts,
  isExpense,
  dateFrom,
  dateTo,
}: {
  title: string;
  total: number;
  accounts: Account[];
  isExpense: boolean;
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
    const params = new URLSearchParams({ account: accountNum });
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    apiJson(`/api/big-management/detail?${params.toString()}`)
      .then((d) => setDetail(d.transactions || []))
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  const sorted = accounts
    .slice()
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const colorClass = isExpense ? "text-red-600" : "text-green-600";

  return (
    <CollapsiblePanel
      title={title}
      id={`section-${title.toLowerCase()}`}
      headerRight={
        <p className={`text-sm font-mono font-semibold ${colorClass}`}>{fmtShort(total)}</p>
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
              const isCredit = isExpense && a.amount < 0;

              return (
                <Fragment key={a.number}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                    onClick={() => toggleDrillDown(a.number, a.amount)}
                  >
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      <span className="text-xs text-gray-400 mr-1">
                        {isOpen ? "▼" : "▶"}
                      </span>
                      <span className="text-xs text-gray-400 mr-1">
                        {a.number}
                      </span>
                      {a.name}
                      {isCredit && <span className="ml-1 text-xs text-green-600 font-medium">(credit)</span>}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${isCredit ? "text-green-600" : colorClass}`}>
                      {isCredit ? `(${fmt(Math.abs(a.amount))})` : fmt(Math.abs(a.amount))}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={2} className="p-0">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-t border-gray-200 dark:border-gray-600">
                          {detailLoading ? (
                            <p className="text-xs text-gray-500 py-1">
                              Lots of cash loading here, please be patient.
                            </p>
                          ) : detail.length === 0 ? (
                            <p className="text-xs text-gray-400 py-1">
                              No transactions found
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left py-1 pr-2 font-medium">
                                    Date
                                  </th>
                                  <th className="text-left py-1 pr-2 font-medium">
                                    Vendor / Payee
                                  </th>
                                  <th className="text-left py-1 pr-2 font-medium">
                                    Property
                                  </th>
                                  <th className="text-left py-1 pr-2 font-medium">
                                    Description
                                  </th>
                                  <th className="text-right py-1 font-medium">
                                    Amount
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {detail.map((t, i) => (
                                  <tr
                                    key={i}
                                    className="hover:bg-gray-100 dark:hover:bg-gray-800"
                                  >
                                    <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">
                                      {t.date || "—"}
                                    </td>
                                    <td className="py-1 pr-2 text-gray-900 dark:text-white font-medium">
                                      {t.vendor}
                                    </td>
                                    <td className="py-1 pr-2 text-gray-600 dark:text-gray-300">
                                      {t.property || "—"}
                                    </td>
                                    <td className="py-1 pr-2 text-gray-500 truncate max-w-[150px]">
                                      {t.description || "—"}
                                    </td>
                                    <td className="py-1 text-right font-mono text-gray-900 dark:text-white">
                                      {fmt(t.amount)}
                                    </td>
                                  </tr>
                                ))}
                                {(() => {
                                  const detailSum = detail.reduce(
                                    (s, t) => s + t.amount,
                                    0
                                  );
                                  const remainder =
                                    expandedAccountTotal - detailSum;
                                  if (Math.abs(remainder) < 0.01) return null;
                                  return (
                                    <tr className="bg-gray-100 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-600">
                                      <td className="py-1 pr-2 text-gray-400">
                                        —
                                      </td>
                                      <td
                                        colSpan={3}
                                        className="py-1 pr-2 text-gray-500 italic"
                                      >
                                        Payroll, journal entries & other
                                      </td>
                                      <td className="py-1 text-right font-mono text-gray-500 italic">
                                        {fmt(remainder)}
                                      </td>
                                    </tr>
                                  );
                                })()}
                                <tr className="border-t-2 border-gray-300 dark:border-gray-500 font-semibold">
                                  <td className="py-1 pr-2" />
                                  <td
                                    colSpan={3}
                                    className="py-1 pr-2 text-gray-700 dark:text-gray-200"
                                  >
                                    Total
                                  </td>
                                  <td className="py-1 text-right font-mono text-gray-900 dark:text-white">
                                    {fmt(expandedAccountTotal)}
                                  </td>
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
                <td
                  colSpan={2}
                  className="px-4 py-4 text-center text-gray-400"
                >
                  No accounts
                </td>
              </tr>
            )}
          </tbody>
        </table>
    </CollapsiblePanel>
  );
}

/* ── KPI Card (matches property page style) ── */

function KpiCard({
  label,
  value,
  color,
  href,
  sub,
  subColor,
  subLabel,
}: {
  label: string;
  value: number;
  color: string;
  href?: string;
  sub?: string;
  subColor?: string;
  subLabel?: string;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p
        className={`font-bold mt-1 ${color}`}
        style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}
      >
        {value < 0 ? "-" : ""}
        {fmtShort(value)}
      </p>
      {subLabel && (
        <p className="text-xs font-medium text-gray-500 uppercase mt-2">{subLabel}</p>
      )}
      {sub && (
        <p className={`text-xs mt-1 font-medium ${subColor || "text-gray-500"}`}>{sub}</p>
      )}
    </>
  );
  const base = "bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center";
  if (href) {
    const tint = color.includes("green") ? "kpi-green" : color.includes("red") ? "kpi-red" : "kpi-neutral";
    return <a href={href} className={`${base} kpi-card-link ${tint}`}>{inner}</a>;
  }
  return <div className={base}>{inner}</div>;
}

/* ── Capital Activity Panel ── */

function CapitalPanel({ accounts, total }: { accounts: CapitalAccount[]; total: number }) {
  const sorted = accounts.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <CollapsiblePanel
      title="Capital Activity"
      normalMaxHeight={300}
      headerRight={
        <p className={`text-sm font-mono font-semibold ${total >= 0 ? "text-blue-600" : "text-orange-600"}`}>
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
              const isOpen = expanded === a.number;
              const txns = a.transactions || [];
              return (
                <Fragment key={a.number}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : a.number)}
                  >
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      <span className="text-xs text-gray-400 mr-1">{isOpen ? "▼" : "▶"}</span>
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
                  {isOpen && (
                    <tr>
                      <td colSpan={2} className="p-0">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-t border-gray-200 dark:border-gray-600">
                          {txns.length === 0 ? (
                            <p className="text-xs text-gray-400 py-1">No transactions found</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left py-1 pr-2 font-medium">Date</th>
                                  <th className="text-left py-1 pr-2 font-medium">Party</th>
                                  <th className="text-left py-1 pr-2 font-medium">Description</th>
                                  <th className="text-right py-1 font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {txns.map((t, i) => (
                                  <tr key={i} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                                    <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{t.date || "—"}</td>
                                    <td className="py-1 pr-2 text-gray-900 dark:text-white font-medium">{t.vendor}</td>
                                    <td className="py-1 pr-2 text-gray-500">{t.description || "—"}</td>
                                    <td className={`py-1 text-right font-mono ${t.amount >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                                      {t.amount < 0 ? "-" : ""}{fmt(t.amount)}
                                    </td>
                                  </tr>
                                ))}
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
        </table>
    </CollapsiblePanel>
  );
}
