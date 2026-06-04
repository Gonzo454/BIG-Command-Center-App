import { NextRequest } from "next/server";
import { fetchReport, firstOfYear, today } from "@/lib/appfolio";
import { ENTITY_PROPERTY_IDS, ManagedEntity } from "@/lib/appfolio-entities";

interface GLRow {
  account_name?: string;
  property_name?: string;
  post_date?: string;
  party_name?: string;
  debit?: string;
  credit?: string;
  remarks?: string;
  type?: string;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const account = params.get("account");
  const entity = (params.get("entity") || "big") as ManagedEntity;
  const from = params.get("from") || firstOfYear();
  const to = params.get("to") || today();

  if (!account) {
    return Response.json(
      { error: "account parameter required" },
      { status: 400 }
    );
  }

  try {
    // Strip trailing "-00" suffix to get the account prefix (e.g. "6304-0000-00" → "6304-0000")
    const prefix = account.replace(/-00$/, "");

    const propertyId = ENTITY_PROPERTY_IDS[entity] || ENTITY_PROPERTY_IDS.big;
    const rows = await fetchReport<GLRow>("general_ledger", {
      from_date: from,
      to_date: to,
      properties: { properties_ids: [propertyId] },
    });

    const transactions: {
      date: string;
      vendor: string;
      property: string;
      description: string;
      amount: number;
    }[] = [];

    for (const r of rows) {
      // Extract account number from "6304-0000-00 - Salaries & Wages"
      const acctField = (r.account_name || "").trim();
      const acctMatch = acctField.match(/^(\d{4}-\d{4}(-\d{2})?)/);
      if (!acctMatch) continue;

      let rowAccount = acctMatch[1];
      if (rowAccount.endsWith("-00")) rowAccount = rowAccount.slice(0, -3);

      if (!rowAccount.startsWith(prefix)) continue;

      const debit = parseFloat(r.debit || "0") || 0;
      const credit = parseFloat(r.credit || "0") || 0;

      // Determine net amount using same sign logic as the summary
      const acctPrefix = rowAccount.charAt(0);
      let net: number;
      if (acctPrefix === "4" || acctPrefix === "5") {
        if (rowAccount.startsWith("5875") || rowAccount.startsWith("5873")) {
          net = debit - credit; // hotel labor/merchant = expense
        } else if (rowAccount.startsWith("5756")) {
          continue; // gain on sale — skip
        } else {
          net = credit - debit; // revenue
        }
      } else if (rowAccount.startsWith("6600") || rowAccount.startsWith("6650")) {
        continue; // depreciation/amortization — skip
      } else {
        net = debit - credit; // expenses
      }
      if (net === 0) continue;

      transactions.push({
        date: r.post_date || "",
        vendor: r.party_name || "—",
        property: r.property_name || "",
        description: r.remarks || "",
        amount: net,
      });
    }

    transactions.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      return Math.abs(b.amount) - Math.abs(a.amount);
    });

    return Response.json({
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
