"use client";

import { apiJson } from "@/lib/fetchRetry";
import { LoadingState } from "@/components/LoadingState";
import { useEffect, useState, useRef } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { resolvePersistedRange } from "@/lib/date-range";
import { ExportButtons } from "@/components/ExportButtons";

interface Check {
  vendor: string;
  date: string;
  total: number;
  lineCount: number;
  lines: { gl: string; property: string; amount: number }[];
}

interface CheckData {
  checks: Check[];
  totalDisbursed: number;
  period: { from: string; to: string };
}

export default function VendorsPage() {
  const [data, setData] = useState<CheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const initialized = useRef(false);

  async function fetchData(from?: string, to?: string) {
    setLoading(true);
    const qs = from && to ? `?from=${from}&to=${to}` : "";
    try {
      setData(await apiJson(`/api/check-register${qs}`));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const persisted = resolvePersistedRange();
      if (persisted && persisted.period !== "mtd") {
        fetchData(persisted.from, persisted.to);
      } else {
        fetchData();
      }
    }
  }, []);

  // Group by vendor
  const vendorMap = new Map<string, { total: number; checks: Check[] }>();
  for (const check of data?.checks || []) {
    const existing = vendorMap.get(check.vendor) || { total: 0, checks: [] };
    existing.total += check.total;
    existing.checks.push(check);
    vendorMap.set(check.vendor, existing);
  }

  const vendors = Array.from(vendorMap.entries())
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vendors</h1>
        <p className="text-sm text-gray-500 mt-1">
          {vendors.length} vendors • ${(data?.totalDisbursed || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} total disbursed
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {vendors.length > 0 && (
          <ExportButtons
            fileName="Vendors"
            title="Vendor Disbursements"
            headers={["Vendor", "Checks", "Total"]}
            rows={vendors.map((v) => [
              v.name,
              v.checks.length,
              "$" + v.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            ])}
          />
        )}
        <div className="ml-auto">
          <DateRangePicker onRangeChange={(from, to) => fetchData(from, to)} />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Vendor</th>
                <th className="text-right px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Checks</th>
                <th className="text-right px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {vendors.map((v) => (
                <tr key={v.name}>
                  <td colSpan={3} className="p-0">
                    <button
                      onClick={() => setExpanded(expanded === v.name ? null : v.name)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 text-left"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">{v.name}</span>
                      <span className="flex items-center gap-6">
                        <span className="text-gray-500">{v.checks.length} checks</span>
                        <span className="font-mono font-bold text-gray-900 dark:text-white">
                          ${v.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-gray-400">{expanded === v.name ? "▼" : "▶"}</span>
                      </span>
                    </button>
                    {expanded === v.name && (
                      <div className="px-6 pb-4 bg-gray-50 dark:bg-gray-750">
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              <th className="text-left py-1 text-gray-500">Date</th>
                              <th className="text-left py-1 text-gray-500">GL Account</th>
                              <th className="text-left py-1 text-gray-500">Property</th>
                              <th className="text-right py-1 text-gray-500">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {v.checks.flatMap((c, ci) =>
                              c.lines.map((l, li) => (
                                <tr key={`${ci}-${li}`} className="border-t border-gray-200 dark:border-gray-600">
                                  <td className="py-1 text-gray-600">{li === 0 ? c.date : ""}</td>
                                  <td className="py-1 text-gray-600">{l.gl}</td>
                                  <td className="py-1 text-gray-600">{l.property}</td>
                                  <td className="py-1 text-right font-mono text-gray-900 dark:text-white">
                                    ${l.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
