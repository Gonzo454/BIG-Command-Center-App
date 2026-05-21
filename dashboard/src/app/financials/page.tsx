"use client";

import { useEffect, useState, useRef } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";

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

export default function FinancialsPage() {
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  async function fetchData(from?: string, to?: string, period?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (period) params.set("period", period);
    const qs = params.toString() ? `?${params.toString()}` : "";
    try {
      const res = await fetch(`/api/income-statement${qs}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
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

  const incomeAccounts = data?.accounts.filter((a) => a.type === "income") || [];
  const expenseAccounts = data?.accounts.filter((a) => a.type === "expense") || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Financial Reports
          </h1>
          <p className="text-sm text-gray-500 mt-1">Income Statement (P&L)</p>
        </div>
        <DateRangePicker onRangeChange={(from, to, period) => fetchData(from, to, period)} />
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 uppercase">Total Income</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                ${data.totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 uppercase">Total Expenses</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                ${data.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 uppercase">Net Income</p>
              <p className={`text-2xl font-bold mt-1 ${data.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                ${Math.abs(data.netIncome).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AccountTable title="Income" accounts={incomeAccounts} />
            <AccountTable title="Expenses" accounts={expenseAccounts} />
          </div>
        </>
      ) : null}
    </div>
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
                  ${Math.abs(a.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
