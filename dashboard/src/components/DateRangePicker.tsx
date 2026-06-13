"use client";

import { useEffect, useRef, useState } from "react";
import {
  PRESETS,
  firstOfMonth,
  persistRange,
  resolvePersistedRange,
  today,
} from "@/lib/date-range";

interface DateRangePickerProps {
  onRangeChange: (from: string, to: string, period: string) => void;
}

export function DateRangePicker({ onRangeChange }: DateRangePickerProps) {
  const [activePreset, setActivePreset] = useState("MTD");
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(today());
  const restored = useRef(false);

  // Restore the persisted selection on mount so the picker reflects the period
  // the page is actually showing after a refresh. Done in an effect (not the
  // initial render) to avoid an SSR/hydration mismatch. We only update the
  // picker's display here — the page reads the same persisted range for its
  // initial fetch, so we must NOT call onRangeChange and trigger a 2nd fetch.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const persisted = resolvePersistedRange();
    if (!persisted) return;
    setActivePreset(persisted.preset);
    setFromDate(persisted.from);
    setToDate(persisted.to);
  }, []);

  function selectPreset(label: string, period: string, from: () => string, to: () => string) {
    const f = from();
    const t = to();
    setActivePreset(label);
    setFromDate(f);
    setToDate(t);
    persistRange(label, f, t, period);
    onRangeChange(f, t, period);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((p) => (
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
            persistRange("Custom", e.target.value, toDate, "custom");
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
            persistRange("Custom", fromDate, e.target.value, "custom");
            onRangeChange(fromDate, e.target.value, "custom");
          }}
          className="px-2 py-1 text-xs border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600"
        />
      </div>
    </div>
  );
}
