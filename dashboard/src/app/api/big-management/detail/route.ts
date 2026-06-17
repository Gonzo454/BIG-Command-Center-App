import { NextRequest } from "next/server";
import { fetchReport, firstOfYear, today, cachedJson } from "@/lib/appfolio";
import { classifyEntityByName } from "@/lib/appfolio-entities";

interface GLRow {
  account_name?: string;
  property_name?: string;
  post_date?: string;
  party_name?: string;
  description?: string;
  debit?: string;
  credit?: string;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const account = params.get("account");
  const entity = params.get("entity") || "big";
  const from = params.get("from") || firstOfYear();
  const to = params.get("to") || today();

  if (!account) {
    return Response.json(
      { error: "account parameter required" },
      { status: 400 }
    );
  }

  try {
    // The live general ledger is the same authoritative source the summary
    // uses, so drill-down detail always matches the account totals and stays
    // current (the static GL export went stale every day).
    const glRows = await fetchReport<GLRow>("general_ledger", {
      posted_on_from: from,
      posted_on_to: to,
    });

    const prefix = account.replace(/-00$/, "");

    const transactions: {
      date: string;
      vendor: string;
      property: string;
      description: string;
      amount: number;
    }[] = [];

    for (const row of glRows) {
      if (classifyEntityByName((row.property_name || "").trim()) !== entity) continue;

      const code = (row.account_name || "").split(" - ")[0].trim();
      if (!code) continue;
      if (!code.replace(/-00$/, "").startsWith(prefix)) continue;

      const debit = parseFloat(row.debit || "0") || 0;
      const credit = parseFloat(row.credit || "0") || 0;
      const acctPrefix = code.charAt(0);

      let net: number;
      if (acctPrefix === "4" || acctPrefix === "5") {
        if (code.startsWith("5875") || code.startsWith("5873") || code.startsWith("5760")) {
          net = debit - credit; // hotel labor / merchant fees / billbacks = expense
        } else if (code.startsWith("5756")) {
          continue; // gain on sale — skip
        } else {
          net = credit - debit; // revenue
        }
      } else if (code.startsWith("6600") || code.startsWith("6650")) {
        continue; // depreciation / amortization — skip
      } else {
        net = debit - credit; // expenses
      }
      if (net === 0) continue;

      transactions.push({
        date: row.post_date || "",
        vendor: row.party_name || "—",
        property: row.property_name || "",
        description: row.description || "",
        amount: net,
      });
    }

    transactions.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      return Math.abs(b.amount) - Math.abs(a.amount);
    });

    return cachedJson({
      account,
      transactions,
      total: transactions.reduce((s, t) => s + t.amount, 0),
      count: transactions.length,
      period: { from, to },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
