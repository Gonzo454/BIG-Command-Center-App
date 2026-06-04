"use client";

import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExportButtons } from "@/components/ExportButtons";

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

interface Summary {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
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

interface HotelPnlData {
  summary: Summary;
  revenueAccounts: Account[];
  expenseAccounts: Account[];
}

export default function HotelPnlPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueAccounts, setRevenueAccounts] = useState<Account[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const initialized = useRef(false);
  const dataCache = useRef<Map<string, HotelPnlData>>(new Map());

  const load = useCallback(
    (fromDate?: string, toDate?: string, period?: string) => {
      const key = `${fromDate || "default"}:${toDate || "default"}:${period || "ytd"}`;
      const cached = dataCache.current.get(key);
      if (cached) {
        setSummary(cached.summary);
        setRevenueAccounts(cached.revenueAccounts);
        setExpenseAccounts(cached.expenseAccounts);
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
      fetch(`/api/hotel${qs}`)
        .then((r) => r.json())
        .then((d) => {
          const data: HotelPnlData = {
            summary: d.summary || null,
            revenueAccounts: d.revenueAccounts || [],
            expenseAccounts: d.expenseAccounts || [],
          };
          dataCache.current.set(key, data);
          setSummary(data.summary);
          setRevenueAccounts(data.revenueAccounts);
          setExpenseAccounts(data.expenseAccounts);
        })
        .catch(console.error)
        .finally(() => { setLoading(false); setRefreshing(false); });
    },
    []
  );

  const prefetch = useCallback((fromDate: string, toDate: string, period: string) => {
    const key = `${fromDate}:${toDate}:${period}`;
    if (dataCache.current.has(key)) return;
    const params = new URLSearchParams({ from: fromDate, to: toDate, period });
    fetch(`/api/hotel?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        dataCache.current.set(key, {
          summary: d.summary || null,
          revenueAccounts: d.revenueAccounts || [],
          expenseAccounts: d.expenseAccounts || [],
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    load();
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
    ...expenseAccounts.map((a) => ({ ...a, section: "Expense", ytd: Math.abs(a.ytd), mtd: Math.abs(a.mtd) })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Badger Hotel — P&L Statement
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Profit & Loss for Badger Hotel Group
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {allRows.length > 0 && (
          <ExportButtons
            fileName="Badger_Hotel_PnL"
            title="Badger Hotel P&L Statement"
            headers={["Section", "Account", "Number", "MTD", "YTD"]}
            rows={allRows.map((a) => [a.section, a.name, a.number, fmt(a.mtd), fmt(a.ytd)])}
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
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : !summary ? (
        <div className="text-center py-20 text-gray-500">No data available</div>
      ) : (
        <div className={refreshing ? "opacity-75 transition-opacity" : ""}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Total Revenue" value={fmtK(totalRevenue)} color="text-green-600" />
            <KpiCard label="Total Expenses" value={fmtK(totalExpenses)} color="text-red-600" />
            <KpiCard label="Net Income" value={fmtK(netIncome)} color={netIncome >= 0 ? "text-green-600" : "text-red-600"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <AccountPanel title="Revenue" accounts={revenueAccounts} total={totalRevenue} isExpense={false} from={from} to={to} />
            <AccountPanel title="Expenses" accounts={expenseAccounts} total={totalExpenses} isExpense from={from} to={to} />
          </div>
        </div>
      )}
    </div>
  );
}

function AccountPanel({
  title, accounts, total, isExpense, from, to,
}: {
  title: string; accounts: Account[]; total: number; isExpense: boolean; from?: string; to?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Transaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedAccountTotal, setExpandedAccountTotal] = useState(0);

  function toggleDrillDown(accountNum: string, accountAmount: number) {
    if (expanded === accountNum) { setExpanded(null); setDetail([]); return; }
    setExpanded(accountNum);
    setExpandedAccountTotal(Math.abs(accountAmount));
    setDetailLoading(true);
    const params = new URLSearchParams({ account: accountNum, entity: "hotel" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/big-management/detail?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.transactions || []))
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  const sorted = accounts.slice().sort((a, b) => Math.abs(b.ytd) - Math.abs(a.ytd));
  const colorClass = isExpense ? "text-red-600" : "text-green-600";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className={`text-sm font-mono ${colorClass}`}>${Math.abs(total).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
      </div>
      <div className="max-h-[500px] overflow-y-auto">
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
              const displayAmount = isExpense ? Math.abs(a.ytd) : a.ytd;
              return (
                <Fragment key={a.number}>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer" onClick={() => toggleDrillDown(a.number, a.ytd)}>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      <span className="text-xs text-gray-400 mr-1">{isOpen ? "▼" : "▶"}</span>
                      <span className="text-xs text-gray-400 mr-1">{a.number}</span>
                      {a.name}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${colorClass}`}>{fmt(displayAmount)}</td>
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
                                  <th className="text-left py-1 pr-2 font-medium">Vendor</th>
                                  <th className="text-left py-1 pr-2 font-medium">Description</th>
                                  <th className="text-right py-1 font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {detail.map((t, i) => (
                                  <tr key={i} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                                    <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{t.date || "—"}</td>
                                    <td className="py-1 pr-2 text-gray-900 dark:text-white font-medium">{t.vendor}</td>
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
                                      <td colSpan={2} className="py-1 pr-2 text-gray-500 italic">Payroll, journal entries & other</td>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`font-bold mt-1 ${color}`} style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}>{value}</p>
    </div>
  );
}
