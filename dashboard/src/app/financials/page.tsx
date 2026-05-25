"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExportButtons } from "@/components/ExportButtons";

type Tab = "pnl" | "cashflow" | "budget";

interface Account {
  name: string;
  number: string;
  amount: number;
  type: string;
}

interface PnlData {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  accounts: Account[];
  period: { from: string; to: string };
}

interface CashFlowItem {
  name: string;
  number: string;
  amount: number;
}

interface CfSection {
  items: CashFlowItem[];
  total: number;
  income?: number;
  expenses?: number;
}

interface CashFlowData {
  operating: CfSection;
  investing: CfSection;
  financing: CfSection;
  netCashFlow: number;
  period: string;
}

interface BudgetAccount {
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
  accounts: BudgetAccount[];
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

const fmtPct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: "pnl", label: "P&L", icon: "💰" },
  { key: "cashflow", label: "Cash Flow", icon: "💵" },
  { key: "budget", label: "Budget / YoY", icon: "📈" },
];

export default function FinancialsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pnl");
  const [pnlData, setPnlData] = useState<PnlData | null>(null);
  const [cfData, setCfData] = useState<CashFlowData | null>(null);
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cfPeriod, setCfPeriod] = useState<"mtd" | "ytd">("mtd");
  const initialized = useRef(false);

  const fetchPnl = useCallback(async (from?: string, to?: string, period?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (period) params.set("period", period);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`/api/income-statement${qs}`);
    return res.json();
  }, []);

  const fetchCf = useCallback(async (p: string) => {
    const res = await fetch(`/api/cash-flow?period=${p}`);
    return res.json();
  }, []);

  const fetchBudget = useCallback(async (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`/api/budget${qs}`);
    return res.json();
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setLoading(true);
    Promise.all([fetchPnl(), fetchCf("mtd"), fetchBudget()])
      .then(([pnl, cf, budget]) => {
        setPnlData(pnl);
        setCfData(cf);
        setBudgetData(budget);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchPnl, fetchCf, fetchBudget]);

  async function handlePnlRange(from: string, to: string, period: string) {
    setLoading(true);
    try {
      setPnlData(await fetchPnl(from, to, period));
    } finally {
      setLoading(false);
    }
  }

  async function handleCfPeriod(p: "mtd" | "ytd") {
    setCfPeriod(p);
    setLoading(true);
    try {
      setCfData(await fetchCf(p));
    } finally {
      setLoading(false);
    }
  }

  async function handleBudgetRange(from: string, to: string) {
    setLoading(true);
    try {
      setBudgetData(await fetchBudget(from, to));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Financial Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          {activeTab === "pnl" && "Income Statement (P&L)"}
          {activeTab === "cashflow" && "Operating, investing & financing activities"}
          {activeTab === "budget" && (budgetData?.hasBudget ? "Variance analysis by account" : "Current YTD vs prior year performance")}
        </p>
      </div>

      {/* Tabs + Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 pb-0">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {activeTab === "pnl" && pnlData && (
            <ExportButtons
              fileName="PnL_Report"
              title="Income Statement (P&L)"
              headers={["Account #", "Account Name", "Type", "Amount"]}
              rows={(pnlData.accounts || []).map((a) => [a.number, a.name, a.type, fmt(a.amount)])}
            />
          )}
          {activeTab === "cashflow" && cfData && (
            <ExportButtons
              fileName="Cash_Flow"
              title="Cash Flow Statement"
              headers={["Section", "Account #", "Account Name", "Amount"]}
              rows={[
                ...cfData.operating.items.map((i) => ["Operating", i.number, i.name, fmt(i.amount)]),
                ...cfData.investing.items.map((i) => ["Investing", i.number, i.name, fmt(i.amount)]),
                ...cfData.financing.items.map((i) => ["Financing", i.number, i.name, fmt(i.amount)]),
              ]}
            />
          )}
          {activeTab === "budget" && budgetData && (
            <ExportButtons
              fileName="Budget_YoY"
              title={budgetData.hasBudget ? "Budget vs Actuals" : "Year-over-Year Comparison"}
              headers={budgetData.hasBudget
                ? ["Account #", "Account Name", "Type", "Actual", "Budget", "Variance", "Variance %"]
                : ["Account #", "Account Name", "Type", "This Month", "YTD", "Last Year YTD", "YoY Change"]
              }
              rows={(budgetData.accounts || []).map((a) =>
                budgetData.hasBudget
                  ? [a.number, a.name, a.type, fmt(a.actual), fmt(a.budget), fmt(a.variance || 0), fmtPct(a.percentVariance || 0)]
                  : [a.number, a.name, a.type, fmt(a.actual), fmt(a.ytd || 0), fmt(a.lastYearYtd || 0), a.lastYearYtd ? fmtPct(a.yoyVariance || 0) : "N/A"]
              )}
            />
          )}
          {activeTab === "pnl" && (
            <DateRangePicker onRangeChange={handlePnlRange} />
          )}
          {activeTab === "cashflow" && (
            <div className="flex gap-2">
              {(["mtd", "ytd"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handleCfPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    cfPeriod === p
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {activeTab === "budget" && (
            <DateRangePicker onRangeChange={(from, to) => handleBudgetRange(from, to)} />
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : (
        <>
          {activeTab === "pnl" && pnlData && <PnlTab data={pnlData} />}
          {activeTab === "cashflow" && cfData && <CashFlowTab data={cfData} />}
          {activeTab === "budget" && budgetData && <BudgetTab data={budgetData} />}
        </>
      )}
    </div>
  );
}

/* ── P&L Tab ── */
function PnlTab({ data }: { data: PnlData }) {
  const incomeAccounts = data.accounts.filter((a) => a.type === "income");
  const expenseAccounts = data.accounts.filter((a) => a.type === "expense");

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="Total Income" value={fmtK(data.totalIncome)} color="text-green-600" />
        <KpiCard label="Total Expenses" value={fmtK(data.totalExpenses)} color="text-red-600" />
        <KpiCard label="Net Income" value={fmtK(data.netIncome)} color={data.netIncome >= 0 ? "text-green-600" : "text-red-600"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AccountTable title="Income" accounts={incomeAccounts} />
        <AccountTable title="Expenses" accounts={expenseAccounts} />
      </div>
    </>
  );
}

function AccountTable({ title, accounts }: { title: string; accounts: Account[] }) {
  const sorted = [...accounts].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
            <tr>
              <th className="text-left px-6 py-2 font-medium text-gray-500">Account</th>
              <th className="text-right px-6 py-2 font-medium text-gray-500">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map((a) => (
              <tr key={a.number} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                <td className="px-6 py-2 text-gray-700 dark:text-gray-300">
                  <span className="text-xs text-gray-400 mr-2">{a.number}</span>
                  {a.name}
                </td>
                <td className="px-6 py-2 text-right font-mono text-gray-900 dark:text-white">
                  ${Math.abs(a.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Cash Flow Tab ── */
function CashFlowTab({ data }: { data: CashFlowData }) {
  const borderColors: Record<string, string> = {
    blue: "border-l-blue-500",
    purple: "border-l-purple-500",
    emerald: "border-l-emerald-500",
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <CfSummaryCard label="Operating" value={data.operating.total} />
        <CfSummaryCard label="Investing" value={data.investing.total} />
        <CfSummaryCard label="Financing" value={data.financing.total} />
        <CfSummaryCard label="Net Cash Flow" value={data.netCashFlow} highlight />
      </div>

      {([
        { title: "Operating Activities", section: data.operating, color: "blue", subtitle: data.operating.income && data.operating.expenses ? `Income: ${fmtK(data.operating.income)} — Expenses: ${fmtK(data.operating.expenses)}` : undefined },
        { title: "Investing Activities", section: data.investing, color: "purple" },
        { title: "Financing Activities", section: data.financing, color: "emerald" },
      ] as const).map((s) => (
        <div
          key={s.title}
          className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden border-l-4 ${borderColors[s.color] || "border-l-gray-500"}`}
        >
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">{s.title}</h3>
            {"subtitle" in s && s.subtitle && <p className="text-xs text-gray-500 mt-0.5">{s.subtitle}</p>}
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
                {s.section.items.map((item) => (
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
                  <td className={`px-6 py-3 text-right font-mono ${s.section.total >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {fmt(s.section.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

function CfSummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl p-5 shadow-sm border ${
        highlight
          ? "bg-gray-900 dark:bg-gray-700 border-gray-700"
          : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700"
      }`}
    >
      <p className={`text-xs font-medium uppercase tracking-wide ${highlight ? "text-gray-400" : "text-gray-500"}`}>
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? (value >= 0 ? "text-green-400" : "text-red-400") : value >= 0 ? "text-green-600" : "text-red-600"}`}>
        {fmtK(value)}
      </p>
    </div>
  );
}

/* ── Budget / YoY Tab ── */
function BudgetTab({ data }: { data: BudgetData }) {
  const incomeAccounts = data.accounts.filter((a) => a.type === "income");
  const expenseAccounts = data.accounts.filter((a) => a.type === "expense");
  const yoy = data.yoySummary;

  if (data.hasBudget) {
    return (
      <>
        <BudgetTable title="Income" accounts={incomeAccounts} />
        <BudgetTable title="Expenses" accounts={expenseAccounts} />
      </>
    );
  }

  return (
    <>
      {yoy && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <YoYCard label="Total Income" current={yoy.totalIncome} lastYear={yoy.lastYearIncome} change={yoy.incomeChange} />
          <YoYCard label="Total Expenses" current={yoy.totalExpenses} lastYear={yoy.lastYearExpenses} change={yoy.expenseChange} invertColor />
        </div>
      )}
      <YoYTable title="Income Accounts" accounts={incomeAccounts} />
      <YoYTable title="Expense Accounts" accounts={expenseAccounts} />
    </>
  );
}

function BudgetTable({ title, accounts }: { title: string; accounts: BudgetAccount[] }) {
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

function YoYCard({ label, current, lastYear, change, invertColor }: { label: string; current: number; lastYear: number; change: number; invertColor?: boolean }) {
  const isPositive = invertColor ? change <= 0 : change >= 0;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <div className="flex items-end justify-between mt-2">
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtK(current)}</p>
          <p className="text-xs text-gray-500 mt-1">Last year: {fmtK(lastYear)}</p>
        </div>
        <span className={`text-lg font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
          {fmtPct(change)}
        </span>
      </div>
    </div>
  );
}

function YoYTable({ title, accounts }: { title: string; accounts: BudgetAccount[] }) {
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
                <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">{fmt(a.actual)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">{fmt(a.ytd || 0)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-500">{fmt(a.lastYearYtd || 0)}</td>
                <td className={`px-4 py-2 text-right font-mono font-semibold ${(a.yoyVariance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
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

/* ── Shared ── */
function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
