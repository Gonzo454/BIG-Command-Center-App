"use client";

import Link from "next/link";

interface ProfitGaugeProps {
  name: string;
  netIncome: number;
  maxAbsolute: number;
  href?: string;
}

export function ProfitGauge({ name, netIncome, maxAbsolute, href }: ProfitGaugeProps) {
  const clamped = Math.max(-1, Math.min(1, netIncome / (maxAbsolute || 1)));
  const angle = clamped * 90; // -90 to +90 degrees
  const color =
    netIncome > 5000
      ? "#22c55e"
      : netIncome < -5000
        ? "#ef4444"
        : "#eab308";

  const content = (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center ${href ? "cursor-pointer hover:border-blue-300 hover:shadow-md transition-all" : ""}`}>
      <svg viewBox="0 0 200 120" className="w-full max-w-[160px]">
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Colored segments */}
        <path
          d="M 20 100 A 80 80 0 0 1 60 40"
          fill="none"
          stroke="#ef4444"
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.3"
        />
        <path
          d="M 60 40 A 80 80 0 0 1 140 40"
          fill="none"
          stroke="#eab308"
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.3"
        />
        <path
          d="M 140 40 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#22c55e"
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.3"
        />
        {/* Needle */}
        <line
          x1="100"
          y1="100"
          x2={100 + 60 * Math.cos(((angle - 90) * Math.PI) / 180)}
          y2={100 + 60 * Math.sin(((angle - 90) * Math.PI) / 180)}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="5" fill={color} />
      </svg>
      <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200 text-center truncate w-full">
        {name}
      </p>
      <p className="text-xs font-mono" style={{ color }}>
        {netIncome >= 0 ? "+" : "-"}
        ${Math.abs(netIncome).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">Net Income</p>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
