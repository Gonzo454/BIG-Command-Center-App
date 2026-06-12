import { NextRequest } from "next/server";
import { fetchReport, fetchPvReport, parseAmount, firstOfYear, firstOfMonth, firstOfQuarter, today, cachedJson } from "@/lib/appfolio";
import { getOwnership } from "@/lib/ownership";
import { getPropertyConfig } from "@/lib/property-config";
import { JOE_PV_BUILDINGS } from "@/lib/pv-buildings";
import { ENTITY_PROPERTY_IDS } from "@/lib/appfolio-entities";

export const maxDuration = 60;

interface AccountTotalsRow {
  property_id?: number;
  property_name?: string;
}

interface IncomeRow {
  account_name?: string;
  month_to_date?: string;
  year_to_date?: string;
}

function extractTotals(rows: IncomeRow[], column: "month_to_date" | "year_to_date") {
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const row of rows) {
    const name = (row.account_name || "").toLowerCase().trim();
    const amount = parseAmount(row[column]);
    if (name === "total income") totalIncome = amount;
    if (name === "total expense" || name === "total expenses") totalExpenses = Math.abs(amount);
  }
  return { totalIncome, totalExpenses };
}

function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

// Run async tasks with a concurrency cap to avoid AppFolio rate limits
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Joe-owned Park Vista *buildings* live in the dedicated PV AppFolio
// database. They appear as JRW real estate holdings, weighted by Joe's
// equity share (the PVSHM management company is a separate business and is
// no longer shown among the real estate holdings).
async function fetchJoePvBuildings(
  rangeFrom: string,
  rangeTo: string,
  isMtd: boolean,
  isYtd: boolean,
  ownershipView: boolean,
): Promise<{ name: string; netAmount: number; endingBalance: number; ownershipPct: number }[]> {
  const buildings = Object.entries(JOE_PV_BUILDINGS);
  if (buildings.length === 0) return [];
  try {
    const allPv = await fetchPvReport<AccountTotalsRow>("account_totals", {
      posted_on_from: rangeFrom,
      posted_on_to: rangeTo,
    });
    const idByName = new Map<string, number>();
    for (const p of allPv) {
      const name = (p.property_name || "").trim();
      if (name && p.property_id && !idByName.has(name)) idByName.set(name, p.property_id);
    }
    return await mapWithConcurrency(buildings, 2, async ([name, cfg]) => {
      const propId = idByName.get(name);
      const base = { name: cfg.label || name, endingBalance: 0, ownershipPct: cfg.pct };
      if (!propId) return { ...base, netAmount: 0 };
      const filter = { properties_ids: [propId] };
      let net = 0;
      if (isMtd || isYtd) {
        const rows = await fetchPvReport<IncomeRow>("income_statement", {
          posted_on_from: rangeFrom,
          posted_on_to: rangeTo,
          properties: filter,
        }).catch(() => [] as IncomeRow[]);
        const t = extractTotals(rows, isMtd ? "month_to_date" : "year_to_date");
        net = t.totalIncome - t.totalExpenses;
      } else {
        const beforeFrom = dayBefore(rangeFrom);
        const baselineFrom = beforeFrom.slice(0, 8) + "01";
        const [end, start] = await Promise.all([
          fetchPvReport<IncomeRow>("income_statement", {
            posted_on_from: rangeFrom,
            posted_on_to: rangeTo,
            properties: filter,
          }).catch(() => [] as IncomeRow[]),
          fetchPvReport<IncomeRow>("income_statement", {
            posted_on_from: baselineFrom,
            posted_on_to: beforeFrom,
            properties: filter,
          }).catch(() => [] as IncomeRow[]),
        ]);
        const e = extractTotals(end, "year_to_date");
        const s = extractTotals(start, "year_to_date");
        net = (e.totalIncome - s.totalIncome) - (e.totalExpenses - s.totalExpenses);
      }
      return {
        ...base,
        netAmount: Math.round(ownershipView ? net * cfg.pct : net),
      };
    });
  } catch {
    return [];
  }
}

