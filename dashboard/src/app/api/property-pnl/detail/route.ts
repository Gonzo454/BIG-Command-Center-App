import { NextRequest } from "next/server";
import { fetchReport, firstOfYear, today } from "@/lib/appfolio";

interface GLRow {
  account_name?: string;
  property_name?: string;
  post_date?: string;
  party_name?: string;
  debit?: string;
  credit?: string;
  memo?: string;
  description?: string;
  ref_number?: string;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const account = params.get("account");
  const property = params.get("property");
  const from = params.get("from") || firstOfYear();
  const to = params.get("to") || today();

  if (!account) {
    return Response.json(
      { error: "account parameter required" },
      { status: 400 }
    );
  }

  try {
    const rows = await fetchReport<GLRow>("general_ledger", {
      from_date: from,
      to_date: to,
    });

    const accountBase = account.replace(/-00$/, "");

    const transactions: {
      date: string;
      vendor: string;
      property: string;
      description: string;
      amount: number;
    }[] = [];

    const propertyLower = property ? property.toLowerCase() : null;

    for (const r of rows) {
      // AppFolio GL ignores from_date/to_date — filter by post_date in code
      const postDate = (r.post_date || "").slice(0, 10);
      if (postDate < from || postDate > to) continue;

      // Filter by property name if provided
      const rowProperty = (r.property_name || "").trim();
      if (propertyLower && !rowProperty.toLowerCase().includes(propertyLower)) continue;

      const acctField = (r.account_name || "").trim();
      // Extract account number from the account_name field (e.g. "4500-000 - Rent Income")
      const acctMatch = acctField.match(/^(\d{4}-\d{3,4}(?:-\d{2})?)/);
      if (!acctMatch) continue;

      const rowAcctNum = acctMatch[1].replace(/-00$/, "");
      if (rowAcctNum !== account && rowAcctNum !== accountBase) continue;

      const debit = parseFloat(r.debit || "0") || 0;
      const credit = parseFloat(r.credit || "0") || 0;
      if (debit === 0 && credit === 0) continue;

      // For income accounts (4xxx/5xxx): amount = credit - debit (positive = income)
      // For expense accounts (6xxx/7xxx/8xxx): amount = debit - credit (positive = expense)
      const acctPrefix = account.charAt(0);
      const amount = (acctPrefix === "4" || acctPrefix === "5")
        ? credit - debit
        : debit - credit;

      if (amount === 0) continue;

      transactions.push({
        date: r.post_date || "",
        vendor: r.party_name || "—",
        property: (r.property_name || "").trim(),
        description: r.memo || r.description || "",
        amount,
      });
    }

    transactions.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      return Math.abs(b.amount) - Math.abs(a.amount);
    });

    return Response.json({
      account,
      property,
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


