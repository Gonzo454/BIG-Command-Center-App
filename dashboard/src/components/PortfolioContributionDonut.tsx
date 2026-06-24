"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const fmtK = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(0)}K` : `$${abs.toFixed(0)}`;
  return n < 0 ? `(${s})` : s;
};

interface Slice {
  name: string;
  value: number;
  color: string;
  netIncome: number | null;
}

export interface DonutData {
  jrw: { totalIncome?: number; noi: number };
  big: { totalIncome: number; netIncomeWithCapital?: number; netIncome: number };
  pv?: { totalIncome: number; netIncome: number };
  period: { basis: string };
}

export function PortfolioContributionDonut({ data }: { data: DonutData | null }) {
  const periodLabel = data?.period?.basis || "MTD";

  const slices: Slice[] = useMemo(() => {
    if (!data) return [];
    const jrwRev = data.jrw.totalIncome ?? 0;
    const bigRev = data.big.totalIncome ?? 0;
    const pvRev = data.pv?.totalIncome ?? 0;
    const total = jrwRev + bigRev + pvRev;
    if (total <= 0) return [];
    return [
      { name: "JRW Real Estate", value: jrwRev / total, color: "#2563eb", netIncome: data.jrw.noi },
      { name: "Blackdeer I.G.", value: bigRev / total, color: "#f59e0b", netIncome: data.big.netIncomeWithCapital ?? data.big.netIncome },
      { name: "Park Vista SHM", value: pvRev / total, color: "#06b6d4", netIncome: data.pv?.netIncome ?? null },
    ].filter((s) => s.value > 0);
  }, [data]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col">
      <p className="text-sm font-semibold text-gray-900 dark:text-white" title={`Each business's share of ${periodLabel} revenue, with net income shown beside it.`}>Portfolio Contribution</p>
      <p className="text-xs text-gray-400 mb-1">Share of {periodLabel} revenue</p>
      {slices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[180px]">
          <p className="text-xs text-gray-400 animate-pulse">Lots of cash loading here, please be patient.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-[180px]">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius={48} outerRadius={75} paddingAngle={2} strokeWidth={1}>
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${((value as number) * 100).toFixed(1)}%`, String(name)]}
                  contentStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 mt-2">
            {slices.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-gray-600 dark:text-gray-300">{s.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-gray-500">{(s.value * 100).toFixed(1)}%</span>
                  {s.netIncome !== null && (
                    <span className={s.netIncome >= 0 ? "text-emerald-600" : "text-red-500"}>
                      {fmtK(s.netIncome)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Share of {periodLabel} revenue. Net income shown beside each entity.
          </p>
        </>
      )}
    </div>
  );
}
