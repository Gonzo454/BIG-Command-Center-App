import { NextRequest } from "next/server";
import { firstOfYear, today } from "@/lib/appfolio";
import { computeSectionPnL, computeAccountBreakdown } from "@/lib/gl-parser";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = params.get("from") || firstOfYear();
  const to = params.get("to") || today();

  try {
    // Entity-filtered P&L from GL — single source of truth for BIG numbers
    const sections = computeSectionPnL(from, to);
    const big = sections.big;
    const { revenue, expenses } = computeAccountBreakdown("big", from, to);

    const totalRevenue = big.income;
    const totalExpenses = big.opex;
    const netIncome = totalRevenue - totalExpenses;

    // Revenue sub-categories
    const mgmtFees = revenue
      .filter((a) => a.account.startsWith("5820"))
      .reduce((s, a) => s + a.amount, 0);
    const commissions = revenue
      .filter((a) => a.account.startsWith("5750") || a.account.startsWith("5755"))
      .reduce((s, a) => s + a.amount, 0);
    const otherRevenue = totalRevenue - mgmtFees - commissions;

    return Response.json({
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalRevenueLY: 0,
        revenueChange: 0,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalExpensesLY: 0,
        expenseChange: 0,
        netIncome: Math.round(netIncome * 100) / 100,
        netIncomeLY: 0,
        netIncomeChange: 0,
        mgmtFees: Math.round(mgmtFees * 100) / 100,
        commissions: Math.round(commissions * 100) / 100,
        otherRevenue: Math.round(otherRevenue * 100) / 100,
      },
      revenueAccounts: revenue.map((a) => ({
        name: a.name,
        number: a.account + "-00",
        amount: Math.round(a.amount * 100) / 100,
        mtd: 0,
        ytd: Math.round(a.amount * 100) / 100,
        lastYearAmount: 0,
      })),
      expenseAccounts: expenses.map((a) => ({
        name: a.name,
        number: a.account + "-00",
        amount: Math.round(a.amount * 100) / 100,
        mtd: 0,
        ytd: Math.round(a.amount * 100) / 100,
        lastYearAmount: 0,
      })),
      period: { from, to, method: "gl_entity_filtered" },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
