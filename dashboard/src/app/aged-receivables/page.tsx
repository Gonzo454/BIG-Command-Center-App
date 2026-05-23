"use client";

import { useEffect, useState, useRef } from "react";
import { ExportButtons } from "@/components/ExportButtons";

interface Tenant {
  tenant: string;
  property: string;
  unit: string;
  total: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  status: string;
}

interface Summary {
  totalReceivable: number;
  totalCurrent: number;
  total30: number;
  total60: number;
  total90: number;
  tenantCount: number;
}

const fmt = (n: number) =>
  "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AgedReceivablesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetch("/api/aged-receivables")
      .then((r) => r.json())
      .then((d) => {
        setTenants(d.tenants || []);
        setSummary(d.summary || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Aged Receivables
          </h1>
          <p className="text-sm text-gray-500 mt-1">Outstanding balances by aging bucket</p>
        </div>
        {tenants.length > 0 && (
          <ExportButtons
            fileName="Aged_Receivables"
            title="Aged Receivables"
            headers={["Tenant", "Property", "Unit", "Total", "Current", "31-60", "61-90", "90+"]}
            rows={tenants.map((t) => [
              t.tenant, t.property, t.unit,
              fmt(t.total), t.current !== 0 ? fmt(t.current) : "—",
              t.days30 !== 0 ? fmt(t.days30) : "—",
              t.days60 !== 0 ? fmt(t.days60) : "—",
              t.days90 !== 0 ? fmt(t.days90) : "—",
            ])}
          />
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard label="Total Receivable" value={summary?.totalReceivable || 0} color="text-gray-900 dark:text-white" />
            <SummaryCard label="Current (0-30)" value={summary?.totalCurrent || 0} color="text-green-600" />
            <SummaryCard label="31-60 Days" value={summary?.total30 || 0} color="text-yellow-600" />
            <SummaryCard label="61-90 Days" value={summary?.total60 || 0} color="text-orange-600" />
            <SummaryCard label="90+ Days" value={summary?.total90 || 0} color="text-red-600" />
          </div>

          {/* Tenant Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Tenant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Property</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Unit</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Current</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">31-60</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">61-90</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">90+</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {tenants.map((t, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{t.tenant}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{t.property}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{t.unit}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-gray-900 dark:text-white">
                        {fmt(t.total)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-green-600">
                        {t.current !== 0 ? fmt(t.current) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-yellow-600">
                        {t.days30 !== 0 ? fmt(t.days30) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-orange-600">
                        {t.days60 !== 0 ? fmt(t.days60) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-red-600">
                        {t.days90 !== 0 ? fmt(t.days90) : "—"}
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                        No outstanding receivables
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>
        ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}
