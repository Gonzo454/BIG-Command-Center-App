"use client";

import { useEffect, useState, useRef } from "react";
import { ExportButtons } from "@/components/ExportButtons";

interface Lease {
  property: string;
  unit: string;
  tenant: string;
  leaseEnd: string;
  daysUntil: number;
  rent: number;
  marketRent: number;
  pastDue: number;
}

interface Buckets {
  expired: Lease[];
  within30: Lease[];
  within60: Lease[];
  within90: Lease[];
  within180: Lease[];
  beyond180: Lease[];
}

interface Summary {
  totalLeases: number;
  expiringWithin90: number;
  totalRentAtRisk: number;
}

const fmt = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const bucketConfig = [
  { key: "expired", label: "Expired", color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50 dark:bg-red-900/20" },
  { key: "within30", label: "0-30 Days", color: "bg-orange-500", textColor: "text-orange-700", bgColor: "bg-orange-50 dark:bg-orange-900/20" },
  { key: "within60", label: "31-60 Days", color: "bg-yellow-500", textColor: "text-yellow-700", bgColor: "bg-yellow-50 dark:bg-yellow-900/20" },
  { key: "within90", label: "61-90 Days", color: "bg-blue-500", textColor: "text-blue-700", bgColor: "bg-blue-50 dark:bg-blue-900/20" },
  { key: "within180", label: "91-180 Days", color: "bg-green-500", textColor: "text-green-700", bgColor: "bg-green-50 dark:bg-green-900/20" },
  { key: "beyond180", label: "180+ Days", color: "bg-gray-400", textColor: "text-gray-600", bgColor: "bg-gray-50 dark:bg-gray-800" },
] as const;

export default function LeaseExpirationsPage() {
  const [buckets, setBuckets] = useState<Buckets | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetch("/api/lease-expirations")
      .then((r) => r.json())
      .then((d) => {
        setBuckets(d.buckets || null);
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
            Lease Expiration Schedule
          </h1>
          <p className="text-sm text-gray-500 mt-1">Upcoming lease renewals and expirations</p>
        </div>
        {buckets && (() => {
          const allLeases = bucketConfig.flatMap((cfg) => buckets[cfg.key]);
          return allLeases.length > 0 ? (
            <ExportButtons
              fileName="Lease_Expirations"
              title="Lease Expiration Schedule"
              headers={["Property", "Unit", "Tenant", "Lease End", "Days Until", "Rent"]}
              rows={allLeases.map((l) => [
                l.property, l.unit, l.tenant, l.leaseEnd,
                l.daysUntil, l.rent > 0 ? fmt(l.rent) : "\u2014",
              ])}
            />
          ) : null;
        })()}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 uppercase">Total Active Leases</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summary?.totalLeases || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 uppercase">Expiring Within 90 Days</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{summary?.expiringWithin90 || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 uppercase">Monthly Rent at Risk</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                ${(summary?.totalRentAtRisk || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* Distribution Bar */}
          {buckets && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Expiration Distribution</h3>
              <div className="flex rounded-lg overflow-hidden h-8">
                {bucketConfig.map((cfg) => {
                  const count = buckets[cfg.key].length;
                  const pct = summary?.totalLeases ? (count / summary.totalLeases) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={cfg.key}
                      className={`${cfg.color} flex items-center justify-center text-white text-xs font-medium`}
                      style={{ width: `${pct}%` }}
                      title={`${cfg.label}: ${count} leases`}
                    >
                      {pct >= 8 ? count : ""}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-4 mt-2">
                {bucketConfig.map((cfg) => (
                  <div key={cfg.key} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`w-3 h-3 rounded ${cfg.color}`} />
                    {cfg.label} ({buckets[cfg.key].length})
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bucket Tables */}
          {buckets &&
            bucketConfig.map((cfg) => {
              const leases = buckets[cfg.key];
              if (leases.length === 0) return null;
              return (
                <div
                  key={cfg.key}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
                >
                  <div className={`px-6 py-3 border-b border-gray-100 dark:border-gray-700 ${cfg.bgColor}`}>
                    <h3 className={`font-semibold ${cfg.textColor}`}>
                      {cfg.label} — {leases.length} lease{leases.length !== 1 ? "s" : ""}
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Property</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Unit</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Tenant</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Lease End</th>
                          <th className="text-right px-4 py-2 font-medium text-gray-500">Days</th>
                          <th className="text-right px-4 py-2 font-medium text-gray-500">Rent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {leases.map((l, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                            <td className="px-4 py-2 text-gray-900 dark:text-white">{l.property}</td>
                            <td className="px-4 py-2 text-gray-600">{l.unit}</td>
                            <td className="px-4 py-2 text-gray-600">{l.tenant}</td>
                            <td className="px-4 py-2 text-gray-600">{l.leaseEnd}</td>
                            <td className={`px-4 py-2 text-right font-mono ${l.daysUntil < 0 ? "text-red-600 font-bold" : "text-gray-900 dark:text-white"}`}>
                              {l.daysUntil}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">
                              {l.rent > 0 ? fmt(l.rent) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
        </>
      )}
    </div>
  );
}
