import { NextRequest } from "next/server";
import { fetchReport, parseAmount, firstOfYear, firstOfMonth, firstOfQuarter, today, cachedJson } from "@/lib/appfolio";
import { getOwnership } from "@/lib/ownership";
import { getPropertyConfig } from "@/lib/property-config";

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

    // Deduplicate and filter to active properties with valid IDs
    const propertyEntries = new Map<string, number>();
    for (const p of allProperties) {
      const name = (p.property_name || "").trim();
      if (!name || !p.property_id) continue;
      if (getPropertyConfig(name).archived) continue;
      if (!propertyEntries.has(name)) {
        propertyEntries.set(name, p.property_id);
      }
    }

    // Step 2: Fetch per-property income_statement in parallel
    const entries = Array.from(propertyEntries.entries());

    if (isMtd || isYtd) {
      // Single IS call per property — use month_to_date or year_to_date column
      const column = isMtd ? "month_to_date" : "year_to_date";
      const isPromises = entries.map(([, propId]) =>
        fetchReport<IncomeRow>("income_statement", {
          posted_on_from: rangeFrom,
          posted_on_to: rangeTo,
          properties: { properties_ids: [propId] },
        })
      );

      const isResults = await Promise.all(isPromises);

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

      properties.sort((a, b) => b.netAmount - a.netAmount);
      return cachedJson({ properties, ownershipView });
    }

    // QTD / custom multi-month range: fetch end IS + baseline IS per property
    const beforeFrom = dayBefore(rangeFrom);
    const baselineFrom = beforeFrom.slice(0, 8) + "01";

    const endPromises = entries.map(([, propId]) =>
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: rangeFrom,
        posted_on_to: rangeTo,
        properties: { properties_ids: [propId] },
      })
    );
    const startPromises = entries.map(([, propId]) =>
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: baselineFrom,
        posted_on_to: beforeFrom,
        properties: { properties_ids: [propId] },
      })
    );

    const [endResults, startResults] = await Promise.all([
      Promise.all(endPromises),
      Promise.all(startPromises),
    ]);

    const properties = entries.map(([name], i) => {
      const end = extractTotals(endResults[i], "year_to_date");
      const start = extractTotals(startResults[i], "year_to_date");
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

    properties.sort((a, b) => b.netAmount - a.netAmount);
    return cachedJson({ properties, ownershipView });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
