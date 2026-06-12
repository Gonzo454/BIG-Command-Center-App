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

const fmtK = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(0)}K` : `$${abs.toFixed(0)}`;
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

  const { chartData, dataStartIdx } = useMemo(() => {
    if (!data) return { chartData: [], dataStartIdx: 0 };

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
      for (const { key } of ENTITY_META) {
        const e = data.entities[key][i];
        const v = e ? value(e, key) : 0;
        row[key] = hidden.has(key) ? 0 : v;
        if (!hidden.has(key)) total += v;
      }
      row.total = total;
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

    return { chartData: monthly.slice(-12), dataStartIdx };
  }, [data, afterDebt, hidden]);

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
            Combined Owner Net Income
            {data?.mirrorWarn && (
              <span title="BIG 5820 fee revenue does not tie to JRW management-fee expense within ±$500 — see console for details" className="text-amber-500 cursor-help">⚠</span>
            )}
          </p>
          <p className="text-xs text-gray-400">Trailing 12 months · monthly by entity with TTM total</p>
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
                <YAxis tickFormatter={(v: number) => fmtK(v)} tick={{ fontSize: 10 }} width={56} />
                <ReferenceLine y={0} stroke="#9ca3af" />
                <Tooltip
                  formatter={(value, name) => {
                    const meta = ENTITY_META.find((e) => e.key === name);
                    const v = typeof value === "number" ? value : 0;
                    return [
                      <span key="v" style={{ color: v < 0 ? "#ef4444" : undefined }}>{fmtK(v)}</span>,
                      meta ? meta.label : name === "ttm" ? "TTM Total" : String(name),
                    ];
                  }}
                  labelFormatter={(m) => monthLabel(String(m))}
                  contentStyle={{ fontSize: 11 }}
                />
                {ENTITY_META.map(({ key, color }) => (
                  <Bar key={key} dataKey={key} stackId="net" fill={color} maxBarSize={36} />
                ))}
                <Line type="monotone" dataKey="ttm" stroke="#1f2937" strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls={false} name="ttm" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            {ENTITY_META.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleEntity(key)}
                className={`flex items-center gap-1.5 text-[11px] transition-opacity ${hidden.has(key) ? "opacity-35 line-through" : ""}`}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-gray-600 dark:text-gray-300">{label}</span>
              </button>
            ))}
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="w-4 h-0.5 rounded bg-gray-800 dark:bg-gray-200" />
              <span className="text-gray-600 dark:text-gray-300">TTM Total</span>
            </span>
          </div>
          {(!ttmAvailable || dataStartIdx > 0) && (
            <p className="text-[10px] text-gray-400 mt-1.5">
              TTM line begins where a full 12 months of GL history is available.
            </p>
          )}
        </>
      )}
    </div>
  );
}
