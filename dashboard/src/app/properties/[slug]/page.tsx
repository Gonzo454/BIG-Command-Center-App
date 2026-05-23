"use client";

import { useEffect, useState, useRef } from "react";
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

interface PropertyPnl {
  propertyName: string;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  accounts: Account[];
}

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

  async function fetchData(from?: string, to?: string, period?: string) {
    setLoading(true);
    setError(null);
    try {
      const qp = new URLSearchParams();
      qp.set("property", slug);
      if (from) qp.set("from", from);
      if (to) qp.set("to", to);
      if (period) qp.set("period", period);

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
        <div className="flex items-center gap-3">
          {data && data.accounts.length > 0 && (
            <ExportButtons
              fileName={`Property_PnL_${slug.replace(/[^a-zA-Z0-9]/g, "_")}`}
              title={`${slug} — Income Statement`}
              headers={["Account #", "Account Name", "Type", "Amount"]}
              rows={[
                ...data.accounts
                  .filter((a) => a.type === "income")
                  .sort((a, b) => b.amount - a.amount)
                  .map((a) => [a.number, a.name, "Income", `$${a.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]),
                ["" , "Total Income", "", `$${data.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ...data.accounts
                  .filter((a) => a.type === "expense")
                  .sort((a, b) => b.amount - a.amount)
                  .map((a) => [a.number, a.name, "Expense", `$${a.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]),
                ["", "Total Expenses", "", `$${data.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ["", "Net Income", "", `$${data.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
              ]}
            />
          )}
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
            {/* Income */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Income
                </h3>
                <p className="text-sm text-green-600 font-mono">
                  ${data.totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">
                        Account
                      </th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {incomeAccounts
                      .sort((a, b) => b.amount - a.amount)
                      .map((a) => (
                        <tr key={a.number + a.name}>
                          <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                            <span className="text-xs text-gray-400 mr-1">
                              {a.number}
                            </span>
                            {a.name}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-green-600">
                            ${a.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    {incomeAccounts.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-4 text-center text-gray-400">
                          No income accounts
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expenses */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Expenses
                </h3>
                <p className="text-sm text-red-600 font-mono">
                  ${data.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">
                        Account
                      </th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {expenseAccounts
                      .sort((a, b) => b.amount - a.amount)
                      .map((a) => (
                        <tr key={a.number + a.name}>
                          <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                            <span className="text-xs text-gray-400 mr-1">
                              {a.number}
                            </span>
                            {a.name}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-red-600">
                            ${a.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    {expenseAccounts.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-4 text-center text-gray-400">
                          No expense accounts
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
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
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>
        ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}
