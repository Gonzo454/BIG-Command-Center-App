import { NextRequest } from "next/server";
import { fetchReport, firstOfYear, today, parseAmount, cachedJson } from "@/lib/appfolio";
import { ENTITY_PROPERTY_IDS } from "@/lib/appfolio-entities";

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  month_to_date?: string;
  year_to_date?: string;
  last_year_to_date?: string;
}

function classifyAccount(accountNumber: string): "income" | "expense" {
  const prefix = accountNumber.charAt(0);
  if (prefix === "4" || prefix === "5") {
    // 5875/5873 are hotel labor/merchant fees — treat as expense
    if (accountNumber.startsWith("5875") || accountNumber.startsWith("5873")) {
      return "expense";
    }
    return "income";
  }
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

interface GLRow {
  account_name?: string;
  property_name?: string;
  post_date?: string;
  party_name?: string;
  debit?: string;
  credit?: string;
}

interface ExtractedTotals {
  totalRevenue: number;
  totalRevenueLY: number;
  totalExpenses: number;
  totalExpensesLY: number;
  mgmtFees: number;
  commissions: number;
  revenueAccounts: { name: string; number: string; amount: number; mtd: number; ytd: number; lastYearAmount: number }[];
  expenseAccounts: { name: string; number: string; amount: number; mtd: number; ytd: number; lastYearAmount: number }[];
}

function extractTotals(
  rows: IncomeRow[],
  column: "month_to_date" | "year_to_date"
): ExtractedTotals {
  let totalRevenue = 0;
  let totalRevenueLY = 0;
  let totalExpenses = 0;
  let totalExpensesLY = 0;
  let mgmtFees = 0;
  let commissions = 0;
  const revenueAccounts: ExtractedTotals["revenueAccounts"] = [];
  const expenseAccounts: ExtractedTotals["expenseAccounts"] = [];

  for (const row of rows) {
    const name = (row.account_name || "").trim();
    const lowerName = name.toLowerCase();
    const num = (row.account_number || "").trim();
    const amount = parseAmount(row[column]);
    const mtd = parseAmount(row.month_to_date);
    const ytd = parseAmount(row.year_to_date);
    const lastYearAmount = parseAmount(row.last_year_to_date);

    if (lowerName === "total income") {
      totalRevenue = amount;
      totalRevenueLY = lastYearAmount;
      continue;
    }
    if (lowerName === "total expense" || lowerName === "total expenses") {
      totalExpenses = Math.abs(amount);
      totalExpensesLY = Math.abs(lastYearAmount);
      continue;
    }
    if (lowerName === "net income" || lowerName === "net operating income") {
      continue;
    }

    if (!num || amount === 0) continue;

    // Revenue subcategories
    if (num.startsWith("5820")) mgmtFees += amount;
    if (num.startsWith("5750") || num.startsWith("5755")) commissions += amount;

    const type = classifyAccount(num);

    if (type === "income") {
      revenueAccounts.push({
        name,
        number: num,
        amount: Math.abs(amount),
        mtd: Math.abs(mtd),
        ytd: Math.abs(ytd),
        lastYearAmount: Math.abs(lastYearAmount),
      });
    } else {
      // Expense accounts: negate AppFolio's sign so positive = cost, negative = credit
      // AppFolio reports expenses as negative (reduce income); net-credit accounts as positive
      expenseAccounts.push({
        name,
        number: num,
        amount: -amount,
        mtd: -mtd,
        ytd: -ytd,
        lastYearAmount: -lastYearAmount,
      });
    }
  }

  return {
    totalRevenue,
    totalRevenueLY,
    totalExpenses,
    totalExpensesLY,
    mgmtFees,
    commissions,
    revenueAccounts,
    expenseAccounts,
  };
}

interface CapitalAccount {
  name: string;
  number: string;
  amount: number; // positive = contribution (credit), negative = distribution (debit)
}

function buildResponse(
  extracted: ExtractedTotals,
  from: string,
  to: string,
  method: string,
  capitalAccounts: CapitalAccount[] = []
) {
  const netIncome = extracted.totalRevenue - extracted.totalExpenses;
  const netIncomeLY = extracted.totalRevenueLY - extracted.totalExpensesLY;
  const otherRevenue = extracted.totalRevenue - extracted.mgmtFees - extracted.commissions;
  const totalCapital = capitalAccounts.reduce((s, a) => s + a.amount, 0);

  return cachedJson({
    summary: {
      totalRevenue: Math.round(extracted.totalRevenue * 100) / 100,
      totalRevenueLY: Math.round(extracted.totalRevenueLY * 100) / 100,
      revenueChange:
        extracted.totalRevenueLY !== 0
          ? Math.round(((extracted.totalRevenue - extracted.totalRevenueLY) / Math.abs(extracted.totalRevenueLY)) * 10000) / 100
          : 0,
      totalExpenses: Math.round(extracted.totalExpenses * 100) / 100,
      totalExpensesLY: Math.round(extracted.totalExpensesLY * 100) / 100,
      expenseChange:
        extracted.totalExpensesLY !== 0
          ? Math.round(((extracted.totalExpenses - extracted.totalExpensesLY) / Math.abs(extracted.totalExpensesLY)) * 10000) / 100
          : 0,
      netIncome: Math.round(netIncome * 100) / 100,
      netIncomeLY: Math.round(netIncomeLY * 100) / 100,
      netIncomeChange:
        netIncomeLY !== 0
          ? Math.round(((netIncome - netIncomeLY) / Math.abs(netIncomeLY)) * 10000) / 100
          : 0,
      mgmtFees: Math.round(extracted.mgmtFees * 100) / 100,
      commissions: Math.round(extracted.commissions * 100) / 100,
      otherRevenue: Math.round(otherRevenue * 100) / 100,
      totalCapital: Math.round(totalCapital * 100) / 100,
    },
    revenueAccounts: extracted.revenueAccounts,
    expenseAccounts: extracted.expenseAccounts,
    capitalAccounts,
    period: { from, to, method },
  });
}

/**
 * Fetch capital activity (3xxx accounts) from the general ledger.
 * Returns per-account net amounts: positive = contribution (credit), negative = distribution (debit).
 */
async function fetchCapitalAccounts(
  from: string,
  to: string,
  propertyFilter: { properties_ids: number[] }
): Promise<CapitalAccount[]> {
  try {
    const glRows = await fetchReport<GLRow>("general_ledger", {
      from_date: from,
      to_date: to,
      properties: propertyFilter,
    });

    const accountMap = new Map<string, { name: string; amount: number }>();

    for (const row of glRows) {
      const acctField = (row.account_name || "").trim();
      // Match 3xxx account numbers
      const acctMatch = acctField.match(/^(3\d{3}-\d{4}(?:-\d{2})?)\s*-?\s*(.*)/);
      if (!acctMatch) continue;

      const acctNum = acctMatch[1].replace(/-00$/, "");
      const acctName = acctMatch[2] || acctField;
      const debit = parseFloat(row.debit || "0") || 0;
      const credit = parseFloat(row.credit || "0") || 0;

      // Equity accounts: credits increase (contributions), debits decrease (distributions)
      const net = credit - debit;
      if (net === 0) continue;

      const existing = accountMap.get(acctNum);
      if (existing) {
        existing.amount += net;
      } else {
        accountMap.set(acctNum, { name: acctName, amount: net });
      }
    }

    return Array.from(accountMap.entries())
      .map(([number, { name, amount }]) => ({
        name,
        number,
        amount: Math.round(amount * 100) / 100,
      }))
      .filter((a) => a.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = params.get("from") || firstOfYear();
  const to = params.get("to") || today();
  const period = params.get("period") || "ytd";

  const propertyFilter = { properties_ids: [ENTITY_PROPERTY_IDS.big] };

  try {
    // Fetch capital accounts in parallel with income statement
    const capitalPromise = fetchCapitalAccounts(from, to, propertyFilter);

    if (period === "ytd" || from.endsWith("-01-01")) {
      const [rows, capitalAccounts] = await Promise.all([
        fetchReport<IncomeRow>("income_statement", {
          posted_on_from: from,
          posted_on_to: to,
          properties: propertyFilter,
        }),
        capitalPromise,
      ]);
      return buildResponse(extractTotals(rows, "year_to_date"), from, to, "year_to_date", capitalAccounts);
    }

    if (sameMonth(from, to)) {
      const [rows, capitalAccounts] = await Promise.all([
        fetchReport<IncomeRow>("income_statement", {
          posted_on_from: from,
          posted_on_to: to,
          properties: propertyFilter,
        }),
        capitalPromise,
      ]);
      return buildResponse(extractTotals(rows, "month_to_date"), from, to, "month_to_date", capitalAccounts);
    }

    // Multi-month custom range — compute via year_to_date subtraction
    const beforeFrom = dayBefore(from);
    const [endRows, startRows, capitalAccounts] = await Promise.all([
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: from,
        posted_on_to: to,
        properties: propertyFilter,
      }, true),
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: beforeFrom.slice(0, 8) + "01",
        posted_on_to: beforeFrom,
        properties: propertyFilter,
      }, true),
      capitalPromise,
    ]);

    const endTotals = extractTotals(endRows, "year_to_date");
    const startTotals = extractTotals(startRows, "year_to_date");

    // Subtract start from end to get the custom range
    const result: ExtractedTotals = {
      totalRevenue: endTotals.totalRevenue - startTotals.totalRevenue,
      totalRevenueLY: endTotals.totalRevenueLY - startTotals.totalRevenueLY,
      totalExpenses: endTotals.totalExpenses - startTotals.totalExpenses,
      totalExpensesLY: endTotals.totalExpensesLY - startTotals.totalExpensesLY,
      mgmtFees: endTotals.mgmtFees - startTotals.mgmtFees,
      commissions: endTotals.commissions - startTotals.commissions,
      revenueAccounts: endTotals.revenueAccounts.map((a) => {
        const start = startTotals.revenueAccounts.find((s) => s.number === a.number);
        return {
          ...a,
          amount: a.amount - (start?.amount || 0),
          ytd: a.ytd - (start?.ytd || 0),
          lastYearAmount: a.lastYearAmount - (start?.lastYearAmount || 0),
        };
      }).filter((a) => a.amount !== 0),
      expenseAccounts: endTotals.expenseAccounts.map((a) => {
        const start = startTotals.expenseAccounts.find((s) => s.number === a.number);
        return {
          ...a,
          amount: a.amount - (start?.amount || 0),
          ytd: a.ytd - (start?.ytd || 0),
          lastYearAmount: a.lastYearAmount - (start?.lastYearAmount || 0),
        };
      }).filter((a) => a.amount !== 0),
    };

    return buildResponse(result, from, to, "ytd_subtraction", capitalAccounts);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
