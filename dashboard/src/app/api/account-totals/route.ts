import { fetchReport, parseAmount } from "@/lib/appfolio";

interface AccountTotalRow {
  property_name?: string;
  net_amount?: string;
  ending_balance?: string;
}

export async function GET() {
  try {
    const rows = await fetchReport<AccountTotalRow>("account_totals");

    const properties = rows
      .filter((r) => r.property_name && r.property_name.trim())
      .map((r) => ({
        name: r.property_name!.trim(),
        netAmount: parseAmount(r.net_amount),
        endingBalance: parseAmount(r.ending_balance),
      }));

    return Response.json({ properties });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
