"use client";

import { useEffect, useState, useRef, useCallback, Fragment } from "react";
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

// Non-recurring / inter-company accounts to exclude in Operating mode
const NON_RECURRING_PREFIXES = ["5756", "5757"];
const INTERCO_PREFIXES = ["5820-1"];
const DEBT_SERVICE_PREFIXES = ["8510", "8520", "8530"];

function isNonRecurring(acctNumber: string): boolean {
  return NON_RECURRING_PREFIXES.some((p) => acctNumber.startsWith(p));
}
function isInterco(acctNumber: string): boolean {
  return INTERCO_PREFIXES.some((p) => acctNumber.startsWith(p));
}
function isExcluded(acctNumber: string): boolean {
  return isNonRecurring(acctNumber) || isInterco(acctNumber);
}
function isDebtService(acctNumber: string): boolean {
  return DEBT_SERVICE_PREFIXES.some((p) => acctNumber.startsWith(p));
}

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
  const [refreshing, setRefreshing] = useState(false);
  const [cfPeriod, setCfPeriod] = useState<"mtd" | "ytd">("mtd");
  const [budgetMode, setBudgetMode] = useState<"all" | "operating">("operating");
  const initialized = useRef(false);
  const pnlCache = useRef<Map<string, PnlData>>(new Map());
  const cfCache = useRef<Map<string, CashFlowData>>(new Map());
  const budgetCache = useRef<Map<string, BudgetData>>(new Map());

  const fetchPnl = useCallback(async (from?: string, to?: string, period?: string, cacheKey?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (period) params.set("period", period);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const key = cacheKey || `pnl:${qs}`;
    const cached = pnlCache.current.get(key);
    if (cached) return cached;
    const res = await fetch(`/api/income-statement${qs}`);
    const data = await res.json();
    pnlCache.current.set(key, data);
    return data;
  }, []);

  const fetchCf = useCallback(async (p: string) => {
    const key = `cf:${p}`;
    const cached = cfCache.current.get(key);
    if (cached) return cached;
    const res = await fetch(`/api/cash-flow?period=${p}`);
    const data = await res.json();
    cfCache.current.set(key, data);
    return data;
  }, []);

  const fetchBudget = useCallback(async (from?: string, to?: string, cacheKey?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const key = cacheKey || `budget:${qs}`;
    const cached = budgetCache.current.get(key);
    if (cached) return cached;
    const res = await fetch(`/api/budget${qs}`);
    const data = await res.json();
    budgetCache.current.set(key, data);
    return data;
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
      .finally(() => {
        setLoading(false);
        // Prefetch QTD and YTD P&L in background
        const d = new Date();
        const todayStr = d.toISOString().split("T")[0];
        const q = Math.floor(d.getMonth() / 3) * 3;
        const qtdFrom = `${d.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
        const ytdFrom = `${d.getFullYear()}-01-01`;
        fetchPnl(qtdFrom, todayStr, "qtd").catch(() => {});
        fetchPnl(ytdFrom, todayStr, "ytd").catch(() => {});
        fetchCf("ytd").catch(() => {});
      });
  }, [fetchPnl, fetchCf, fetchBudget]);

  async function handlePnlRange(from: string, to: string, period: string) {
    const key = `pnl:?from=${from}&to=${to}&period=${period}`;
    const cached = pnlCache.current.get(key);
    if (cached) {
      setPnlData(cached);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await fetchPnl(from, to, period, key);
      setPnlData(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleCfPeriod(p: "mtd" | "ytd") {
    setCfPeriod(p);
    const key = `cf:${p}`;
    const cached = cfCache.current.get(key);
    if (cached) {
      setCfData(cached);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await fetchCf(p);
      setCfData(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleBudgetRange(from: string, to: string) {
    const key = `budget:?from=${from}&to=${to}`;
    const cached = budgetCache.current.get(key);
    if (cached) {
      setBudgetData(cached);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await fetchBudget(from, to, key);
      setBudgetData(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
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
      </div>
      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "pnl" && pnlData && (
            <ExportButtons
              fileName="PnL_Report"
              title="Income Statement (P&L)"
              headers={["Account #", "Account Name", "Type", "Amount"]}
              rows={(pnlData.accounts || []).map((a) => [a.number, a.name, a.type, a.amount < 0 ? `(${fmt(Math.abs(a.amount))})` : fmt(a.amount)])}
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
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
            <>
              {budgetData && !budgetData.hasBudget && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">View</span>
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                    <button
                      onClick={() => setBudgetMode("all")}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        budgetMode === "all"
                          ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      All items
                    </button>
                    <button
                      onClick={() => setBudgetMode("operating")}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        budgetMode === "operating"
                          ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Operating only
                    </button>
                  </div>
                </div>
              )}
              <DateRangePicker onRangeChange={(from, to) => handleBudgetRange(from, to)} />
            </>
          )}
        </div>
      </div>

      {/* Refresh indicator bar */}
      {refreshing && (
        <div className="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
          <div className="h-full bg-teal-500 animate-pulse w-full" />
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : (
        <div className={refreshing ? "opacity-75 transition-opacity" : ""}>
          {activeTab === "pnl" && pnlData && <PnlTab data={pnlData} />}
          {activeTab === "cashflow" && cfData && <CashFlowTab data={cfData} />}
          {activeTab === "budget" && budgetData && <BudgetTab data={budgetData} mode={budgetMode} />}
        </div>
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
        <SimpleKpiCard label="Total Income" value={fmtK(data.totalIncome)} color="text-green-600" href="#section-income" />
        <SimpleKpiCard label="Total Expenses" value={fmtK(data.totalExpenses)} color="text-red-600" href="#section-expenses" />
        <SimpleKpiCard label="Net Income" value={fmtK(data.netIncome)} color={data.netIncome >= 0 ? "text-green-600" : "text-red-600"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AccountTable title="Income" accounts={incomeAccounts} dateFrom={data.period?.from} dateTo={data.period?.to} />
        <AccountTable title="Expenses" accounts={expenseAccounts} dateFrom={data.period?.from} dateTo={data.period?.to} />
      </div>
    </>
  );
}

interface DetailTransaction {
  date: string;
  vendor: string;
  property: string;
  description: string;
  amount: number;
}

function AccountTable({ title, accounts, dateFrom, dateTo }: { title: string; accounts: Account[]; dateFrom?: string; dateTo?: string }) {
  const isExpenseTable = title === "Expenses";
  const sorted = [...accounts].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
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
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    fetch(`/api/property-pnl/detail?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setDetail(d.transactions || []);
        if (d.total !== undefined) setExpandedTotal(Math.abs(d.total));
      })
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  const total = Math.abs(sorted.reduce((s, a) => s + a.amount, 0));

  return (
    <div id={`section-${title.toLowerCase()}`} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className={`text-sm font-mono font-semibold ${isExpenseTable ? "text-red-600" : "text-green-600"}`}>
          ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
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
            {sorted.map((a) => {
              const isOpen = expanded === a.number;
              const isCredit = isExpenseTable && a.amount < 0;
              return (
                <Fragment key={a.number}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                    onClick={() => toggleDrillDown(a.number, a.amount)}
                  >
                    <td className="px-6 py-2 text-gray-700 dark:text-gray-300">
                      <span className="text-xs text-gray-400 mr-1">{isOpen ? "▼" : "▶"}</span>
                      <span className="text-xs text-gray-400 mr-2">{a.number}</span>
                      {a.name}
                      {isCredit && <span className="ml-1 text-xs text-green-600 font-medium">(credit)</span>}
                    </td>
                    <td className={`px-6 py-2 text-right font-mono ${isCredit ? "text-green-600" : (isExpenseTable ? "text-red-600" : "text-green-600")}`}>
                      {isCredit ? `(${fmt(Math.abs(a.amount))})` : fmt(Math.abs(a.amount))}
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
                  <th className="text-left px-6 py-2 font-semibold text-gray-600 dark:text-gray-300">Account</th>
                  <th className="text-right px-6 py-2 font-semibold text-gray-600 dark:text-gray-300">Amount</th>
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
      className={`rounded-xl p-4 md:p-5 shadow-sm border text-center ${
        highlight
          ? "bg-gray-900 dark:bg-gray-700 border-gray-700"
          : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700"
      }`}
    >
      <p className={`text-xs font-medium uppercase tracking-wide ${highlight ? "text-gray-400" : "text-gray-500"}`}>
        {label}
      </p>
      <p className={`font-bold mt-1 ${highlight ? (value >= 0 ? "text-green-400" : "text-red-400") : value >= 0 ? "text-green-600" : "text-red-600"}`} style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>
        {fmtK(value)}
      </p>
    </div>
  );
}

/* ── Budget / YoY Tab ── */
function BudgetTab({ data, mode }: { data: BudgetData; mode: "all" | "operating" }) {
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

  // Use API-authoritative totals in "all" mode; client-computed sums in "operating" mode
  const filteredIncome = incomeAccounts
    .filter((a) => !isExcluded(a.number))
    .reduce((sum, a) => sum + (a.ytd || 0), 0);
  const filteredIncomeLY = incomeAccounts
    .filter((a) => !isExcluded(a.number))
    .reduce((sum, a) => sum + (a.lastYearYtd || 0), 0);

  const operatingIncome = mode === "all" && yoy ? yoy.totalIncome : filteredIncome;
  const operatingIncomeLY = mode === "all" && yoy ? yoy.lastYearIncome : filteredIncomeLY;
  const totalExpensesYtd = yoy ? yoy.totalExpenses : expenseAccounts.reduce((sum, a) => sum + Math.abs(a.ytd || 0), 0);
  const totalExpensesLY = yoy ? yoy.lastYearExpenses : expenseAccounts.reduce((sum, a) => sum + Math.abs(a.lastYearYtd || 0), 0);
  const debtServiceYtd = expenseAccounts
    .filter((a) => isDebtService(a.number))
    .reduce((sum, a) => sum + Math.abs(a.ytd || 0), 0);
  const debtServiceLY = expenseAccounts
    .filter((a) => isDebtService(a.number))
    .reduce((sum, a) => sum + Math.abs(a.lastYearYtd || 0), 0);

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

  const noiWarning = noi < 0;
  const opexWarning = opexRatio > 70;
  const dscrWarning = debtServiceYtd > 0 && dscr < 1.25;

  return (
    <>
      {/* Operating KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <OperatingKpiCard
          label="Operating NOI"
          value={fmtK(noi)}
          sub={`LY: ${fmtK(noiLY)}`}
          change={fmtPct(noiChange)}
          positive={noiChange >= 0}
          warning={noiWarning}
          warningText={noiWarning ? "Negative NOI" : undefined}
        />
        <OperatingKpiCard
          label="OpEx Ratio"
          value={opexRatio.toFixed(1) + "%"}
          sub={`LY: ${opexRatioLY.toFixed(1)}%`}
          change={(opexRatio - opexRatioLY >= 0 ? "+" : "") + (opexRatio - opexRatioLY).toFixed(1) + "pp"}
          positive={opexRatio <= opexRatioLY}
          warning={opexWarning}
          warningText={opexWarning ? "Above 70% threshold" : undefined}
        />
        <OperatingKpiCard
          label="Debt Coverage"
          value={debtServiceYtd > 0 ? dscr.toFixed(2) + "x" : "N/A"}
          sub={debtServiceLY > 0 ? `LY: ${dscrLY.toFixed(2)}x` : ""}
          change={debtServiceYtd > 0 && debtServiceLY > 0 ? (dscr - dscrLY >= 0 ? "+" : "") + (dscr - dscrLY).toFixed(2) + "x" : ""}
          positive={dscr >= dscrLY}
          warning={dscrWarning}
          warningText={dscrWarning ? (dscr < 0 ? "Negative — NOI does not cover debt" : "Below 1.25x lender minimum") : undefined}
        />
        <OperatingKpiCard
          label="Income YoY"
          value={fmtPct(incomeYoY)}
          sub={`${fmtK(operatingIncome)} YTD`}
          change={mode === "operating" ? "excl. non-recurring" : "includes one-time items"}
          positive={incomeYoY >= 0}
          neutral
        />
      </div>

      {/* Info box in operating mode */}
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
  );
}

function OperatingKpiCard({
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
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Account</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Actual</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Budget</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Variance</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">%</th>
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
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <div className="flex items-end justify-center gap-4 mt-2">
        <div>
          <p className="font-bold text-gray-900 dark:text-white" style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>{fmtK(current)}</p>
          <p className="text-xs text-gray-500 mt-1">Last year: {fmtK(lastYear)}</p>
        </div>
        <span className={`text-lg font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
          {fmtPct(change)}
        </span>
      </div>
    </div>
  );
}

function YoYTable({ title, accounts, invertColor, mode }: { title: string; accounts: BudgetAccount[]; invertColor?: boolean; mode: "all" | "operating" }) {
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
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Account</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">This Month</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">YTD</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Last Year YTD</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">YoY Change</th>
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

/* ── Shared ── */
function SimpleKpiCard({ label, value, color, href }: { label: string; value: string; color: string; href?: string }) {
  const inner = (
    <>
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className={`font-bold mt-1 ${color}`} style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>{value}</p>
    </>
  );
  const base = "bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center";
  if (href) {
    const tint = color.includes("green") ? "kpi-green" : color.includes("red") ? "kpi-red" : "kpi-neutral";
    return <a href={href} className={`${base} kpi-card-link ${tint}`}>{inner}</a>;
  }
  return <div className={base}>{inner}</div>;
}
