import { NextRequest } from "next/server";
import { fetchReport, firstOfMonth, today, parseAmount, cachedJson } from "@/lib/appfolio";

interface BudgetRow {
  account_name?: string;
  account_number?: string;
  actual?: string;
  budget?: string;
  variance?: string;
  percent_variance?: string;
}

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  month_to_date?: string;
  year_to_date?: string;
  last_year_to_date?: string;
}

function classifyAccount(accountNumber: string): "income" | "expense" {
  const prefix = accountNumber.charAt(0);
  if (prefix === "4" || prefix === "5") return "income";
  return "expense";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = params.get("from") || firstOfMonth();
  const to = params.get("to") || today();

  try {
    // Try budget report; if unavailable, fall back to YoY via income_statement
    let budgetRows: BudgetRow[] = [];
    try {
      budgetRows = await fetchReport<BudgetRow>("budget", {
        posted_on_from: from,
        posted_on_to: to,
      });
    } catch {
      // budget report not available in this AppFolio instance
    }

    if (budgetRows.length > 0) {
      const accounts = budgetRows
        .filter((r) => r.account_number && r.account_name)
        .map((r) => ({
          name: (r.account_name || "").trim(),
          number: (r.account_number || "").trim(),
          actual: parseAmount(r.actual),
          budget: parseAmount(r.budget),
          variance: parseAmount(r.variance),
          percentVariance: parseAmount(r.percent_variance),
          type: classifyAccount((r.account_number || "").trim()),
        }))
        .filter((a) => a.actual !== 0 || a.budget !== 0);

      return cachedJson({ hasBudget: true, accounts, period: { from, to } });
    }

    // Fallback: use income_statement for YoY comparison
    const isRows = await fetchReport<IncomeRow>("income_statement", {
      posted_on_from: from,
      posted_on_to: to,
    });

    const accounts = isRows
      .filter((r) => r.account_number && r.account_name)
      .map((r) => {
        const ytd = parseAmount(r.year_to_date);
        const lastYear = parseAmount(r.last_year_to_date);
        return {
          name: (r.account_name || "").trim(),
          number: (r.account_number || "").trim(),
          actual: parseAmount(r.month_to_date),
          budget: 0,
          ytd,
          lastYearYtd: lastYear,
          yoyVariance: lastYear !== 0 ? ((ytd - lastYear) / Math.abs(lastYear)) * 100 : 0,
          type: classifyAccount((r.account_number || "").trim()),
        };
      })
      .filter((a) => a.actual !== 0 || a.ytd !== 0);

    let totalIncome = 0;
    let totalExpenses = 0;
    let lastYearIncome = 0;
    let lastYearExpenses = 0;

    for (const r of isRows) {
      const name = (r.account_name || "").toLowerCase();
      if (name === "total income") {
        totalIncome = parseAmount(r.year_to_date);
        lastYearIncome = parseAmount(r.last_year_to_date);
      }
      if (name === "total expense" || name === "total expenses") {
        totalExpenses = Math.abs(parseAmount(r.year_to_date));
        lastYearExpenses = Math.abs(parseAmount(r.last_year_to_date));
      }
    }

    return cachedJson({
      hasBudget: false,
      accounts,
      yoySummary: {
        totalIncome,
        lastYearIncome,
        incomeChange: lastYearIncome !== 0 ? ((totalIncome - lastYearIncome) / Math.abs(lastYearIncome)) * 100 : 0,
        totalExpenses,
        lastYearExpenses,
        expenseChange: lastYearExpenses !== 0 ? ((totalExpenses - lastYearExpenses) / Math.abs(lastYearExpenses)) * 100 : 0,
      },
      period: { from, to },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
