"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { apiFetch } from "@/lib/fetchRetry";

interface EntityMonth {
  month: string;
  revenue: number;
  expenses: number;
  netIncome: number;
  interestExpense?: number;
}

export interface PortfolioTtmData {
  months: string[];
  entities: {
    jrw: EntityMonth[];
    big: EntityMonth[];
    hotel: EntityMonth[];
    pvshm: EntityMonth[];
  };
  mirror: { month: string; big5820: number; jrwFee: number; variance: number }[];
  mirrorWarn: boolean;
}

const ENTITY_META: { key: EntityKey; label: string; color: string }[] = [
  { key: "jrw", label: "JRW Real Estate", color: "#22c55e" },
  { key: "big", label: "Blackdeer I.G.", color: "#f59e0b" },
  { key: "hotel", label: "Badger Hotel", color: "#ef4444" },
  { key: "pvshm", label: "Park Vista SHM", color: "#a855f7" },
];

type EntityKey = "jrw" | "big" | "hotel" | "pvshm";

type ChartView = "net" | "revexp" | "cumulative";

const VIEW_META: { key: ChartView; label: string; title: string; subtitle: string }[] = [
  { key: "net", label: "Net Income", title: "Combined Owner Net Income", subtitle: "Trailing 12 months \u00b7 monthly by entity with TTM total" },
  { key: "revexp", label: "Revenue vs Expenses", title: "Combined Revenue vs Expenses", subtitle: "Trailing 12 months \u00b7 combined monthly revenue and expenses" },
  { key: "cumulative", label: "Cumulative", title: "Cumulative Owner Net Income", subtitle: "Trailing 12 months \u00b7 running net income by entity" },
];

const fmtK = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(0)}K` : `$${abs.toFixed(0)}`;
  return n < 0 ? `(${s})` : s;
};

const HALF_M = 500_000;

const fmtAxis = (n: number) => {
  const abs = Math.abs(n);
  const s =
    abs >= 1_000_000
      ? `$${(abs / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} Mil`
      : abs > 0
        ? `$${Math.round(abs / 1000)}K`
        : "$0";
  return n < 0 ? `(${s})` : s;
};

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mo) - 1]} '${y.slice(2)}`;
};

