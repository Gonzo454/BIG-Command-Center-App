"use client";

import { useState } from "react";

interface DateRangePickerProps {
  onRangeChange: (from: string, to: string, period: string) => void;
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function firstOfQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
}

function firstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

const presets = [
  { label: "MTD", period: "mtd", from: firstOfMonth, to: today },
  { label: "QTD", period: "qtd", from: firstOfQuarter, to: today },
  { label: "YTD", period: "ytd", from: firstOfYear, to: today },
];

export function DateRangePicker({ onRangeChange }: DateRangePickerProps) {
  const [activePreset, setActivePreset] = useState("MTD");
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(today());

  function selectPreset(label: string, period: string, from: () => string, to: () => string) {
    const f = from();
    const t = to();
    setActivePreset(label);
    setFromDate(f);
    setToDate(t);
    onRangeChange(f, t, period);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => selectPreset(p.label, p.period, p.from, p.to)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            activePreset === p.label
              ? "bg-blue-600 text-white"
              : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
          }`}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1 ml-2">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            setActivePreset("Custom");
            onRangeChange(e.target.value, toDate, "custom");
          }}
          className="px-2 py-1 text-xs border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600"
        />
        <span className="text-xs text-gray-500">→</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value);
            setActivePreset("Custom");
            onRangeChange(fromDate, e.target.value, "custom");
          }}
          className="px-2 py-1 text-xs border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600"
        />
      </div>
    </div>
  );
}
