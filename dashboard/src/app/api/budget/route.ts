import { NextRequest } from "next/server";
import { fetchReport, parseAmount } from "@/lib/appfolio";

interface BudgetRow {
  account_name?: string;
  month_to_date_actual?: string;
  month_to_date_budget?: string;
  year_to_date_actual?: string;
  year_to_date_budget?: string;
  variance_percentage?: string;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const year = params.get("year") || String(new Date().getFullYear());

  try {
    const rows = await fetchReport<BudgetRow>("annual_budget_comparative", {
      year: parseInt(year),
    });

    const items = rows
      .filter((r) => r.account_name)
      .map((r) => ({
        account: r.account_name!.trim(),
        mtdActual: parseAmount(r.month_to_date_actual),
        mtdBudget: parseAmount(r.month_to_date_budget),
        ytdActual: parseAmount(r.year_to_date_actual),
        ytdBudget: parseAmount(r.year_to_date_budget),
        variancePct: parseAmount(r.variance_percentage),
      }));

    return Response.json({ items, year });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
