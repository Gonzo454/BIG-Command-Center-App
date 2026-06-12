"use client";

import { apiJson } from "@/lib/fetchRetry";
import { LoadingState } from "@/components/LoadingState";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface Property {
  name: string;
  netAmount: number;
  endingBalance: number;
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      apiJson("/api/account-totals")
        .then((data) => setProperties(data.properties || []))
        .finally(() => setLoading(false));
    }
  }, []);

  const totalNet = properties.reduce((sum, p) => sum + p.netAmount, 0);
  const profitable = properties.filter((p) => p.netAmount > 0).length;
  const unprofitable = properties.filter((p) => p.netAmount < 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Properties
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {properties.length} properties • {profitable} profitable • {unprofitable} unprofitable
        </p>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard label="Total Net Amount" value={totalNet} />
            <SummaryCard label="Profitable Properties" value={profitable} isCurrency={false} color="text-green-600" />
            <SummaryCard label="Unprofitable Properties" value={unprofitable} isCurrency={false} color="text-red-600" />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Property</th>
                  <th className="text-right px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Net Amount</th>
                  <th className="text-right px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Ending Balance</th>
                  <th className="text-center px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {properties
                  .sort((a, b) => b.netAmount - a.netAmount)
                  .map((p) => (
                    <tr key={p.name} className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                        <Link
                          href={p.name === "Badger Hotel Group" ? "/hotel/dashboard" : `/properties/${encodeURIComponent(p.name)}`}
                          className="text-blue-600 hover:underline"
                        >
                          {p.name}
                          {p.name === "Badger Hotel Group" && (
                            <span className="ml-2 text-xs text-gray-400">🛎️</span>
                          )}
                        </Link>
                      </td>
                      <td className={`px-6 py-4 text-right font-mono ${p.netAmount >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {p.netAmount >= 0 ? "+" : ""}${Math.abs(p.netAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-gray-600 dark:text-gray-400">
                        ${p.endingBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-block w-3 h-3 rounded-full ${p.netAmount > 0 ? "bg-green-500" : p.netAmount === 0 ? "bg-yellow-500" : "bg-red-500"}`} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, isCurrency = true, color }: { label: string; value: number; isCurrency?: boolean; color?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || (value >= 0 ? "text-green-600" : "text-red-600")}`}>
        {isCurrency ? `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : value}
      </p>
    </div>
  );
}
