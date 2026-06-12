"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/fetchRetry";
import { ExportButtons } from "@/components/ExportButtons";

interface ReportDef {
  id: string;
  name: string;
  description: string;
  defaultPeriod: string;
  periods: boolean;
}

const REPORTS: ReportDef[] = [
  { id: "consolidated_pnl", name: "Consolidated Owner P&L", description: "All entities side-by-side with combined total, Owner Net Income basis", defaultPeriod: "ytd", periods: true },
  { id: "entity_comparison", name: "Entity Comparison", description: "Revenue, expenses, net income, and margin per entity — TTM and YTD", defaultPeriod: "ytd", periods: false },
  { id: "jrw_properties", name: "JRW Property Performance", description: "Per-property NOI, occupancy, and receivables", defaultPeriod: "qtd", periods: true },
  { id: "big_pnl", name: "BIG Management P&L", description: "Fee revenue by stream vs. overhead", defaultPeriod: "ytd", periods: true },
  { id: "cash_distributions", name: "Cash Position & Distributions", description: "Capital contributions/distributions per entity plus the Station 955 note", defaultPeriod: "ytd", periods: true },
  { id: "aged_receivables_combined", name: "Aged Receivables — Combined", description: "AR across all entities and both databases, bucketed and sorted", defaultPeriod: "ytd", periods: false },
];

const PERIOD_OPTIONS = [
  { value: "prev_mo", label: "Prev Mo" },
  { value: "mtd", label: "MTD" },
  { value: "qtd", label: "QTD" },
  { value: "ytd", label: "YTD" },
  { value: "ttm", label: "TTM" },
];

interface ReportData {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
  generatedAt: string;
}

export function PortfolioReportsSection({ joeView }: { joeView: boolean }) {
  const [periods, setPeriods] = useState<Record<string, string>>(
    Object.fromEntries(REPORTS.map((r) => [r.id, r.defaultPeriod]))
  );
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<Record<string, ReportData>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function loadReport(id: string): Promise<ReportData | null> {
    const period = periods[id];
    const key = `${id}:${period}:${joeView}`;
    if (reportData[key]) return reportData[key];
    setLoadingId(id);
    setErrorId(null);
    try {
      const params = new URLSearchParams({ report: id, period });
      if (joeView) params.set("view", "joe");
      const res = await apiFetch(`/api/combined-reports?${params}`);
      if (!res.ok) throw new Error(`report ${res.status}`);
      const d: ReportData = await res.json();
      if (!Array.isArray(d?.rows)) throw new Error("incomplete");
      setReportData((prev) => ({ ...prev, [key]: d }));
      return d;
    } catch {
      setErrorId(id);
      return null;
    } finally {
      setLoadingId(null);
    }
  }

  async function handleView(id: string) {
    if (openReport === id) {
      setOpenReport(null);
      return;
    }
    const d = await loadReport(id);
    if (d) setOpenReport(id);
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Reports</p>
      <p className="text-xs text-gray-400 mb-4">
        Combined portfolio reports · {joeView ? "Joe's Share" : "Portfolio View"} · PDF &amp; XLSX export
      </p>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {REPORTS.map((r) => {
          const key = `${r.id}:${periods[r.id]}:${joeView}`;
          const data = reportData[key];
          const isOpen = openReport === r.id && data;
          return (
            <div key={r.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</p>
                  <p className="text-xs text-gray-400">{r.description}</p>
                </div>
                {r.periods && (
                  <select
                    value={periods[r.id]}
                    onChange={(e) => {
                      setPeriods((prev) => ({ ...prev, [r.id]: e.target.value }));
                      if (openReport === r.id) setOpenReport(null);
                    }}
                    className="text-[11px] border border-gray-200 dark:border-gray-600 rounded-md px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  >
                    {PERIOD_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => handleView(r.id)}
                  disabled={loadingId === r.id}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-[#E07B2A] text-[#E07B2A] hover:bg-[#E07B2A]/10 transition-colors disabled:opacity-50"
                >
                  {loadingId === r.id ? "Loading…" : isOpen ? "Hide" : "View"}
                </button>
                {data ? (
                  <ExportButtons
                    fileName={`${r.id}-${periods[r.id]}${joeView ? "-joes-share" : ""}`}
                    headers={data.headers}
                    rows={data.rows}
                    title={`${data.title} — ${data.subtitle}`}
                  />
                ) : (
                  <button
                    onClick={() => loadReport(r.id)}
                    disabled={loadingId === r.id}
                    className="px-2.5 py-1 text-[10px] rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-[#E07B2A] transition-colors disabled:opacity-50"
                  >
                    Load for export
                  </button>
                )}
              </div>
              {errorId === r.id && (
                <p className="text-[11px] text-red-500 mt-1.5">Report failed to load — try again.</p>
              )}
              {isOpen && data && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] text-gray-400 px-3 pt-2">{data.subtitle}</p>
                  <table className="min-w-full text-[11px]">
                    <thead>
                      <tr className="bg-blue-50 dark:bg-gray-700">
                        {data.headers.map((h) => (
                          <th key={h} className="px-3 py-1.5 text-left font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {data.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td
                              key={j}
                              className={`px-3 py-1.5 whitespace-nowrap ${String(cell).startsWith("-$") || String(cell).startsWith("($") ? "text-red-500" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
