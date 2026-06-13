"use client";

import { LoadingState } from "@/components/LoadingState";
import { useEffect, useState, useRef, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DateRangePicker } from "@/components/DateRangePicker";
import { resolvePersistedRange } from "@/lib/date-range";
import { ProfitGauge } from "@/components/ProfitGauge";
import { ExportButtons } from "@/components/ExportButtons";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { fetchJsonRetry, apiJson } from "@/lib/fetchRetry";

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

interface CapitalAccount {
  name: string;
  number: string;
  amount: number;
}

interface CashAccount {
  name: string;
  number: string;
  balance: number;
}

interface CashAccountsData {
  asOf: string;
  operating: CashAccount[];
  escrow: CashAccount[];
  totalOperating: number;
  totalEscrow: number;
}

interface PropertyPnl {
  propertyName: string;
  totalIncome: number;
  totalExpenses: number;
  debtService?: number;
  noi?: number;
  netIncome: number;
  accounts: Account[];
  capitalAccounts?: CapitalAccount[];
  totalCapital?: number;
}

interface KPIProperty {
  name: string;
  slug: string;
  assetClass: string;
  assetClassLabel: string;
  managedOnly: boolean;
  ownershipPct: number;
  revenue: number;
  expenses: number;
  noi: number;
  noiMargin: number;
  netAfterDebt: number | null;
  totalUnits: number;
  occupied: number;
  vacant: number;
  occupancyRate: number;
  totalSqft: number;
  occupiedSqft: number;
  vacancyLoss: number;
  debtService: number;
  dscr: number;
  oer: number;
  walt: number | null;
  leaseExposure12mo: number;
  rentPerSf: number | null;
  collectionRate: number;
  delinquent: number;
  status: "Strong" | "Stable" | "Review";
  targets: {
    oer: string;
    noiMargin: string;
    dscrMin: number;
    waltYears: number | null;
    occupancy: number;
  };
}

