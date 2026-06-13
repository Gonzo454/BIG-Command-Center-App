// Shared date-range presets + persistence so the selected period (Prev Mo / MTD
// / QTD / YTD / Custom) survives a page refresh and stays consistent across the
// dashboard pages. Persisted to localStorage; preset dates are recomputed fresh
// on load (relative to "today") so a stored "YTD" always means the current YTD.

export const DATE_RANGE_STORAGE_KEY = "cc:dateRange";

export interface ResolvedRange {
  preset: string;
  from: string;
  to: string;
  period: string;
}

export function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function firstOfPrevMonth(): string {
  const d = new Date();
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
}

export function lastOfPrevMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth(), 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

export function firstOfQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
}

export function firstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export interface Preset {
  label: string;
  period: string;
  from: () => string;
  to: () => string;
}

export const PRESETS: Preset[] = [
  { label: "Prev Mo", period: "prevmo", from: firstOfPrevMonth, to: lastOfPrevMonth },
  { label: "MTD", period: "mtd", from: firstOfMonth, to: today },
  { label: "QTD", period: "qtd", from: firstOfQuarter, to: today },
  { label: "YTD", period: "ytd", from: firstOfYear, to: today },
];

export function persistRange(preset: string, from: string, to: string, period: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DATE_RANGE_STORAGE_KEY,
      JSON.stringify({ preset, from, to, period }),
    );
  } catch {
    // ignore quota / private-mode errors
  }
}

// Read the persisted selection and resolve it to a usable range. Presets
// recompute their dates so they stay current; "Custom" uses the stored dates.
// Returns null when nothing valid is stored (callers fall back to the MTD default).
export function resolvePersistedRange(): ResolvedRange | null {
  if (typeof window === "undefined") return null;
  let parsed: { preset?: string; from?: string; to?: string; period?: string } | null = null;
  try {
    const raw = window.localStorage.getItem(DATE_RANGE_STORAGE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.preset !== "string") return null;

  const preset = PRESETS.find((p) => p.label === parsed!.preset);
  if (preset) {
    return { preset: preset.label, from: preset.from(), to: preset.to(), period: preset.period };
  }
  if (parsed.preset === "Custom" && parsed.from && parsed.to) {
    return { preset: "Custom", from: parsed.from, to: parsed.to, period: "custom" };
  }
  return null;
}
