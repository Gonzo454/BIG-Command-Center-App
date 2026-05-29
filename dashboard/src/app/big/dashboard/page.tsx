"use client";

import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { ExportButtons } from "@/components/ExportButtons";
import { DateRangePicker } from "@/components/DateRangePicker";

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
}

interface Account {
  name: string;
  number: string;
  amount: number;
  lastYearAmount: number;
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

const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

export default function BigDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueAccounts, setRevenueAccounts] = useState<Account[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodLabel, setPeriodLabel] = useState("YTD");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const initialized = useRef(false);

  const fetchData = useCallback(
    (from?: string, to?: string, period?: string) => {
      setLoading(true);
      setDateFrom(from);
      setDateTo(to);
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (period) params.set("period", period);
      const qs = params.toString() ? `?${params.toString()}` : "";
      fetch(`/api/big-management${qs}`)
        .then((r) => r.json())
        .then((d) => {
          setSummary(d.summary || null);
          setRevenueAccounts(d.revenueAccounts || []);
          setExpenseAccounts(d.expenseAccounts || []);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetchData();
  }, [fetchData]);

  function handleRangeChange(from: string, to: string, period: string) {
    setPeriodLabel(
      period === "mtd"
        ? "MTD"
        : period === "qtd"
        ? "QTD"
        : period === "ytd"
        ? "YTD"
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

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : !summary ? (
        <div className="text-center py-20 text-gray-500">
          No data available
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Revenue"
              value={summary.totalRevenue}
              change={summary.revenueChange}
              positive
            />
            <KpiCard
              label="Total Expenses"
              value={summary.totalExpenses}
              change={summary.expenseChange}
              invertColor
            />
            <KpiCard
              label="Net Income"
              value={summary.netIncome}
              change={summary.netIncomeChange}
              positive
            />
            <KpiCard
              label="Management Fees"
              value={summary.mgmtFees}
              subtitle="Core revenue stream"
            />
          </div>

          {/* Revenue Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Management & Asset Fees
              </p>
              <p
                className="font-bold text-green-600 mt-1"
                style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}
              >
                {fmt(summary.mgmtFees)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Leasing & Sale Commissions
              </p>
              <p
                className="font-bold text-blue-600 mt-1"
                style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}
              >
                {fmt(summary.commissions)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Other Revenue
              </p>
              <p
                className="font-bold text-purple-600 mt-1"
                style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}
              >
                {fmt(summary.otherRevenue)}
              </p>
            </div>
          </div>

          {/* Revenue Table */}
          <AccountTable
            title="Revenue"
            titleColor="green"
            accounts={revenueAccounts}
            periodLabel={periodLabel}
            totalLabel="Total Revenue"
            totalAmount={summary.totalRevenue}
            totalLY={summary.totalRevenueLY}
            totalChange={summary.revenueChange}
            isExpense={false}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />

          {/* Expenses Table */}
          <AccountTable
            title="Expenses"
            titleColor="red"
            accounts={expenseAccounts}
            periodLabel={periodLabel}
            totalLabel="Total Expenses"
            totalAmount={summary.totalExpenses}
            totalLY={summary.totalExpensesLY}
            totalChange={summary.expenseChange}
            isExpense
            dateFrom={dateFrom}
            dateTo={dateTo}
          />

          {/* Net Income Bar */}
          <div
            className={`rounded-xl p-5 shadow-sm border text-center ${
              summary.netIncome >= 0
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            }`}
          >
            <p className="text-xs font-medium text-gray-500 uppercase">
              BIG Management Net Income ({periodLabel})
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
        </>
      )}
    </div>
  );
}

/* ── Account Table with expandable drill-down ── */

function AccountTable({
  title,
  titleColor,
  accounts,
  periodLabel,
  totalLabel,
  totalAmount,
  totalLY,
  totalChange,
  isExpense,
  dateFrom,
  dateTo,
}: {
  title: string;
  titleColor: "green" | "red";
  accounts: Account[];
  periodLabel: string;
  totalLabel: string;
  totalAmount: number;
  totalLY: number;
  totalChange: number;
  isExpense: boolean;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Transaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  function toggleDrillDown(accountNum: string) {
    if (expanded === accountNum) {
      setExpanded(null);
      setDetail([]);
      return;
    }
    setExpanded(accountNum);
    setDetailLoading(true);
    const params = new URLSearchParams({ account: accountNum });
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    fetch(`/api/big-management/detail?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.transactions || []))
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  const sorted = isExpense
    ? accounts.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    : accounts;

  const bg =
    titleColor === "green"
      ? "bg-green-50 dark:bg-green-900/20"
      : "bg-red-50 dark:bg-red-900/20";
  const textColor = titleColor === "green" ? "text-green-700" : "text-red-700";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div
        className={`px-6 py-3 border-b border-gray-100 dark:border-gray-700 ${bg}`}
      >
        <h3 className={`font-semibold ${textColor}`}>
          {title} — {accounts.length} accounts
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300 w-6" />
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">
                Account
              </th>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">
                Number
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">
                {periodLabel}
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">
                Last Year
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">
                YoY Change
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map((a) => {
              const amt = isExpense ? Math.abs(a.amount) : a.amount;
              const ly = isExpense
                ? Math.abs(a.lastYearAmount)
                : a.lastYearAmount;
              const yoy = ly !== 0 ? ((amt - ly) / ly) * 100 : 0;
              const isOpen = expanded === a.number;

              return (
                <Fragment key={a.number}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                    onClick={() => toggleDrillDown(a.number)}
                  >
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {isOpen ? "▼" : "▶"}
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">
                      {a.name}
                    </td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                      {a.number}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${
                        isExpense
                          ? "text-red-600"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {fmt(amt)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-gray-500">
                      {fmt(ly)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono font-medium ${
                        isExpense
                          ? yoy > 0
                            ? "text-red-600"
                            : yoy < 0
                            ? "text-green-600"
                            : "text-gray-400"
                          : yoy > 0
                          ? "text-green-600"
                          : yoy < 0
                          ? "text-red-600"
                          : "text-gray-400"
                      }`}
                    >
                      {ly !== 0 ? pct(yoy) : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-3 border-t border-gray-200 dark:border-gray-600">
                          {detailLoading ? (
                            <p className="text-sm text-gray-500 py-2">
                              Loading transactions...
                            </p>
                          ) : detail.length === 0 ? (
                            <p className="text-sm text-gray-400 py-2">
                              No transactions found for this period
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left py-1 pr-3 font-medium">
                                    Date
                                  </th>
                                  <th className="text-left py-1 pr-3 font-medium">
                                    Vendor / Payee
                                  </th>
                                  <th className="text-left py-1 pr-3 font-medium">
                                    Property / Entity
                                  </th>
                                  <th className="text-left py-1 pr-3 font-medium">
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
                                    <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">
                                      {t.date || "—"}
                                    </td>
                                    <td className="py-1.5 pr-3 text-gray-900 dark:text-white font-medium">
                                      {t.vendor}
                                    </td>
                                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300">
                                      {t.property || "—"}
                                    </td>
                                    <td className="py-1.5 pr-3 text-gray-500 truncate max-w-[200px]">
                                      {t.description || "—"}
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-gray-900 dark:text-white">
                                      {fmt(t.amount)}
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
            <tr className={`${bg} font-bold`}>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-gray-900 dark:text-white">
                {totalLabel}
              </td>
              <td className="px-4 py-2" />
              <td
                className={`px-4 py-2 text-right font-mono ${
                  isExpense ? "text-red-600" : "text-gray-900 dark:text-white"
                }`}
              >
                {fmt(totalAmount)}
              </td>
              <td className="px-4 py-2 text-right font-mono text-gray-500">
                {fmt(totalLY)}
              </td>
              <td
                className={`px-4 py-2 text-right font-mono ${
                  isExpense
                    ? totalChange > 0
                      ? "text-red-600"
                      : "text-green-600"
                    : totalChange >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {pct(totalChange)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── KPI Card ── */

function KpiCard({
  label,
  value,
  change,
  subtitle,
  positive,
  invertColor,
}: {
  label: string;
  value: number;
  change?: number;
  subtitle?: string;
  positive?: boolean;
  invertColor?: boolean;
}) {
  const changeColor = (c: number) => {
    if (invertColor) return c > 0 ? "text-red-600" : "text-green-600";
    return c >= 0 ? "text-green-600" : "text-red-600";
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p
        className={`font-bold mt-1 ${
          positive
            ? value >= 0
              ? "text-green-600"
              : "text-red-600"
            : "text-gray-900 dark:text-white"
        }`}
        style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}
      >
        {value < 0 ? "-" : ""}
        {fmt(value)}
      </p>
      {change !== undefined && (
        <p className={`text-xs mt-1 ${changeColor(change)}`}>
          {pct(change)} YoY
        </p>
      )}
      {subtitle && (
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
