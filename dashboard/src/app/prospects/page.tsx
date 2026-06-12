"use client";

import { LoadingState } from "@/components/LoadingState";
import { apiJson } from "@/lib/fetchRetry";
import { useEffect, useState } from "react";
import Link from "next/link";
import summary from "@/data/prospect-summary.json";

interface TopProspect {
  priority: string;
  score: number;
  ownerName: string;
  propertyType: string;
  propertyAddress: string;
  municipality: string;
  ownerProximity: string;
  assessedValue: number;
}

const priorityColors: Record<string, string> = {
  "A+": "bg-green-100 text-green-800 border-green-200",
  A: "bg-blue-100 text-blue-800 border-blue-200",
  B: "bg-yellow-100 text-yellow-800 border-yellow-200",
  C: "bg-orange-100 text-orange-800 border-orange-200",
  D: "bg-gray-100 text-gray-600 border-gray-200",
};

const proximityColors: Record<string, string> = {
  "Out-of-State": "bg-red-50 text-red-700",
  "Greater Wisconsin": "bg-orange-50 text-orange-700",
  "Metro Area": "bg-yellow-50 text-yellow-700",
  "Dane County Local": "bg-blue-50 text-blue-700",
  "On-Site": "bg-gray-50 text-gray-600",
};

function fmt(n: number) {
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function ProspectDashboard() {
  const [topProspects, setTopProspects] = useState<TopProspect[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson("/api/prospects?limit=25&sortBy=score&sortDir=desc")
      .then((d) => setTopProspects(d.prospects))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const typeEntries = Object.entries(
    summary.propertyTypeCounts as Record<string, number>
  ).sort((a, b) => b[1] - a[1]);
  const proxEntries = Object.entries(
    summary.proximityCounts as Record<string, number>
  ).sort((a, b) => b[1] - a[1]);
  const priorityEntries = Object.entries(
    summary.priorityCounts as Record<string, number>
  );

  const typeStats = summary.typeValueStats as Record<
    string,
    { avg: number; total: number; count: number }
  >;

  const maxTypeCount = Math.max(...typeEntries.map(([, c]) => c));
  const maxProxCount = Math.max(...proxEntries.map(([, c]) => c));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Dane County Prospect Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Commercial property owners — BIG management candidates
          </p>
        </div>
        <Link
          href="/prospects/search"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Search All Prospects
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label="Total Prospects" value={summary.totalOwners.toLocaleString()} />
        <KpiCard
          label="Hot Leads (A+/A)"
          value={summary.hotLeads.toLocaleString()}
          accent="text-green-600"
        />
        <KpiCard
          label="Out-of-State"
          value={summary.outOfState.toLocaleString()}
          accent="text-red-600"
        />
        <KpiCard
          label="Total Assessed Value"
          value={fmt(summary.totalAssessedValue)}
          accent="text-blue-600"
        />
      </div>

      {/* Priority Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Priority Breakdown
        </h2>
        <div className="flex flex-wrap gap-3">
          {["A+", "A", "B", "C", "D"].map((tier) => {
            const count =
              priorityEntries.find(([k]) => k === tier)?.[1] || 0;
            return (
              <Link
                key={tier}
                href={`/prospects/search?priority=${encodeURIComponent(tier)}`}
                className={`px-4 py-3 rounded-lg border text-center min-w-[100px] hover:shadow-md transition-shadow ${priorityColors[tier] || "bg-gray-100"}`}
              >
                <p className="text-2xl font-bold">{count.toLocaleString()}</p>
                <p className="text-xs font-medium mt-1">Tier {tier}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Property Type Breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            By Property Type
          </h2>
          <div className="space-y-2">
            {typeEntries.map(([type, count]) => (
              <Link
                key={type}
                href={`/prospects/search?propertyType=${encodeURIComponent(type)}`}
                className="flex items-center gap-3 group"
              >
                <span className="w-44 text-sm text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-600 transition-colors">
                  {type}
                </span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.max((count / maxTypeCount) * 100, 8)}%`,
                    }}
                  >
                    <span className="text-xs text-white font-medium">
                      {count}
                    </span>
                  </div>
                </div>
                <span className="w-20 text-xs text-gray-500 text-right">
                  {typeStats[type]
                    ? fmt(typeStats[type].avg) + " avg"
                    : ""}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Owner Proximity */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            By Owner Proximity
          </h2>
          <div className="space-y-2">
            {proxEntries.map(([prox, count]) => (
              <Link
                key={prox}
                href={`/prospects/search?proximity=${encodeURIComponent(prox)}`}
                className="flex items-center gap-3 group"
              >
                <span className="w-44 text-sm text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-600 transition-colors">
                  {prox}
                </span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.max((count / maxProxCount) * 100, 8)}%`,
                    }}
                  >
                    <span className="text-xs text-white font-medium">
                      {count}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Target Segments for BIG
            </h3>
            <div className="space-y-2">
              {[
                {
                  label: "Out-of-State Industrial/Flex",
                  type: "Industrial/Flex",
                  prox: "Out-of-State",
                },
                {
                  label: "Out-of-State Office",
                  type: "Office",
                  prox: "Out-of-State",
                },
                {
                  label: "Out-of-State Retail",
                  type: "Retail",
                  prox: "Out-of-State",
                },
                {
                  label: "Remote Hotels",
                  type: "Hospitality",
                  prox: "Out-of-State",
                },
              ].map((seg) => (
                <Link
                  key={seg.label}
                  href={`/prospects/search?propertyType=${encodeURIComponent(seg.type)}&proximity=${encodeURIComponent(seg.prox)}`}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {seg.label}
                  </span>
                  <span className="text-xs font-medium text-blue-600">
                    View →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top 25 Prospects Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Top 25 Prospects
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Highest-scoring prospects by composite score
          </p>
        </div>
        {loading ? (
          <LoadingState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                    Proximity
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                    Assessed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {topProspects.map((p, i) => (
                  <tr
                    key={i}
                    className="hover:bg-gray-50 dark:hover:bg-gray-750"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${priorityColors[p.priority] || "bg-gray-100"}`}
                      >
                        {p.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">
                      {p.ownerName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {p.propertyType}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                      {p.propertyAddress}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {p.municipality}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${proximityColors[p.ownerProximity] || ""}`}
                      >
                        {p.ownerProximity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">
                      {fmt(p.assessedValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Methodology Note */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-100 dark:border-blue-800">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
          Data Source &amp; Methodology
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-300">
          {summary.totalOwners.toLocaleString()} unique commercial property
          owners in Dane County, WI. Pulled from the Wisconsin V11 Statewide
          Parcel Database (PROPCLASS=2, assessed value $300K+). Scored on
          assessed value, owner type, proximity, and improvements. Property
          types inferred from owner name keywords and address signals — 60%
          remain unclassified due to lack of public use codes.
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-xl font-bold mt-1 ${accent || "text-gray-900 dark:text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}
