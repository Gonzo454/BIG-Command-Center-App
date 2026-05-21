"use client";

import { useEffect, useState, useRef } from "react";

interface Unit {
  property: string;
  unit: string;
  tenant: string;
  status: string;
  marketRent: string;
  actualRent: string;
  moveIn: string;
  leaseEnd: string;
  balance: string;
}

interface RentData {
  units: Unit[];
  summary: { totalUnits: number; occupied: number; vacant: number };
}

export default function RentRollPage() {
  const [data, setData] = useState<RentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      fetch("/api/rent-roll")
        .then((r) => r.json())
        .then(setData)
        .finally(() => setLoading(false));
    }
  }, []);

  const filteredUnits = data?.units.filter(
    (u) =>
      u.property.toLowerCase().includes(filter.toLowerCase()) ||
      u.tenant.toLowerCase().includes(filter.toLowerCase()) ||
      u.unit.toLowerCase().includes(filter.toLowerCase())
  ) || [];

  const occupancyRate = data
    ? Math.round((data.summary.occupied / data.summary.totalUnits) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rent Roll</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data?.summary.totalUnits || 0} units • {occupancyRate}% occupancy
          </p>
        </div>
        <input
          type="text"
          placeholder="Search properties, units, tenants..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 w-72"
        />
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="Total Units" value={data?.summary.totalUnits || 0} />
            <StatCard label="Occupied" value={data?.summary.occupied || 0} color="text-green-600" />
            <StatCard label="Vacant" value={data?.summary.vacant || 0} color="text-red-600" />
            <StatCard label="Occupancy Rate" value={`${occupancyRate}%`} color="text-blue-600" />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Property</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Unit</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Tenant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Market Rent</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Actual Rent</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Lease End</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredUnits.map((u, i) => (
                    <tr key={`${u.property}-${u.unit}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{u.property}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{u.unit}</td>
                      <td className="px-4 py-2 text-gray-900 dark:text-white font-medium">{u.tenant || "—"}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                          u.status.toLowerCase() === "current"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {u.status || "Vacant"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-600">{u.marketRent || "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-600">{u.actualRent || "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{u.leaseEnd || "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-600">{u.balance || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || "text-gray-900 dark:text-white"}`}>{value}</p>
    </div>
  );
}