const fmt = (n: number) =>
  "$" +
  Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawSlug = params.slug as string;
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }

  // Park Vista financials live in the dedicated PV AppFolio database
  useEffect(() => {
    if (slug.toLowerCase().startsWith("park vista")) {
      router.replace("/pv/dashboard");
    }
  }, [slug, router]);
  const [data, setData] = useState<PropertyPnl | null>(null);
  const [kpi, setKpi] = useState<KPIProperty | null>(null);
  const [cashData, setCashData] = useState<CashAccountsData | null>(null);
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

      const json = await fetchJsonRetry<PropertyPnl>(
        `/api/property-pnl?${qp.toString()}`,
        3,
        2000
      );
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
      const persisted = resolvePersistedRange();
      if (persisted && persisted.period !== "mtd") {
        fetchData(persisted.from, persisted.to, persisted.period);
      } else {
        fetchData();
      }
      apiJson(`/api/cash-accounts?property=${encodeURIComponent(slug)}`)
        .then((d) => {
          if (!d.error) setCashData(d);
        })
        .catch(console.error);
      apiJson("/api/kpi-dashboard")
        .then((d) => {
          const match = (d.properties || []).find(
            (c: KPIProperty & { slug: string }) =>
              c.name === slug || c.slug === slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
          );
          if (match) setKpi(match);
        })
        .catch(console.error);
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {slug}
            </h1>
            {kpi && (
              <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold ${kpi.status === "Strong" ? "bg-emerald-100 text-emerald-800" : kpi.status === "Review" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>
                {kpi.status}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Financial Dashboard
          </p>
          {kpi && (
            <>
              <p className="text-xs text-gray-400 mt-1">
                <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 mr-2">{kpi.assetClassLabel}</span>
                {kpi.occupancyRate}% Occupancy &middot; {kpi.totalSqft > 0 ? `${kpi.occupiedSqft.toLocaleString()} / ${kpi.totalSqft.toLocaleString()} SF` : `${kpi.occupied}/${kpi.totalUnits} units`}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center rounded-lg border border-[#E07B2A] overflow-hidden">
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
        <LoadingState />
      ) : error ? (
        <div className="text-center py-20 text-red-500">{error}</div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total Revenue"
              value={data.totalIncome}
              color="text-green-600"
              href="#section-income"
            />
            <KpiCard
              label="NOI"
              value={data.noi ?? data.netIncome}
              color={(data.noi ?? data.netIncome) >= 0 ? "text-emerald-600" : "text-red-600"}
            />
            <KpiCard
              label={data.debtService ? "Net After Debt Svc" : "Net Income"}
              value={data.netIncome}
              color={data.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}
            />
            <KpiCard
              label="Total Expenses"
              value={data.totalExpenses}
              color="text-red-600"
              href="#section-expenses"
            />
          </div>

          {/* Financial Health Metrics — tailored to asset class */}
          {kpi && (() => {
            const ac = kpi.assetClass;
            const isCommercial = ["office_fsg", "office_mg", "retail_gross", "retail_nnn", "industrial"].includes(ac);
            const isResidential = ac === "residential";
            const isLand = ac === "land";
            const isMgmt = ac === "mgmt_company";
            const showDebt = !kpi.managedOnly && !isMgmt;
            const showOccupancy = !isLand && !isMgmt;
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <MiniMetric label="NOI Margin" value={`${kpi.noiMargin}%`} target={kpi.targets.noiMargin} good={kpi.noiMargin >= parseFloat(kpi.targets.noiMargin)} />
                {showDebt && (
                  <MiniMetric label="DSCR" value={kpi.dscr > 0 ? `${kpi.dscr}x` : "—"} target={`≥${kpi.targets.dscrMin}x`} good={kpi.dscr >= kpi.targets.dscrMin || kpi.dscr === 0} />
                )}
                <MiniMetric label="OER" value={`${kpi.oer}%`} target={kpi.targets.oer} good={kpi.oer <= parseFloat(kpi.targets.oer.split("–")[1])} />
                {showOccupancy && (
                  <MiniMetric label="Occupancy" value={`${kpi.occupancyRate}%`} target={`≥${kpi.targets.occupancy}%`} good={kpi.occupancyRate >= kpi.targets.occupancy} />
                )}
                {isCommercial && kpi.walt !== null && (
                  <MiniMetric label="WALT" value={`${kpi.walt} yrs`} target={kpi.targets.waltYears ? `≥${kpi.targets.waltYears} yrs` : "—"} good={!kpi.targets.waltYears || kpi.walt >= kpi.targets.waltYears} />
                )}
                <MiniMetric label="Collection" value={`${kpi.collectionRate}%`} target="≥95%" good={kpi.collectionRate >= 95} />
                {(isResidential || isCommercial) && kpi.delinquent > 0 && (
                  <MiniMetric label="Delinquent" value={`$${Math.abs(kpi.delinquent).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} target="Minimize" good={kpi.delinquent < 10000} />
                )}
                {isCommercial && kpi.leaseExposure12mo > 0 && (
                  <MiniMetric label="Lease Exp. 12mo" value={`${kpi.leaseExposure12mo}%`} target="<25%" good={kpi.leaseExposure12mo < 25} />
                )}
                {isCommercial && kpi.rentPerSf !== null && (
                  <MiniMetric label="Rent/SF" value={`$${kpi.rentPerSf.toFixed(2)}`} target="In-place" good={true} />
                )}
                {isCommercial && (
                  <MiniMetric label="Vacancy Loss" value={`$${Math.abs(kpi.vacancyLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} target="Minimize" good={kpi.vacancyLoss < 50000} />
                )}
              </div>
            );
          })()}

          {/* Revenue & Expense Breakdown Bars */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BreakdownPanel title="Revenue Breakdown" accounts={incomeAccounts} total={data.totalIncome} color="emerald" />
            <BreakdownPanel title="Expense Breakdown" accounts={expenseAccounts} total={data.totalExpenses} color="red" />
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

          {/* Capital Activity */}
          {data.capitalAccounts && data.capitalAccounts.length > 0 && (
            <PropertyCapitalPanel accounts={data.capitalAccounts} total={data.totalCapital || 0} />
          )}

          {/* Bank & Escrow Accounts */}
          {cashData && (cashData.operating.length > 0 || cashData.escrow.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CashAccountPanel title="Operating Accounts" accounts={cashData.operating} total={cashData.totalOperating} asOf={cashData.asOf} />
              <CashAccountPanel title="Escrow & Reserve Accounts" accounts={cashData.escrow} total={cashData.totalEscrow} asOf={cashData.asOf} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function CashAccountPanel({
  title,
  accounts,
  total,
  asOf,
}: {
  title: string;
  accounts: CashAccount[];
  total: number;
  asOf: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Balances as of {asOf}</p>
        </div>
        <p className={`text-sm font-mono font-semibold ${total >= 0 ? "text-green-600" : "text-red-600"}`}>
          {total < 0 ? "-" : ""}${Math.abs(total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
      {accounts.length === 0 ? (
        <p className="px-6 py-4 text-sm text-gray-400">No accounts with balances</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Account</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {accounts.map((a) => (
              <tr key={a.number} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                  <span className="text-xs text-gray-400 mr-1">{a.number}</span>
                  {a.name}
                </td>
                <td className={`px-4 py-2 text-right font-mono ${a.balance >= 0 ? "text-gray-900 dark:text-white" : "text-red-600"}`}>
                  {a.balance < 0 ? "-" : ""}${Math.abs(a.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
    apiJson(`/api/property-pnl/detail?${params.toString()}`)
      .then((d) => {
        setDetail(d.transactions || []);
        if (d.total !== undefined) setExpandedAccountTotal(Math.abs(d.total));
      })
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  const sorted = accounts.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

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
              const isCredit = isExpense && a.amount < 0;
              const rowColor = isCredit ? "text-green-600" : (isExpense ? "text-red-600" : "text-green-600");
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
                      {isCredit && <span className="ml-1 text-xs text-green-600 font-medium">(credit)</span>}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${rowColor}`}>
                      {isCredit ? `(${fmt(Math.abs(a.amount))})` : fmt(a.amount)}
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
    </CollapsiblePanel>
  );
}

function PropertyCapitalPanel({ accounts, total }: { accounts: { name: string; number: string; amount: number }[]; total: number }) {
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
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Account</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map((a) => (
              <tr key={a.number} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                  <span className="text-xs text-gray-400 mr-1">{a.number}</span>
                  {a.name}
                  <span className={`ml-1 text-xs font-medium ${a.amount > 0 ? "text-blue-600" : "text-orange-600"}`}>
                    ({a.amount > 0 ? "contribution" : "distribution"})
                  </span>
                </td>
                <td className={`px-4 py-2 text-right font-mono ${a.amount > 0 ? "text-blue-600" : "text-orange-600"}`}>
                  {a.amount > 0 ? "" : "-"}${Math.abs(a.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </CollapsiblePanel>
  );
}

function KpiCard({
  label,
  value,
  color,
  href,
}: {
  label: string;
  value: number;
  color: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`font-bold mt-1 ${color}`} style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>
        {value < 0
          ? `($${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })})`
          : `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
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

function MiniMetric({ label, value, target, good }: { label: string; value: string; target: string; good: boolean }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${good ? "text-emerald-600" : "text-amber-600"}`}>{value}</p>
      <p className="text-[10px] text-gray-400">Target: {target}</p>
    </div>
  );
}

function BreakdownPanel({ title, accounts, total, color }: { title: string; accounts: Account[]; total: number; color: "emerald" | "red" }) {
  const sorted = accounts.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 8);
  const barColor = color === "emerald" ? "bg-emerald-500" : "bg-red-400";
  const totalColor = color === "emerald" ? "text-emerald-600" : "text-red-600";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <span className={`font-mono text-sm font-bold ${totalColor}`}>
          ${Math.abs(total).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
      <div className="p-4">
        {sorted.map((a) => {
          const absAmount = Math.abs(a.amount);
          const pct = total > 0 ? (absAmount / total) * 100 : 0;
          const isCredit = color === "red" && a.amount < 0;
          return (
            <div key={a.number} className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 dark:text-gray-300 truncate mr-2">
                  {a.name}
                  {isCredit && <span className="text-green-600 text-xs ml-1">(credit)</span>}
                </span>
                <span className={`font-mono whitespace-nowrap ${isCredit ? "text-green-600" : "text-gray-600"}`}>
                  {isCredit ? `($${absAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })})` : `$${absAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  <span className="text-gray-400 text-xs ml-1">({pct.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${isCredit ? "bg-green-400" : barColor} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
