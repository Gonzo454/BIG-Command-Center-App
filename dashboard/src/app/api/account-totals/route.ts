import { NextRequest } from "next/server";
import { fetchReport, parseAmount, firstOfYear, firstOfMonth, firstOfQuarter, today, cachedJson } from "@/lib/appfolio";
import { ENTITY_PROPERTY_IDS } from "@/lib/appfolio-entities";
import { getOwnership } from "@/lib/ownership";
import { getPropertyConfig } from "@/lib/property-config";

interface GLRow {
  account_name?: string;
  property_name?: string;
  post_date?: string;
  debit?: string;
  credit?: string;
}

interface IncomeRow {
  account_name?: string;
  month_to_date?: string;
  year_to_date?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const ownershipView = searchParams.get("view") === "joe";
    const period = searchParams.get("period") || "ytd";
    const paramFrom = searchParams.get("from");
    const paramTo = searchParams.get("to");

    let rangeFrom: string;
    let rangeTo: string;

    if (paramFrom && paramTo) {
      rangeFrom = paramFrom;
      rangeTo = paramTo;
    } else if (period === "mtd") {
      rangeFrom = firstOfMonth();
      rangeTo = today();
    } else if (period === "qtd") {
      rangeFrom = firstOfQuarter();
      rangeTo = today();
    } else {
      rangeFrom = firstOfYear();
      rangeTo = today();
    }

    // Compute per-property P&L from GL filtered by date range
    const [glRows, hotelIS] = await Promise.all([
      fetchReport<GLRow>("general_ledger", {
        posted_on_from: rangeFrom,
        posted_on_to: rangeTo,
      }),
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: rangeFrom,
        posted_on_to: rangeTo,
        properties: { properties_ids: [ENTITY_PROPERTY_IDS.hotel] },
      }),
    ]);

    // Aggregate income - expenses per property from GL
    const propertyMap = new Map<string, number>();

    for (const r of glRows) {
      const propName = (r.property_name || "").trim();
      if (!propName) continue;

      const acctField = (r.account_name || "").trim();
      const acctMatch = acctField.match(/^(\d{4}-\d{4}(-\d{2})?)/);
      if (!acctMatch) continue;
      let account = acctMatch[1];
      if (account.endsWith("-00")) account = account.slice(0, -3);

      const prefix = account.charAt(0);
      // Only count P&L accounts (4=income, 5=COGS/income adj, 6=expenses, 7=expenses)
      // Skip capital (3xxx), asset/liability (1xxx/2xxx), below-line (8xxx)
      if (prefix !== "4" && prefix !== "5" && prefix !== "6" && prefix !== "7") continue;

      const debit = parseFloat(r.debit || "0") || 0;
      const credit = parseFloat(r.credit || "0") || 0;

      let amount = 0;
      if (prefix === "4" || prefix === "5") {
        // Income: credits increase, debits decrease
        // But payroll reimbursement accounts (5875, 5873) are contra-expense
        if (account.startsWith("5875") || account.startsWith("5873")) {
          amount = -(debit - credit); // Net as negative expense (positive P&L impact)
        } else if (account.startsWith("5756")) {
          continue; // Skip internal transfer accounts
        } else {
          amount = credit - debit;
        }
      } else {
        // Expenses (6xxx, 7xxx): debits increase expense, reducing net income
        amount = -(debit - credit);
      }

      propertyMap.set(propName, (propertyMap.get(propName) || 0) + amount);
    }

    // Determine correct IS column based on period
    const isMtd = period === "mtd" && !paramFrom;
    const isColumn: "month_to_date" | "year_to_date" = isMtd ? "month_to_date" : "year_to_date";

    // Always override Hotel from income_statement (more accurate than GL aggregation)
    let hotelIncome = 0;
    let hotelExpenses = 0;
    for (const row of hotelIS) {
      const name = (row.account_name || "").toLowerCase().trim();
      const amount = parseAmount(row[isColumn]);
      if (name === "total income") hotelIncome = amount;
      if (name === "total expense" || name === "total expenses") hotelExpenses = Math.abs(amount);
    }
    propertyMap.set("Badger Hotel Group", Math.round(hotelIncome - hotelExpenses));

    // Convert to array and filter archived
    const properties = Array.from(propertyMap.entries())
      .filter(([name]) => !getPropertyConfig(name).archived)
      .map(([name, netAmount]) => ({
        name,
        netAmount: Math.round(netAmount),
        endingBalance: 0,
      }));

    const result = properties.map((p) => {
      const pct = getOwnership(p.name);
      return {
        ...p,
        netAmount: ownershipView ? Math.round(p.netAmount * pct) : p.netAmount,
        ownershipPct: pct,
      };
    });

    // Sort by net amount descending
    result.sort((a, b) => b.netAmount - a.netAmount);

    return cachedJson({ properties: result, ownershipView });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
