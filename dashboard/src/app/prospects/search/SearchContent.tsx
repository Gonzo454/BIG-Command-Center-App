"use client";

import { LoadingState } from "@/components/LoadingState";
import { apiJson } from "@/lib/fetchRetry";
import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import summary from "@/data/prospect-summary.json";

interface Prospect {
  priority: string;
  score: number;
  ownerName: string;
  ownerType: string;
  propertyType: string;
  propertySubtype: string;
  propertyAddress: string;
  municipality: string;
  zip: string;
  mailingAddress: string;
  ownerProximity: string;
  assessedValue: number;
  improvementValue: number;
  acres: number;
  parcelId: string;
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

const propertyTypes = Object.keys(
  summary.propertyTypeCounts as Record<string, number>
).sort();
const proximities = [
  "Out-of-State",
  "Greater Wisconsin",
  "Metro Area",
  "Dane County Local",
  "On-Site",
];
const priorities = ["A+", "A", "B", "C", "D"];

export function ProspectSearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const q = searchParams.get("q") || "";
  const propertyType = searchParams.get("propertyType") || "";
  const proximity = searchParams.get("proximity") || "";
  const priority = searchParams.get("priority") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const sortBy = searchParams.get("sortBy") || "score";
  const sortDir = searchParams.get("sortDir") || "desc";

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (propertyType) params.set("propertyType", propertyType);
    if (proximity) params.set("proximity", proximity);
    if (priority) params.set("priority", priority);
    params.set("page", String(page));
    params.set("limit", "50");
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);

    apiJson(`/api/prospects?${params.toString()}`, { signal: controller.signal })
      .then((data) => {
        if (!cancelled) {
          setProspects(data.prospects);
          setTotal(data.total);
          setTotalPages(data.totalPages);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to fetch prospects:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [q, propertyType, proximity, priority, page, sortBy, sortDir]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== "page") params.set("page", "1");
    router.push(`/prospects/search?${params.toString()}`);
  }

  function handleSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam("q", value), 300);
  }

  function handleSort(col: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === col) {
      params.set("sortDir", sortDir === "desc" ? "asc" : "desc");
    } else {
      params.set("sortBy", col);
      params.set("sortDir", "desc");
    }
    params.set("page", "1");
    router.push(`/prospects/search?${params.toString()}`);
  }

  function sortIcon(col: string) {
    if (sortBy !== col) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (propertyType) params.set("propertyType", propertyType);
    if (proximity) params.set("proximity", proximity);
    if (priority) params.set("priority", priority);
    params.set("limit", "5000");
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);

    apiJson(`/api/prospects?${params.toString()}`)
      .then((data) => {
        const rows = data.prospects as Prospect[];
        const headers = [
          "Priority",
          "Score",
          "Owner Name",
          "Owner Type",
          "Property Type",
          "Property Subtype",
          "Property Address",
          "Municipality",
          "Zip",
          "Mailing Address",
          "Owner Proximity",
          "Assessed Value",
          "Improvement Value",
          "Acres",
          "Parcel ID",
        ];
        const csv = [
          headers.join(","),
          ...rows.map((r) =>
            [
              r.priority,
              r.score,
              `"${r.ownerName}"`,
              `"${r.ownerType}"`,
              `"${r.propertyType}"`,
              `"${r.propertySubtype}"`,
              `"${r.propertyAddress}"`,
              `"${r.municipality}"`,
              r.zip,
              `"${r.mailingAddress}"`,
              `"${r.ownerProximity}"`,
              r.assessedValue,
              r.improvementValue,
              r.acres,
              r.parcelId,
            ].join(",")
          ),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `BIG_Prospects_Export_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Search Prospects
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {total.toLocaleString()} results
          {(q || propertyType || proximity || priority) && " (filtered)"}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <input
              type="text"
              defaultValue={q}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search owner, address, city, parcel..."
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <select
            value={propertyType}
            onChange={(e) => updateParam("propertyType", e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All Property Types</option>
            {propertyTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={proximity}
            onChange={(e) => updateParam("proximity", e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All Proximities</option>
            {proximities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => updateParam("priority", e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All Priorities</option>
            {priorities.map((p) => (
              <option key={p} value={p}>
                Tier {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-2">
            {(q || propertyType || proximity || priority) && (
              <button
                onClick={() => router.push("/prospects/search")}
                className="text-xs text-blue-600 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
          <button
            onClick={exportCsv}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : prospects.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No prospects match your filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600"
                      onClick={() => handleSort("priority")}
                    >
                      Tier{sortIcon("priority")}
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600"
                      onClick={() => handleSort("ownerName")}
                    >
                      Owner{sortIcon("ownerName")}
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600"
                      onClick={() => handleSort("propertyType")}
                    >
                      Type{sortIcon("propertyType")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                      Address
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600"
                      onClick={() => handleSort("municipality")}
                    >
                      City{sortIcon("municipality")}
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600"
                      onClick={() => handleSort("ownerProximity")}
                    >
                      Proximity{sortIcon("ownerProximity")}
                    </th>
                    <th
                      className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600"
                      onClick={() => handleSort("assessedValue")}
                    >
                      Assessed{sortIcon("assessedValue")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {prospects.map((p, i) => (
                    <>
                      <tr
                        key={`row-${i}`}
                        className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                        onClick={() =>
                          setExpanded(expanded === i ? null : i)
                        }
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${priorityColors[p.priority] || "bg-gray-100"}`}
                          >
                            {p.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[180px] truncate">
                          {p.ownerName}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[130px] truncate">
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
                      {expanded === i && (
                        <tr
                          key={`detail-${i}`}
                          className="bg-blue-50 dark:bg-blue-900/20"
                        >
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <Detail
                                label="Owner Type"
                                value={p.ownerType}
                              />
                              <Detail
                                label="Subtype"
                                value={p.propertySubtype || "—"}
                              />
                              <Detail
                                label="Mailing Address"
                                value={p.mailingAddress}
                              />
                              <Detail label="Zip" value={p.zip} />
                              <Detail
                                label="Improvement Value"
                                value={fmt(p.improvementValue)}
                              />
                              <Detail
                                label="Acres"
                                value={p.acres.toFixed(2)}
                              />
                              <Detail
                                label="Score"
                                value={String(p.score)}
                              />
                              <Detail
                                label="Parcel ID"
                                value={p.parcelId}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700">
                <p className="text-sm text-gray-500">
                  Page {page} of {totalPages} ({total.toLocaleString()} total)
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => updateParam("page", String(page - 1))}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => updateParam("page", String(page + 1))}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-medium text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
