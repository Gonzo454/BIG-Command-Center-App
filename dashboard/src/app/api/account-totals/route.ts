import { NextRequest } from "next/server";
import { fetchReport, parseAmount, firstOfYear, today, cachedJson } from "@/lib/appfolio";
import { ENTITY_PROPERTY_IDS } from "@/lib/appfolio-entities";
import { getOwnership } from "@/lib/ownership";

interface AccountTotalRow {
  property_name?: string;
  net_amount?: string;
  ending_balance?: string;
}

interface IncomeRow {
  account_name?: string;
  year_to_date?: string;
}

export async function GET(request: NextRequest) {
  try {
    const ownershipView = request.nextUrl.searchParams.get("view") === "joe";

    const [rows, hotelIS] = await Promise.all([
      fetchReport<AccountTotalRow>("account_totals"),
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: firstOfYear(),
        posted_on_to: today(),
        properties: { properties_ids: [ENTITY_PROPERTY_IDS.hotel] },
      }),
    ]);

    const properties = rows
      .filter((r) => r.property_name && r.property_name.trim())
      .map((r) => ({
        name: r.property_name!.trim(),
        netAmount: parseAmount(r.net_amount),
        endingBalance: parseAmount(r.ending_balance),
      }));

    // Badger Hotel Group is not in AppFolio account_totals — inject from live income_statement
    if (!properties.some((p) => p.name === "Badger Hotel Group")) {
      let hotelIncome = 0;
      let hotelExpenses = 0;
      for (const row of hotelIS) {
        const name = (row.account_name || "").toLowerCase().trim();
        const amount = parseAmount(row.year_to_date);
        if (name === "total income") hotelIncome = amount;
        if (name === "total expense" || name === "total expenses") hotelExpenses = Math.abs(amount);
      }
      properties.push({
        name: "Badger Hotel Group",
        netAmount: Math.round(hotelIncome - hotelExpenses),
        endingBalance: 0,
      });
    }

    const result = properties.map((p) => {
      const pct = getOwnership(p.name);
      return {
        ...p,
        netAmount: ownershipView ? Math.round(p.netAmount * pct) : p.netAmount,
        ownershipPct: pct,
      };
    });

    return cachedJson({ properties: result, ownershipView });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
