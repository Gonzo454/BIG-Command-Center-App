import { NextRequest } from "next/server";
import { fetchReport, firstOfMonth, today, parseAmount } from "@/lib/appfolio";

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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const propertyName = params.get("property");
  const from = params.get("from") || firstOfMonth();
  const to = params.get("to") || today();
  const period = params.get("period") || "mtd";

  if (!propertyName) {
    return Response.json({ error: "property parameter required" }, { status: 400 });
  }

  try {
    // Look up property numeric ID from account_totals
    const allProperties = await fetchReport<AccountTotalsRow>("account_totals", {
      posted_on_from: from,
      posted_on_to: to,
    });
    const match = allProperties.find(
      (p) => p.property_name === propertyName
    );
    if (!match?.property_id) {
      return Response.json(
        { error: `Property "${propertyName}" not found` },
        { status: 404 }
      );
    }

    const rows = await fetchReport<IncomeRow>("income_statement", {
      from_date: from,
      to_date: to,
      properties: { properties_ids: [match.property_id] },
    });

    const column = period === "ytd" ? "year_to_date" : "month_to_date";

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

    return Response.json({
      propertyName,
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      accounts,
      period: { from, to, column },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