const isParkVista = (name: string) => name.toLowerCase().startsWith("park vista");

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const ownershipView = searchParams.get("view") === "joe";
    const period = searchParams.get("period") || "ytd";
    const paramFrom = searchParams.get("from");
    const paramTo = searchParams.get("to");

    let rangeFrom: string;
    let rangeTo: string;

    if (paramFrom && paramTo) {
      rangeFrom = paramFrom;
      rangeTo = paramTo;
    } else if (period === "mtd") {
      rangeFrom = firstOfMonth();
      rangeTo = today();
    } else if (period === "qtd") {
      rangeFrom = firstOfQuarter();
      rangeTo = today();
    } else {
      rangeFrom = firstOfYear();
      rangeTo = today();
    }

    const isMtd = sameMonth(rangeFrom, rangeTo);
    const isYtd = rangeFrom.endsWith("-01-01") || period === "ytd";

    // Step 1: Discover all property IDs via account_totals
    const allProperties = await fetchReport<AccountTotalsRow>("account_totals", {
      posted_on_from: rangeFrom,
      posted_on_to: rangeTo,
    });

    const propertyEntries = new Map<string, number>();
    for (const p of allProperties) {
      const name = (p.property_name || "").trim();
      if (!name || !p.property_id) continue;
      if (getPropertyConfig(name).archived) continue;
      // PV management co. is a separate business, not a real estate holding
      if (isParkVista(name)) continue;
      if (!propertyEntries.has(name)) {
        propertyEntries.set(name, p.property_id);
      }
    }

    // Badger Hotel Group never appears in account_totals (AppFolio treats it
    // as an internal management entity) but has GL activity under a known
    // property id, so include it explicitly.
    if (!propertyEntries.has("Badger Hotel Group") && !getPropertyConfig("Badger Hotel Group").archived) {
      propertyEntries.set("Badger Hotel Group", ENTITY_PROPERTY_IDS.hotel);
    }

    const entries = Array.from(propertyEntries.entries());

    // Step 2: Per-property income_statement — same authoritative source the
    // drill-down pages use, so gauges always match drill-down values.
    // Concurrency-limited to avoid AppFolio rate limiting.
    const pvBuildingsPromise = fetchJoePvBuildings(rangeFrom, rangeTo, isMtd, isYtd, ownershipView);

    if (isMtd || isYtd) {
      const column = isMtd ? "month_to_date" : "year_to_date";
      const isResults = await mapWithConcurrency(entries, 4, ([, propId]) =>
        fetchReport<IncomeRow>("income_statement", {
          posted_on_from: rangeFrom,
          posted_on_to: rangeTo,
          properties: { properties_ids: [propId] },
        }).catch(() => [] as IncomeRow[])
      );
      const pvBuildings = await pvBuildingsPromise;

      const properties = entries.map(([name], i) => {
        const t = extractTotals(isResults[i], column);
        const netAmount = Math.round(t.totalIncome - t.totalExpenses);
        const pct = getOwnership(name);
        return {
          name,
          netAmount: ownershipView ? Math.round(netAmount * pct) : netAmount,
          endingBalance: 0,
          ownershipPct: pct,
        };
      });

      properties.push(...pvBuildings);
      properties.sort((a, b) => b.netAmount - a.netAmount);
      return cachedJson({ properties, ownershipView });
    }

    // QTD / custom multi-month range: end IS + baseline IS per property (YTD subtraction)
    const beforeFrom = dayBefore(rangeFrom);
    const baselineFrom = beforeFrom.slice(0, 8) + "01";

    const pairResults = await mapWithConcurrency(entries, 4, async ([, propId]) => {
      const filter = { properties_ids: [propId] };
      const [end, start] = await Promise.all([
        fetchReport<IncomeRow>("income_statement", {
          posted_on_from: rangeFrom,
          posted_on_to: rangeTo,
          properties: filter,
        }).catch(() => [] as IncomeRow[]),
        fetchReport<IncomeRow>("income_statement", {
          posted_on_from: baselineFrom,
          posted_on_to: beforeFrom,
          properties: filter,
        }).catch(() => [] as IncomeRow[]),
      ]);
      return { end, start };
    });
    const pvBuildings = await pvBuildingsPromise;

    const properties = entries.map(([name], i) => {
      const end = extractTotals(pairResults[i].end, "year_to_date");
      const start = extractTotals(pairResults[i].start, "year_to_date");
      const netAmount = Math.round(
        (end.totalIncome - start.totalIncome) - (end.totalExpenses - start.totalExpenses)
      );
      const pct = getOwnership(name);
      return {
        name,
        netAmount: ownershipView ? Math.round(netAmount * pct) : netAmount,
        endingBalance: 0,
        ownershipPct: pct,
      };
    });

    properties.push(...pvBuildings);
    properties.sort((a, b) => b.netAmount - a.netAmount);
    return cachedJson({ properties, ownershipView });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
