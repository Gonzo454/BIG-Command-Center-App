import { NextRequest } from "next/server";
import { fetchReport, firstOfMonth, today, parseAmount } from "@/lib/appfolio";

interface IncomeRow {
  account_name?: string;
  month_to_date?: string;
  year_to_date?: string;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const propertyId = params.get("property_id");
  const from = params.get("from") || firstOfMonth();
  const to = params.get("to") || today();

  if (!propertyId) {
    return Response.json({ error: "property_id required" }, { status: 400 });
  }

  try {
    const rows = await fetchReport<IncomeRow>("income_statement", {
      from_date: from,
      to_date: to,
      properties: { properties_ids: [propertyId] },
    });

    let totalIncome = 0;
    let totalExpenses = 0;
    const accounts: { name: string; amount: number; type: string }[] = [];

    for (const row of rows) {
      const name = (row.account_name || "").trim();
      const lowerName = name.toLowerCase();
      const amount = parseAmount(row.month_to_date);

      if (lowerName === "total income") {
        totalIncome = amount;
        continue;
      }
      if (lowerName === "total expense" || lowerName === "total expenses") {
        totalExpenses = Math.abs(amount);
        continue;
      }
      if (amount !== 0) {
        accounts.push({ name, amount, type: amount > 0 ? "income" : "expense" });
      }
    }

    return Response.json({
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      accounts,
      period: { from, to },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
