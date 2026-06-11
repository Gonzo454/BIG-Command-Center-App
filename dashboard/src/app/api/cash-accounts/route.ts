import { NextRequest } from "next/server";
import { fetchReport, today, cachedJson } from "@/lib/appfolio";

export const maxDuration = 60;

interface BalanceSheetRow {
  account_number?: string;
  account_name?: string;
  balance?: string;
}

interface AccountTotalsRow {
  property_id?: number;
  property_name?: string;
}

// Cash / escrow asset accounts: operating cash (1110/1114/1140),
// escrow & reserves (1117/1123/1354), other deposit accounts (1150/1160)
function classifyCashAccount(num: string, name: string): "operating" | "escrow" | null {
  const lower = name.toLowerCase();
  if (lower.includes("escrow") || lower.includes("reserve") || num.startsWith("1117") || num.startsWith("1123") || num.startsWith("1354")) {
    return "escrow";
  }
  if (num.startsWith("1110") || num.startsWith("1114") || num.startsWith("1140") || (num.startsWith("11") && (lower.includes("cash") || lower.includes("money market") || lower.includes("deposit")))) {
    return "operating";
  }
  return null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const propertyName = params.get("property");
  const asOf = params.get("to") || today();

  try {
    let propertyFilter: Record<string, unknown> | undefined;
    if (propertyName) {
      const allProperties = await fetchReport<AccountTotalsRow>("account_totals", {
        posted_on_from: asOf.slice(0, 8) + "01",
        posted_on_to: asOf,
      });
      const match = allProperties.find((p) => p.property_name === propertyName);
      if (!match?.property_id) {
        return Response.json({ error: `Property "${propertyName}" not found` }, { status: 404 });
      }
      propertyFilter = { properties: { properties_ids: [match.property_id] } };
    }

    const rows = await fetchReport<BalanceSheetRow>("balance_sheet", {
      as_of_date: asOf,
      ...propertyFilter,
    });

    const operating: { name: string; number: string; balance: number }[] = [];
    const escrow: { name: string; number: string; balance: number }[] = [];

    for (const row of rows) {
      const num = (row.account_number || "").trim();
      const name = (row.account_name || "").trim();
      if (!num || !num.startsWith("1")) continue;
      const type = classifyCashAccount(num, name);
      if (!type) continue;
      const balance = Math.round(parseFloat(row.balance || "0") * 100) / 100;
      if (balance === 0) continue;
      (type === "escrow" ? escrow : operating).push({ name, number: num, balance });
    }

    return cachedJson({
      asOf,
      propertyName: propertyName || null,
      operating,
      escrow,
      totalOperating: Math.round(operating.reduce((s, a) => s + a.balance, 0) * 100) / 100,
      totalEscrow: Math.round(escrow.reduce((s, a) => s + a.balance, 0) * 100) / 100,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch cash accounts" },
      { status: 500 }
    );
  }
}
