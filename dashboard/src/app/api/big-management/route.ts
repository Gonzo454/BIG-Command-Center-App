import { NextRequest } from "next/server";
import { fetchReport, firstOfYear, today, parseAmount } from "@/lib/appfolio";

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  month_to_date?: string;
  year_to_date?: string;
  last_year_to_date?: string;
}

// BIG Management revenue accounts — fees BIG earns as a management company
// Excludes hotel staffing (5875-*) and merchant fees (5873) — those belong
// to the hotel LLC that Joe owns, not BIG's management operations
const BIG_REVENUE_ACCOUNTS: Record<string, string> = {
  "5820-0000-00": "Management Fees",
  "5820-1000-00": "Asset Management Fees",
  "5750-0000-00": "Leasing Commission Income",
  "5755-0000-00": "Sale Commission",
  "5760-0000-00": "Internet & Computer Services",
  "5720-1000-00": "Insurance Fee",
  "5700-0000-00": "Miscellaneous Income",
  "5700-0001-00": "Interest Income",
};

// BIG Management's own operating expenses (whitelist approach)
// Only includes costs BIG bears as a management company — NOT property-level
// expenses that building owners pay (hotel ops, property insurance, rent
// payable, TA commissions, advertising, maintenance, utilities, etc.)
const BIG_EXPENSE_ACCOUNTS: Record<string, string> = {
  // Staff wages & payroll
  "6304-0000-00": "Salaries & Wages",
  "6304-0100-00": "Accounting Wages",
  "6305-0000-00": "Salaries & Wages Mgmt",
  "6305-0300-00": "Worker's Comp",
  "6305-1000-00": "Life Insurance",
  "6305-2000-00": "Medical Insurance",
  "6305-2100-00": "Dental Insurance",
  "6305-3200-00": "HSA Contribution",
  "6305-3500-00": "Payroll Fees",
  "6306-1000-00": "Payroll Taxes",
  // Office & technology
  "7000-2000-00": "Microsoft Office",
  "7000-2300-00": "Google Apps",
  "7400-0000-00": "Office Administrations",
  "7420-0000-00": "Office Supplies - Non-recoverable",
  "7420-2000-00": "Postage & Shipping",
  "7430-0000-00": "Computer Repairs & Support",
  "7430-0110-00": "IT Support - Rhyme",
  "7440-0000-00": "Computer Software & License Fees",
  // Professional services
  "7302-0000-00": "Consulting Service",
  // 7605-0000-00 Legal & Evictions — removed: primarily property-level legal
  // 7610-0000-00 Accounting & Tax Services — removed: Baker Tilly tax prep for Joe's entities
  "7610-1000-00": "AppFolio",
  "7620-1000-00": "Permits & Licenses",
  // Employee & misc
  "7520-0000-00": "Employee Relations",
  "7700-0000-00": "Miscellaneous Expense - Non-recoverable",
  "7800-0000-00": "Bank Fees",
  "7802-0000-00": "Late Fees",
  // 7301-0000-00 Management Fee — removed: inter-company or property-level
};

function isBigRevenue(accountNumber: string): boolean {
  return accountNumber in BIG_REVENUE_ACCOUNTS;
}

function isBigExpense(accountNumber: string): boolean {
  return accountNumber in BIG_EXPENSE_ACCOUNTS;
}

function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

interface AccountEntry {
  name: string;
  number: string;
  amount: number;
  lastYearAmount: number;
}

function extractBigAccounts(
  rows: IncomeRow[],
  column: "month_to_date" | "year_to_date"
) {
  const revenue: AccountEntry[] = [];
  const expenses: AccountEntry[] = [];

  for (const r of rows) {
    const num = (r.account_number || "").trim();
    const name = (r.account_name || "").trim();
    if (!num || !name) continue;

    const amount = parseAmount(r[column]);
    const lastYearAmount = parseAmount(r.last_year_to_date);

    if (isBigRevenue(num)) {
      revenue.push({ name, number: num, amount, lastYearAmount });
    } else if (isBigExpense(num)) {
      expenses.push({ name, number: num, amount, lastYearAmount });
    }
  }

  return { revenue, expenses };
}

