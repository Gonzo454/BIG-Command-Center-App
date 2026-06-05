import { NextRequest } from "next/server";
import { fetchPvReport, firstOfMonth, today, parseAmount, cachedJson } from "@/lib/appfolio";
import { getPvCommunityBySlug } from "@/lib/pv-communities";
import { getOwnership } from "@/lib/ownership";

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  month_to_date?: string;
  year_to_date?: string;
}

interface AccountTotalsRow {
  property_id?: number;
  property_name?: string;
}

function classifyAccount(accountNumber: string): "income" | "expense" {
  const prefix = accountNumber.charAt(0);
  if (prefix === "4" || prefix === "5") return "income";
  return "expense";
}

function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

function extractTotals(
  rows: IncomeRow[],
  column: "month_to_date" | "year_to_date"
) {
  let totalIncome = 0;
  let totalExpenses = 0;
  const accounts: { name: string; number: string; amount: number; type: string }[] = [];

  for (const row of rows) {
    const name = (row.account_name || "").trim();
    const lowerName = name.toLowerCase();
    const amount = parseAmount(row[column]);

    if (lowerName === "total income") {
      totalIncome = amount;
      continue;
    }
    if (lowerName === "total expense" || lowerName === "total expenses") {
      totalExpenses = Math.abs(amount);
      continue;
    }
    if (lowerName === "net income" || lowerName === "net operating income") {
      continue;
    }

    if (row.account_number && amount !== 0) {
      const type = classifyAccount(row.account_number);
      accounts.push({ name, number: row.account_number, amount: Math.abs(amount), type });
    }
  }

  return { totalIncome, totalExpenses, accounts };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const communityParam = params.get("community");
  const from = params.get("from") || firstOfMonth();
  const to = params.get("to") || today();
  const period = params.get("period") || "mtd";
  const ownershipView = params.get("view") === "joe";

  if (!communityParam) {
    return Response.json({ error: "community parameter required" }, { status: 400 });
  }

  const isPortfolio = communityParam === "portfolio";
  const resolved = isPortfolio ? undefined : getPvCommunityBySlug(communityParam);
  const lookupName = isPortfolio ? "Park Vista Portfolio" : (resolved ? resolved.name : communityParam);

  try {
    const pvPct = ownershipView ? getOwnership("Park Vista") : 1;

    // Portfolio-wide: no property filter
    let propertyFilter: { properties_ids: number[] } | undefined;

    if (!isPortfolio) {
      const allProperties = await fetchPvReport<AccountTotalsRow>("account_totals", {
        posted_on_from: from,
        posted_on_to: to,
      });
      const match = allProperties.find(
        (p) => p.property_name === lookupName
      );
      if (!match?.property_id) {
        return Response.json(
          { error: `Community "${communityParam}" not found` },
          { status: 404 }
        );
      }
      propertyFilter = { properties_ids: [match.property_id] };
    }

    function applyPct(extracted: ReturnType<typeof extractTotals>) {
      return {
        communityName: lookupName,
        totalIncome: Math.round(extracted.totalIncome * pvPct),
        totalExpenses: Math.round(extracted.totalExpenses * pvPct),
        netIncome: Math.round((extracted.totalIncome - extracted.totalExpenses) * pvPct),
        accounts: extracted.accounts.map((a) => ({
          ...a,
          amount: Math.round(a.amount * pvPct),
        })),
      };
    }

    const fetchParams = (dateFrom: string, dateTo: string) => {
      const p: Record<string, unknown> = {
        posted_on_from: dateFrom,
        posted_on_to: dateTo,
      };
      if (propertyFilter) p.properties = propertyFilter;
      return p;
    };

    if (period === "ytd" || from.endsWith("-01-01")) {
      const rows = await fetchPvReport<IncomeRow>("income_statement", fetchParams(from, to));
      const extracted = extractTotals(rows, "year_to_date");
      return cachedJson({
        ...applyPct(extracted),
        period: { from, to, method: "year_to_date" },
        ownershipView,
      });
    }

    if (sameMonth(from, to)) {
      const rows = await fetchPvReport<IncomeRow>("income_statement", fetchParams(from, to));
      const extracted = extractTotals(rows, "month_to_date");
      return cachedJson({
        ...applyPct(extracted),
        period: { from, to, method: "month_to_date" },
        ownershipView,
      });
    }

    // Multi-month custom range via YTD subtraction
    const beforeFrom = dayBefore(from);
    const [endRows, startRows] = await Promise.all([
      fetchPvReport<IncomeRow>("income_statement", fetchParams(from, to), true),
      fetchPvReport<IncomeRow>("income_statement", fetchParams(beforeFrom.slice(0, 8) + "01", beforeFrom), true),
    ]);

    const endTotals = extractTotals(endRows, "year_to_date");
    const startTotals = extractTotals(startRows, "year_to_date");

    const deltaAccounts = endTotals.accounts.map((a) => {
      const prev = startTotals.accounts.find((s) => s.number === a.number);
      return {
        ...a,
        amount: Math.round((a.amount - (prev?.amount || 0)) * pvPct),
      };
    });

    return cachedJson({
      communityName: lookupName,
      totalIncome: Math.round((endTotals.totalIncome - startTotals.totalIncome) * pvPct),
      totalExpenses: Math.round((endTotals.totalExpenses - startTotals.totalExpenses) * pvPct),
      netIncome: Math.round(
        ((endTotals.totalIncome - startTotals.totalIncome) -
        (endTotals.totalExpenses - startTotals.totalExpenses)) * pvPct
      ),
      accounts: deltaAccounts,
      period: { from, to, method: "ytd_subtraction" },
      ownershipView,
    });
  } catch (err) {
    console.error("PV Community P&L error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
