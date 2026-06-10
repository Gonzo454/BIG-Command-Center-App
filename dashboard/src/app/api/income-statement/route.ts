import { NextRequest } from "next/server";
import { fetchReport, firstOfMonth, today, parseAmount, cachedJson } from "@/lib/appfolio";

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  month_to_date?: string;
  year_to_date?: string;
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
      if (type === "income") {
        accounts.push({ name, number: row.account_number, amount: Math.abs(amount), type });
      } else {
        // Expense: negate so positive = cost, negative = credit/billback
        accounts.push({ name, number: row.account_number, amount: -amount, type });
      }
    }
  }

  return { totalIncome, totalExpenses, accounts };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = params.get("from") || firstOfMonth();
  const to = params.get("to") || today();
  const period = params.get("period") || "mtd";

  try {
    if (from.endsWith("-01-01") || period === "ytd") {
      // YTD range — use year_to_date directly
      const rows = await fetchReport<IncomeRow>("income_statement", {
        posted_on_from: from,
        posted_on_to: to,
      });
      const { totalIncome, totalExpenses, accounts } = extractTotals(rows, "year_to_date");
      return cachedJson({
        totalIncome,
        totalExpenses,
        netIncome: totalIncome - totalExpenses,
        accounts,
        period: { from, to, method: "year_to_date" },
      });
    }

    if (sameMonth(from, to)) {
      // Single month — use month_to_date directly
      const rows = await fetchReport<IncomeRow>("income_statement", {
        posted_on_from: from,
        posted_on_to: to,
      });
      const { totalIncome, totalExpenses, accounts } = extractTotals(rows, "month_to_date");
      return cachedJson({
        totalIncome,
        totalExpenses,
        netIncome: totalIncome - totalExpenses,
        accounts,
        period: { from, to, method: "month_to_date" },
      });
    }

    // Multi-month custom range — compute via year_to_date subtraction
    const beforeFrom = dayBefore(from);
    const [endRows, startRows] = await Promise.all([
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: from,
        posted_on_to: to,
      }, true),
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: beforeFrom.slice(0, 8) + "01",
        posted_on_to: beforeFrom,
      }, true),
    ]);

    const endTotals = extractTotals(endRows, "year_to_date");
    const startTotals = extractTotals(startRows, "year_to_date");

    const totalIncome = endTotals.totalIncome - startTotals.totalIncome;
    const totalExpenses = endTotals.totalExpenses - startTotals.totalExpenses;

    // Build per-account diff
    const startMap = new Map<string, number>();
    for (const a of startTotals.accounts) {
      startMap.set(a.number, a.amount);
    }
    const accounts = endTotals.accounts
      .map((a) => ({
        ...a,
        amount: a.amount - (startMap.get(a.number) || 0),
      }))
      .filter((a) => a.amount !== 0);

    return cachedJson({
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      accounts,
      period: { from, to, method: "ytd_subtraction" },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