export function PortfolioPerformanceChart({
  joeView,
  onData,
}: {
  joeView: boolean;
  onData?: (data: PortfolioTtmData) => void;
}) {
  const [data, setData] = useState<PortfolioTtmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [afterDebt, setAfterDebt] = useState(false);
  const [view, setView] = useState<ChartView>("net");
  const [hidden, setHidden] = useState<Set<EntityKey>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await apiFetch(`/api/portfolio-ttm${joeView ? "?view=joe" : ""}`);
          if (!res.ok) throw new Error(`portfolio-ttm ${res.status}`);
          const d: PortfolioTtmData = await res.json();
          if (!Array.isArray(d?.months)) throw new Error("incomplete");
          if (!cancelled) {
            setData(d);
            onData?.(d);
            setLoading(false);
          }
          return;
        } catch {
          if (attempt === 2 && !cancelled) {
            setError(true);
            setLoading(false);
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joeView]);

  const { chartData, dataStartIdx, domain, ticks } = useMemo(() => {
    if (!data)
      return {
        chartData: [],
        dataStartIdx: 0,
        domain: [0, 0] as [number, number],
        ticks: [] as number[],
      };

    const value = (e: EntityMonth, key: EntityKey) =>
      key === "jrw" && afterDebt ? e.netIncome - (e.interestExpense || 0) : e.netIncome;

    // months with no activity at all (before GL history begins) are skipped
    const hasActivity = data.months.map((_, i) =>
      ENTITY_META.some(({ key }) => {
        const e = data.entities[key][i];
        return e && (e.revenue !== 0 || e.expenses !== 0);
      })
    );
    const firstActive = hasActivity.indexOf(true);
    const dataStartIdx = firstActive === -1 ? 0 : firstActive;

    const monthly = data.months.map((month, i) => {
      const row: Record<string, number | string | null> = { month };
      let total = 0;
      let rev = 0;
      let exp = 0;
      for (const { key } of ENTITY_META) {
        const e = data.entities[key][i];
        const v = e ? value(e, key) : 0;
        row[key] = hidden.has(key) ? 0 : v;
        if (!hidden.has(key)) {
          total += v;
          rev += e?.revenue || 0;
          exp += (e?.expenses || 0) + (key === "jrw" && afterDebt ? e?.interestExpense || 0 : 0);
        }
      }
      row.total = total;
      row.revenue = rev;
      row.expenses = exp;
      return row;
    });

    // TTM line: only where a full 12-month window of history exists
    for (let i = 0; i < monthly.length; i++) {
      if (i - 11 >= dataStartIdx) {
        let sum = 0;
        for (let j = i - 11; j <= i; j++) sum += monthly[j].total as number;
        monthly[i].ttm = sum;
      } else {
        monthly[i].ttm = null;
      }
    }

    const visible = monthly.slice(-12);

    // cumulative running net income per entity across the displayed window
    const running: Record<EntityKey, number> = { jrw: 0, big: 0, hotel: 0, pvshm: 0 };
    let runningTotal = 0;
    for (const m of visible) {
      for (const { key } of ENTITY_META) {
        running[key] += m[key] as number;
        m[`c_${key}`] = hidden.has(key) ? null : running[key];
      }
      runningTotal += m.total as number;
      m.c_total = runningTotal;
    }

    let lo = 0;
    let hi = 0;
    for (const m of visible) {
      if (view === "revexp") {
        hi = Math.max(hi, m.revenue as number, m.expenses as number);
      } else if (view === "cumulative") {
        for (const { key } of ENTITY_META) {
          const c = m[`c_${key}`] as number | null;
          if (c !== null) {
            hi = Math.max(hi, c);
            lo = Math.min(lo, c);
          }
        }
        hi = Math.max(hi, m.c_total as number);
        lo = Math.min(lo, m.c_total as number);
      } else {
        for (const { key } of ENTITY_META) {
          const v = m[key] as number;
          if (v < 0) lo = Math.min(lo, v);
        }
        hi = Math.max(hi, m.total as number, (m.ttm as number) || 0);
        lo = Math.min(lo, m.total as number);
      }
    }
    const domainMin = Math.floor(lo / HALF_M) * HALF_M;
    const domainMax = Math.ceil(hi / HALF_M) * HALF_M;
    const ticks: number[] = [];
    for (let t = domainMin; t <= domainMax; t += HALF_M) ticks.push(t);

    return { chartData: visible, dataStartIdx, domain: [domainMin, domainMax] as [number, number], ticks };
  }, [data, afterDebt, hidden, view]);

  const ttmAvailable = chartData.some((m) => m.ttm !== null);

  function toggleEntity(key: EntityKey) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            {VIEW_META.find((v) => v.key === view)?.title}
            {data?.mirrorWarn && (
              <span title="BIG 5820 fee revenue does not tie to JRW management-fee expense within ±$500 — see console for details" className="text-amber-500 cursor-help">⚠</span>
            )}
          </p>
          <p className="text-xs text-gray-400">{VIEW_META.find((v) => v.key === view)?.subtitle}</p>
        </div>
        <div className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden text-[10px] font-medium">
          <button
            onClick={() => setAfterDebt(false)}
            className={`px-2 py-1 transition-colors ${!afterDebt ? "bg-[#E07B2A] text-white" : "bg-white dark:bg-gray-700 text-gray-500 hover:text-[#E07B2A]"}`}
          >
            Operations
          </button>
          <button
            onClick={() => setAfterDebt(true)}
            className={`px-2 py-1 border-l border-gray-200 dark:border-gray-600 transition-colors ${afterDebt ? "bg-[#E07B2A] text-white" : "bg-white dark:bg-gray-700 text-gray-500 hover:text-[#E07B2A]"}`}
          >
            After Debt Service
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {VIEW_META.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              view === key
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[280px]">
          <p className="text-xs text-gray-400 animate-pulse">Lots of cash loading here, please be patient.</p>
        </div>
      ) : error || !data ? (
        <div className="flex-1 flex items-center justify-center min-h-[280px]">
          <p className="text-xs text-gray-400">Combined chart unavailable — try refreshing.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-[280px]">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10 }} />
                <YAxis
                  tickFormatter={fmtAxis}
                  tick={{ fontSize: 10 }}
                  width={64}
                  domain={domain}
                  ticks={ticks}
                  interval={0}
                />
                <ReferenceLine y={0} stroke="#9ca3af" />
                <Tooltip
                  formatter={(value, name) => {
                    const meta = ENTITY_META.find((e) => e.key === name);
                    const v = typeof value === "number" ? value : 0;
                    return [
                      <span key="v" style={{ color: v < 0 ? "#ef4444" : undefined }}>{fmtK(v)}</span>,
                      meta
                        ? meta.label
                        : name === "ttm"
                          ? "TTM Total"
                          : name === "revenue"
                            ? "Revenue"
                            : name === "expenses"
                              ? "Expenses"
                              : name === "c_total"
                                ? "Combined Total"
                                : String(name).startsWith("c_")
                                  ? ENTITY_META.find((e) => e.key === String(name).slice(2))?.label || String(name)
                                  : String(name),
                    ];
                  }}
                  labelFormatter={(m) => monthLabel(String(m))}
                  contentStyle={{ fontSize: 11 }}
                />
                {view === "net" && (
                  <>
                    {ENTITY_META.map(({ key, color }) => (
                      <Bar key={key} dataKey={key} stackId="net" fill={color} maxBarSize={36} />
                    ))}
                    <Line type="monotone" dataKey="ttm" stroke="#1f2937" strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls={false} name="ttm" />
                  </>
                )}
                {view === "revexp" && (
                  <>
                    <Bar dataKey="revenue" fill="#22c55e" maxBarSize={20} name="revenue" />
                    <Bar dataKey="expenses" fill="#ef4444" maxBarSize={20} name="expenses" />
                  </>
                )}
                {view === "cumulative" && (
                  <>
                    {ENTITY_META.map(({ key, color }) => (
                      <Line key={key} type="monotone" dataKey={`c_${key}`} stroke={color} strokeWidth={1.5} dot={false} name={`c_${key}`} />
                    ))}
                    <Line type="monotone" dataKey="c_total" stroke="#1f2937" strokeWidth={2.5} dot={{ r: 2 }} name="c_total" />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            {view === "revexp" ? (
              <>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e]" />
                  <span className="text-gray-600 dark:text-gray-300">Revenue</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" />
                  <span className="text-gray-600 dark:text-gray-300">Expenses</span>
                </span>
              </>
            ) : (
            ENTITY_META.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleEntity(key)}
                className={`flex items-center gap-1.5 text-[11px] transition-opacity ${hidden.has(key) ? "opacity-35 line-through" : ""}`}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-gray-600 dark:text-gray-300">{label}</span>
              </button>
            ))
            )}
            {view === "net" && (
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className="w-4 h-0.5 rounded bg-gray-800 dark:bg-gray-200" />
                <span className="text-gray-600 dark:text-gray-300">TTM Total</span>
              </span>
            )}
            {view === "cumulative" && (
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className="w-4 h-0.5 rounded bg-gray-800 dark:bg-gray-200" />
                <span className="text-gray-600 dark:text-gray-300">Combined Total</span>
              </span>
            )}
          </div>
          {view === "net" && (!ttmAvailable || dataStartIdx > 0) && (
            <p className="text-[10px] text-gray-400 mt-1.5">
              TTM line begins where a full 12 months of GL history is available.
            </p>
          )}
        </>
      )}
    </div>
  );
}
