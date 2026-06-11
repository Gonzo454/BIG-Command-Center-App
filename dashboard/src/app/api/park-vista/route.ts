import { fetchPvReport, firstOfYear, today, parseAmount, cachedJson } from "@/lib/appfolio";
import { PV_COMMUNITIES } from "@/lib/pv-communities";
import { getOwnership } from "@/lib/ownership";
import { NextRequest } from "next/server";

interface RentRollRow {
  status?: string;
  lease_to?: string;
  property_name?: string;
}

interface ArRow {
  total_amount?: string;
}

interface AccountTotalsRow {
  property_name?: string;
  net_amount?: string;
  ending_balance?: string;
}

interface IncomeRow {
  account_name?: string;
  year_to_date?: string;
  month_to_date?: string;
}

function dayBefore(date: string): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function extractIsTotals(rows: IncomeRow[], column: "year_to_date" | "month_to_date") {
  let income = 0;
  let expenses = 0;
  for (const row of rows) {
    const name = (row.account_name || "").toLowerCase().trim();
    const amount = parseAmount(row[column]);
    if (name === "total income") income = amount;
    if (name === "total expense" || name === "total expenses") expenses = Math.abs(amount);
  }
  return { income, expenses };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const ownershipView = searchParams.get("view") === "joe";

    const rangeFrom = searchParams.get("from") || firstOfYear();
    const rangeTo = searchParams.get("to") || today();
    const period = (searchParams.get("period") || "ytd").toLowerCase();
    const isMtd = period === "mtd";
    const isYtd = period === "ytd" || rangeFrom.endsWith("-01-01");

    const [rentRows, arRows, accountRows, isRows] = await Promise.all([
      fetchPvReport<RentRollRow>("rent_roll"),
      fetchPvReport<ArRow>("aged_receivables_detail", { as_of_date: rangeTo }),
      fetchPvReport<AccountTotalsRow>("account_totals", {
        posted_on_from: rangeFrom,
        posted_on_to: rangeTo,
      }),
      fetchPvReport<IncomeRow>("income_statement", {
        posted_on_from: rangeFrom,
        posted_on_to: rangeTo,
      }),
    ]);

    // Portfolio-level totals from income_statement
    let totalIncome = 0;
    let totalExpenses = 0;
    if (isMtd || isYtd) {
      const t = extractIsTotals(isRows, isMtd ? "month_to_date" : "year_to_date");
      totalIncome = t.income;
      totalExpenses = t.expenses;
    } else {
      // Multi-month range (QTD/custom) via YTD subtraction
      const beforeFrom = dayBefore(rangeFrom);
      const baselineFrom = beforeFrom.slice(0, 8) + "01";
      const baseline = await fetchPvReport<IncomeRow>("income_statement", {
        posted_on_from: baselineFrom,
        posted_on_to: beforeFrom,
      });
      const e = extractIsTotals(isRows, "year_to_date");
      const s = extractIsTotals(baseline, "year_to_date");
      totalIncome = e.income - s.income;
      totalExpenses = e.expenses - s.expenses;
    }

    const pvPct = ownershipView ? getOwnership("Park Vista") : 1;

    // Per-community snapshots from account_totals
    const communityMap = new Map<string, { income: number; expenses: number }>();
    for (const row of accountRows) {
      const name = row.property_name || "";
      if (!communityMap.has(name)) {
        communityMap.set(name, { income: 0, expenses: 0 });
      }
      const net = parseAmount(row.net_amount);
      const entry = communityMap.get(name)!;
      if (net > 0) entry.income += net;
      else entry.expenses += Math.abs(net);
    }

    // Occupancy per community
    const rentByProperty = new Map<string, { total: number; occupied: number }>();
    for (const r of rentRows) {
      const prop = r.property_name || "Unknown";
      if (!rentByProperty.has(prop)) {
        rentByProperty.set(prop, { total: 0, occupied: 0 });
      }
      const entry = rentByProperty.get(prop)!;
      entry.total++;
      const s = (r.status || "").toLowerCase();
      if (s.includes("current") || s.includes("occupied")) {
        entry.occupied++;
      }
    }

    const communities = PV_COMMUNITIES.map((c) => {
      const fin = communityMap.get(c.name) || { income: 0, expenses: 0 };
      const occ = rentByProperty.get(c.name) || { total: 0, occupied: 0 };
      return {
        name: c.name,
        slug: c.slug,
        location: c.location,
        careTypes: c.careTypes,
        totalIncome: Math.round(fin.income * pvPct),
        totalExpenses: Math.round(fin.expenses * pvPct),
        netIncome: Math.round((fin.income - fin.expenses) * pvPct),
        totalUnits: occ.total,
        occupied: occ.occupied,
        occupancyRate: occ.total > 0 ? Math.round((occ.occupied / occ.total) * 100) : 0,
      };
    });

    // Portfolio totals
    const totalUnits = rentRows.length;
    const occupied = rentRows.filter((r) => {
      const s = (r.status || "").toLowerCase();
      return s.includes("current") || s.includes("occupied");
    }).length;

    // Lease expirations < 90 days
    const now = new Date();
    const ninetyDays = new Date(now.getTime() + 90 * 86400000);
    const leasesExpiring = rentRows.filter((r) => {
      if (!r.lease_to) return false;
      const d = new Date(r.lease_to);
      return d >= now && d <= ninetyDays;
    }).length;

    const agedReceivables = arRows.reduce((sum, r) => sum + parseAmount(r.total_amount), 0);

    return cachedJson({
      communities,
      portfolio: {
        totalIncome: Math.round(totalIncome * pvPct),
        totalExpenses: Math.round(totalExpenses * pvPct),
        netIncome: Math.round((totalIncome - totalExpenses) * pvPct),
        totalUnits,
        occupied,
        occupancyRate: totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0,
        communityCount: PV_COMMUNITIES.length,
      },
      alerts: {
        leasesExpiring,
        agedReceivables: Math.round(agedReceivables * pvPct),
      },
      period: {
        from: rangeFrom,
        to: rangeTo,
        basis: period.toUpperCase(),
      },
      ownershipView,
    });
  } catch (err) {
    console.error("Park Vista API error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
