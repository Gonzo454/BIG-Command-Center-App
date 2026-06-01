import { NextRequest } from "next/server";
import { fetchReport, parseAmount, firstOfYear, today } from "@/lib/appfolio";
import { computeSectionPnL } from "@/lib/gl-parser";
import { getOwnership } from "@/lib/ownership";

interface AccountTotalRow {
  property_name?: string;
  net_amount?: string;
  ending_balance?: string;
}

export async function GET(request: NextRequest) {
  try {
    const ownershipView = request.nextUrl.searchParams.get("view") === "joe";
    const rows = await fetchReport<AccountTotalRow>("account_totals");

    const properties = rows
      .filter((r) => r.property_name && r.property_name.trim())
      .map((r) => ({
        name: r.property_name!.trim(),
        netAmount: parseAmount(r.net_amount),
        endingBalance: parseAmount(r.ending_balance),
      }));

    // Badger Hotel Group is not in AppFolio account_totals — inject from GL
    if (!properties.some((p) => p.name === "Badger Hotel Group")) {
      const sections = computeSectionPnL(firstOfYear(), today());
      properties.push({
        name: "Badger Hotel Group",
        netAmount: Math.round(sections.hotel.noi),
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

    return Response.json({ properties: result, ownershipView });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
