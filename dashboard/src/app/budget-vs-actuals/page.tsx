"use client";

import { useEffect, useState, useRef } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExportButtons } from "@/components/ExportButtons";

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

// Non-recurring / inter-company accounts to exclude in Operating mode
const NON_RECURRING_PREFIXES = ["5756", "5757"]; // Sale proceeds, gains on sale
const INTERCO_PREFIXES = ["5820-1"]; // Asset management fees (inter-company)

function isNonRecurring(acctNumber: string): boolean {
  return NON_RECURRING_PREFIXES.some((p) => acctNumber.startsWith(p));
}

function isInterco(acctNumber: string): boolean {
  return INTERCO_PREFIXES.some((p) => acctNumber.startsWith(p));
}

function isExcluded(acctNumber: string): boolean {
  return isNonRecurring(acctNumber) || isInterco(acctNumber);
}

// Debt service accounts (mortgage interest) for DSCR calculation
const DEBT_SERVICE_PREFIXES = ["8510", "8520", "8530"];

function isDebtService(acctNumber: string): boolean {
  return DEBT_SERVICE_PREFIXES.some((p) => acctNumber.startsWith(p));
}

export default function BudgetVsActualsPage() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"all" | "operating">("operating");
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

  // Compute operating metrics
  const operatingIncome = incomeAccounts
    .filter((a) => mode === "all" || !isExcluded(a.number))
    .reduce((sum, a) => sum + (a.ytd || 0), 0);
  const operatingIncomeLY = incomeAccounts
    .filter((a) => mode === "all" || !isExcluded(a.number))
    .reduce((sum, a) => sum + (a.lastYearYtd || 0), 0);
  const totalExpensesYtd = expenseAccounts.reduce((sum, a) => sum + (a.ytd || 0), 0);
  const totalExpensesLY = expenseAccounts.reduce((sum, a) => sum + (a.lastYearYtd || 0), 0);
  const debtServiceYtd = expenseAccounts
    .filter((a) => isDebtService(a.number))
    .reduce((sum, a) => sum + (a.ytd || 0), 0);
  const debtServiceLY = expenseAccounts
    .filter((a) => isDebtService(a.number))
    .reduce((sum, a) => sum + (a.lastYearYtd || 0), 0);

  const noi = operatingIncome - totalExpensesYtd;
  const noiLY = operatingIncomeLY - totalExpensesLY;
  const noiChange = noiLY !== 0 ? ((noi - noiLY) / Math.abs(noiLY)) * 100 : 0;
  const opexRatio = operatingIncome > 0 ? (totalExpensesYtd / operatingIncome) * 100 : 0;
  const opexRatioLY = operatingIncomeLY > 0 ? (totalExpensesLY / operatingIncomeLY) * 100 : 0;
  const dscr = debtServiceYtd > 0 ? noi / debtServiceYtd : 0;
  const dscrLY = debtServiceLY > 0 ? noiLY / debtServiceLY : 0;
  const incomeYoY = operatingIncomeLY > 0
    ? ((operatingIncome - operatingIncomeLY) / operatingIncomeLY) * 100
    : 0;

  // Threshold warnings
  const noiWarning = noi < 0;
  const opexWarning = opexRatio > 70;
  const dscrWarning = debtServiceYtd > 0 && dscr < 1.25;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {data?.hasBudget ? "Budget vs Actuals" : "Year-over-Year Comparison"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {data?.hasBudget ? "Variance analysis by account" : "Current YTD vs prior year performance"}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {data && !data.hasBudget && (
          <ExportButtons
            fileName="Budget_YoY"
            title="Year-over-Year Comparison"
            headers={["Account #", "Account Name", "Type", "This Month", "YTD", "Last Year YTD", "YoY Change"]}
            rows={(data.accounts || []).map((a) => [
              a.number, a.name, a.type, fmt(a.actual),
              fmt(a.ytd || 0), fmt(a.lastYearYtd || 0),
              a.lastYearYtd ? fmtPct(a.yoyVariance || 0) : "N/A",
            ])}
          />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* Operating toggle — only show for YoY view */}
          {data && !data.hasBudget && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">View</span>
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                <button
                  onClick={() => setMode("all")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === "all"
                      ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  All items
                </button>
                <button
                  onClick={() => setMode("operating")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === "operating"
                      ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Operating only
                </button>
              </div>
            </div>
          )}
          <DateRangePicker onRangeChange={(from, to) => fetchData(from, to)} />
        </div>
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
          {/* Operating KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KpiCard
              label="Operating NOI"
              value={fmtK(noi)}
              sub={`LY: ${fmtK(noiLY)}`}
              change={fmtPct(noiChange)}
              positive={noiChange >= 0}
              warning={noiWarning}
              warningText={noiWarning ? "Negative NOI" : undefined}
            />
            <KpiCard
              label="OpEx Ratio"
              value={opexRatio.toFixed(1) + "%"}
              sub={`LY: ${opexRatioLY.toFixed(1)}%`}
              change={(opexRatio - opexRatioLY >= 0 ? "+" : "") + (opexRatio - opexRatioLY).toFixed(1) + "pp"}
              positive={opexRatio <= opexRatioLY}
              warning={opexWarning}
              warningText={opexWarning ? "Above 70% threshold" : undefined}
            />
            <KpiCard
              label="Debt Coverage"
              value={debtServiceYtd > 0 ? dscr.toFixed(2) + "x" : "N/A"}
              sub={debtServiceLY > 0 ? `LY: ${dscrLY.toFixed(2)}x` : ""}
              change={debtServiceYtd > 0 && debtServiceLY > 0 ? (dscr - dscrLY >= 0 ? "+" : "") + (dscr - dscrLY).toFixed(2) + "x" : ""}
              positive={dscr >= dscrLY}
              warning={dscrWarning}
              warningText={dscrWarning ? (dscr < 0 ? "Negative — NOI does not cover debt" : "Below 1.25x lender minimum") : undefined}
            />
            <KpiCard
              label="Income YoY"
              value={fmtPct(incomeYoY)}
              sub={`${fmtK(operatingIncome)} YTD`}
              change={mode === "operating" ? "excl. non-recurring" : "includes one-time items"}
              positive={incomeYoY >= 0}
              neutral
            />
          </div>

          {/* Info box when in operating mode */}
          {mode === "operating" && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-blue-800 dark:text-blue-300">
                <strong>Operating mode:</strong> Non-recurring items (property sales, gains on disposal) and inter-company fees are excluded from totals and KPIs.
                {operatingIncomeLY > 0 && yoy && (
                  <> Recurring income growth is <strong>{fmtPct(incomeYoY)}</strong> vs the reported {fmtPct(yoy.incomeChange)}.</>
                )}
              </p>
            </div>
          )}

          {/* YoY Summary Cards */}
          {yoy && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <YoYCard
                label={mode === "operating" ? "Operating Income" : "Total Income"}
                current={operatingIncome}
                lastYear={operatingIncomeLY}
                change={incomeYoY}
              />
              <YoYCard
                label="Total Expenses"
                current={totalExpensesYtd}
                lastYear={totalExpensesLY}
                change={totalExpensesLY > 0 ? ((totalExpensesYtd - totalExpensesLY) / totalExpensesLY) * 100 : 0}
                invertColor
              />
            </div>
          )}

          {/* YoY Account Tables */}
          <YoYTable title="Income Accounts" accounts={incomeAccounts} mode={mode} />
          <YoYTable title="Expense Accounts" accounts={expenseAccounts} invertColor mode={mode} />
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  change,
  positive,
  warning,
  warningText,
  neutral,
}: {
  label: string;
  value: string;
  sub: string;
  change: string;
  positive: boolean;
  warning?: boolean;
  warningText?: string;
  neutral?: boolean;
}) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border text-center ${
      warning ? "border-red-300 dark:border-red-700" : "border-gray-100 dark:border-gray-700"
    }`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="font-bold mt-1 text-gray-900 dark:text-white" style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-1">
        {sub}
        {change && (
          <span className={`ml-1.5 font-medium ${
            neutral ? "text-gray-400" : positive ? "text-green-600" : "text-red-600"
          }`}>
            {change}
          </span>
        )}
      </p>
      {warning && warningText && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
          ⚠ {warningText}
        </p>
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
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <div className="flex items-end justify-center gap-4 mt-2">
        <div>
          <p className="font-bold text-gray-900 dark:text-white" style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>{fmtK(current)}</p>
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

function YoYTable({ title, accounts, invertColor, mode }: { title: string; accounts: Account[]; invertColor?: boolean; mode: "all" | "operating" }) {
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
            {sorted.map((a) => {
              const excluded = mode === "operating" && isExcluded(a.number);
              return (
                <tr key={a.number} className={`hover:bg-gray-50 dark:hover:bg-gray-750 ${excluded ? "opacity-40" : ""}`}>
                  <td className={`px-4 py-2 text-gray-700 dark:text-gray-300 ${excluded ? "line-through" : ""}`}>
                    <span className="text-xs text-gray-400 mr-2">{a.number}</span>
                    {a.name}
                    {excluded && isNonRecurring(a.number) && (
                      <span className="ml-2 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded px-1.5 py-0.5 no-underline inline-block">
                        non-recurring
                      </span>
                    )}
                    {excluded && isInterco(a.number) && (
                      <span className="ml-2 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded px-1.5 py-0.5 no-underline inline-block">
                        inter-co
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono text-gray-900 dark:text-white ${excluded ? "line-through" : ""}`}>
                    {fmt(a.actual)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono text-gray-900 dark:text-white ${excluded ? "line-through" : ""}`}>
                    {fmt(a.ytd || 0)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono text-gray-500 ${excluded ? "line-through" : ""}`}>
                    {fmt(a.lastYearYtd || 0)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-semibold ${
                    excluded ? "text-gray-400" :
                    (invertColor ? (a.yoyVariance || 0) <= 0 : (a.yoyVariance || 0) >= 0) ? "text-green-600" : "text-red-600"
                  }`}>
                    {a.lastYearYtd ? fmtPct(a.yoyVariance || 0) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
