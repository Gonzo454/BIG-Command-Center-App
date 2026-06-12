"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { PortfolioTtmData } from "@/components/PortfolioPerformanceChart";

// Badger Realty has no data source yet — fixed placeholder share
const BADGER_PLACEHOLDER_PCT = 0.05;

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
  placeholder?: boolean;
}

export function PortfolioContributionDonut({ data }: { data: PortfolioTtmData | null }) {
  const slices: Slice[] = useMemo(() => {
    if (!data) return [];
    const ttm = (key: "jrw" | "big" | "hotel" | "pvshm") => {
      const months = data.entities[key].slice(-12);
      return {
        revenue: months.reduce((a, m) => a + m.revenue, 0),
        net: months.reduce((a, m) => a + m.netIncome, 0),
      };
    };
    const jrw = ttm("jrw");
    const big = ttm("big");
    const hotel = ttm("hotel");
    const pvshm = ttm("pvshm");
    const realTotal = jrw.revenue + big.revenue + hotel.revenue + pvshm.revenue;
    if (realTotal <= 0) return [];
    // Badger placeholder carves out a fixed share of the whole
    const scale = 1 - BADGER_PLACEHOLDER_PCT;
    return [
      { name: "JRW Real Estate", value: (jrw.revenue / realTotal) * scale, color: "#2563eb", netIncome: jrw.net },
      { name: "Blackdeer I.G.", value: (big.revenue / realTotal) * scale, color: "#f59e0b", netIncome: big.net },
      { name: "Badger Hotel", value: (hotel.revenue / realTotal) * scale, color: "#06b6d4", netIncome: hotel.net },
      { name: "Park Vista SHM", value: (pvshm.revenue / realTotal) * scale, color: "#a855f7", netIncome: pvshm.net },
      { name: "Badger Realty", value: BADGER_PLACEHOLDER_PCT, color: "#9ca3af", netIncome: null, placeholder: true },
    ].filter((s) => s.value > 0);
  }, [data]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">Portfolio Contribution</p>
      <p className="text-xs text-gray-400 mb-1">Share of trailing 12-month revenue</p>
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
                    <Cell
                      key={s.name}
                      fill={s.color}
                      strokeDasharray={s.placeholder ? "4 3" : undefined}
                      fillOpacity={s.placeholder ? 0.4 : 1}
                    />
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
                    style={{ backgroundColor: s.color, opacity: s.placeholder ? 0.4 : 1 }}
                  />
                  <span className="text-gray-600 dark:text-gray-300">
                    {s.name}
                    {s.placeholder && <span className="text-gray-400"> (placeholder)</span>}
                  </span>
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
            Share of trailing 12-month revenue. Profitability (TTM Owner Net Income) shown beside each entity.
          </p>
        </>
      )}
    </div>
  );
}
