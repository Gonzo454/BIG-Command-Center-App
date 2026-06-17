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
  net_amount?: string;
  ending_balance?: string;
  reserve_amount?: string;
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

// Badger Hotel Group is absent from account_totals, so its period net income
// comes from the income statement under its known property id.
async function fetchHotelNet(
  rangeFrom: string,
  rangeTo: string,
  isMtd: boolean,
  isYtd: boolean,
): Promise<number> {
  const filter = { properties_ids: [ENTITY_PROPERTY_IDS.hotel] };
  try {
    if (isMtd || isYtd) {
      const rows = await fetchReport<IncomeRow>("income_statement", {
        posted_on_from: rangeFrom,
        posted_on_to: rangeTo,
        properties: filter,
      });
      const t = extractTotals(rows, isMtd ? "month_to_date" : "year_to_date");
      return t.totalIncome - t.totalExpenses;
    }
    const beforeFrom = dayBefore(rangeFrom);
    const baselineFrom = beforeFrom.slice(0, 8) + "01";
    const [end, start] = await Promise.all([
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: rangeFrom,
        posted_on_to: rangeTo,
        properties: filter,
      }),
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: baselineFrom,
        posted_on_to: beforeFrom,
        properties: filter,
      }),
    ]);
    const e = extractTotals(end, "year_to_date");
    const s = extractTotals(start, "year_to_date");
    return (e.totalIncome - s.totalIncome) - (e.totalExpenses - s.totalExpenses);
  } catch {
    return 0;
  }
}

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

    // account_totals returns net_amount + ending_balance per property in a
    // single call. This is the authoritative source for both columns and is
    // immune to the per-property rate limiting that was zeroing net amounts.
    const allProperties = await fetchReport<AccountTotalsRow>("account_totals", {
      posted_on_from: rangeFrom,
      posted_on_to: rangeTo,
    });

    const properties: {
      name: string;
      netAmount: number;
      endingBalance: number;
      ownershipPct: number;
    }[] = [];

    // account_totals can return more than one row per property (one per cash
    // account), so accumulate net_amount + ending_balance across every row for
    // a property before building its entry.
    const agg = new Map<string, { net: number; ending: number }>();
    const order: string[] = [];
    for (const p of allProperties) {
      const name = (p.property_name || "").trim();
      if (!name) continue;
      if (getPropertyConfig(name).archived) continue;
      // PV management co. is a separate business, not a real estate holding
      if (isParkVista(name)) continue;
      if (!agg.has(name)) {
        agg.set(name, { net: 0, ending: 0 });
        order.push(name);
      }
      const entry = agg.get(name)!;
      entry.net += parseAmount(p.net_amount);
      entry.ending += parseAmount(p.ending_balance);
    }

    for (const name of order) {
      const { net, ending } = agg.get(name)!;
      const pct = getOwnership(name);
      const netAmount = Math.round(net);
      properties.push({
        name,
        netAmount: ownershipView ? Math.round(netAmount * pct) : netAmount,
        endingBalance: Math.round(ending),
        ownershipPct: pct,
      });
    }

    // Badger Hotel Group is absent from account_totals (AppFolio treats it as
    // an internal management entity), so include it via its income statement.
    if (!agg.has("Badger Hotel Group") && !getPropertyConfig("Badger Hotel Group").archived) {
      const net = await fetchHotelNet(rangeFrom, rangeTo, isMtd, isYtd);
      const pct = getOwnership("Badger Hotel Group");
      properties.push({
        name: "Badger Hotel Group",
        netAmount: ownershipView ? Math.round(net * pct) : Math.round(net),
        endingBalance: 0,
        ownershipPct: pct,
      });
    }

    // Joe-owned PV buildings (currently none configured) appear as JRW holdings.
    const pvBuildings = await fetchJoePvBuildings(rangeFrom, rangeTo, isMtd, isYtd, ownershipView);
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