function buildResponse(
  revenue: AccountEntry[],
  expenses: AccountEntry[],
  from: string,
  to: string,
  method: string
) {
  const totalRevenue = revenue.reduce((s, a) => s + a.amount, 0);
  const totalRevenueLY = revenue.reduce((s, a) => s + a.lastYearAmount, 0);
  const totalExpenses = expenses.reduce((s, a) => s + Math.abs(a.amount), 0);
  const totalExpensesLY = expenses.reduce(
    (s, a) => s + Math.abs(a.lastYearAmount),
    0
  );
  const netIncome = totalRevenue - totalExpenses;
  const netIncomeLY = totalRevenueLY - totalExpensesLY;

  const mgmtFees = revenue
    .filter((a) => a.number.startsWith("5820-"))
    .reduce((s, a) => s + a.amount, 0);
  const commissions = revenue
    .filter(
      (a) => a.number.startsWith("5750-") || a.number.startsWith("5755-")
    )
    .reduce((s, a) => s + a.amount, 0);
  const otherRevenue = revenue
    .filter(
      (a) =>
        !a.number.startsWith("5820-") &&
        !a.number.startsWith("5750-") &&
        !a.number.startsWith("5755-")
    )
    .reduce((s, a) => s + a.amount, 0);

  const pctChange = (cur: number, prev: number) =>
    prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : 0;

  return Response.json({
    summary: {
      totalRevenue,
      totalRevenueLY,
      revenueChange: pctChange(totalRevenue, totalRevenueLY),
      totalExpenses,
      totalExpensesLY,
      expenseChange: pctChange(totalExpenses, totalExpensesLY),
      netIncome,
      netIncomeLY,
      netIncomeChange: pctChange(netIncome, netIncomeLY),
      mgmtFees,
      commissions,
      otherRevenue,
    },
    revenueAccounts: revenue
      .filter((a) => a.amount !== 0 || a.lastYearAmount !== 0)
      .map((a) => ({
        name: a.name,
        number: a.number,
        amount: a.amount,
        lastYearAmount: a.lastYearAmount,
      })),
    expenseAccounts: expenses
      .filter((a) => a.amount !== 0 || a.lastYearAmount !== 0)
      .map((a) => ({
        name: a.name,
        number: a.number,
        amount: a.amount,
        lastYearAmount: a.lastYearAmount,
      })),
    period: { from, to, method },
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = params.get("from") || firstOfYear();
  const to = params.get("to") || today();
  const period = params.get("period") || "ytd";

  try {
    // YTD — use year_to_date column directly
    if (from.endsWith("-01-01") || period === "ytd") {
      const rows = await fetchReport<IncomeRow>("income_statement", {
        posted_on_from: from,
        posted_on_to: to,
      });
      const { revenue, expenses } = extractBigAccounts(rows, "year_to_date");
      return buildResponse(revenue, expenses, from, to, "year_to_date");
    }

    // MTD — single month, use month_to_date column
    if (sameMonth(from, to)) {
      const rows = await fetchReport<IncomeRow>("income_statement", {
        posted_on_from: from,
        posted_on_to: to,
      });
      const { revenue, expenses } = extractBigAccounts(rows, "month_to_date");
      return buildResponse(revenue, expenses, from, to, "month_to_date");
    }

    // QTD or custom multi-month — compute via YTD subtraction
    const beforeFrom = dayBefore(from);
    const [endRows, startRows] = await Promise.all([
      fetchReport<IncomeRow>(
        "income_statement",
        { posted_on_from: from, posted_on_to: to },
        true
      ),
      fetchReport<IncomeRow>(
        "income_statement",
        {
          posted_on_from: beforeFrom.slice(0, 8) + "01",
          posted_on_to: beforeFrom,
        },
        true
      ),
    ]);

    const end = extractBigAccounts(endRows, "year_to_date");
    const start = extractBigAccounts(startRows, "year_to_date");

    const startRevMap = new Map(
      start.revenue.map((a) => [a.number, a.amount])
    );
    const startExpMap = new Map(
      start.expenses.map((a) => [a.number, a.amount])
    );

    const revenue = end.revenue.map((a) => ({
      ...a,
      amount: a.amount - (startRevMap.get(a.number) || 0),
    }));
    const expenses = end.expenses.map((a) => ({
      ...a,
      amount: a.amount - (startExpMap.get(a.number) || 0),
    }));

    return buildResponse(revenue, expenses, from, to, "ytd_subtraction");
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
