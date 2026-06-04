import { NextRequest } from "next/server";
import { fetchReport, parseAmount, cachedJson } from "@/lib/appfolio";

interface CashFlowRow {
  account_name?: string;
  account_number?: string;
  selected_period?: string;
  fiscal_year_to_date?: string;
}

function classifySection(accountNumber: string, accountName: string): string {
  const name = accountName.toLowerCase();

  if (name.includes("cash distribution") || name.includes("cash contribution")) {
    return "financing";
  }
  if (name.includes("mortgage") || name.includes("loan")) {
    return "financing";
  }
  if (name.includes("reserve") || name.includes("escrow") || name.includes("receivable")) {
    return "investing";
  }
  if (name.includes("sale proceeds") || name.includes("gain on sale")) {
    return "investing";
  }

  const prefix = accountNumber.charAt(0);
  if (prefix === "4" || prefix === "5") return "operating";
  if (prefix === "6" || prefix === "7") return "operating";
  if (prefix === "8") return "financing";

  return "operating";
}

function isExpenseAccount(accountNumber: string): boolean {
  const prefix = accountNumber.charAt(0);
  return prefix === "6" || prefix === "7" || prefix === "8";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const column = params.get("period") === "ytd" ? "fiscal_year_to_date" : "selected_period";

  try {
    const rows = await fetchReport<CashFlowRow>("cash_flow");

    const sections: Record<string, { name: string; number: string; amount: number }[]> = {
      operating: [],
      investing: [],
      financing: [],
    };

    let totalIncome = 0;
    let totalExpense = 0;

    for (const r of rows) {
      const name = (r.account_name || "").trim();
      const number = (r.account_number || "").trim();
      const amount = parseAmount(r[column]);
      const lowerName = name.toLowerCase();

      if (lowerName === "total income") {
        totalIncome = amount;
        continue;
      }
      if (lowerName === "total expense" || lowerName === "total expenses") {
        totalExpense = amount;
        continue;
      }

      if (!number || amount === 0) continue;

      const section = classifySection(number, name);
      const signedAmount = (section === "operating" || section === "financing") && isExpenseAccount(number) ? -Math.abs(amount) : amount;
      sections[section].push({ name, number, amount: signedAmount });
    }

    const operatingTotal = totalIncome - Math.abs(totalExpense);
    const investingTotal = sections.investing.reduce((s, a) => s + a.amount, 0);
    const financingTotal = sections.financing.reduce((s, a) => s + a.amount, 0);

    return cachedJson({
      operating: {
        items: sections.operating.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
        total: operatingTotal,
        income: totalIncome,
        expenses: Math.abs(totalExpense),
      },
      investing: {
        items: sections.investing.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
        total: investingTotal,
      },
      financing: {
        items: sections.financing.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
        total: financingTotal,
      },
      netCashFlow: operatingTotal + investingTotal + financingTotal,
      period: column === "fiscal_year_to_date" ? "ytd" : "mtd",
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
