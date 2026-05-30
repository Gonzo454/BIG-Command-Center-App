import { NextRequest } from "next/server";
import { fetchReport, firstOfYear, today, parseAmount } from "@/lib/appfolio";

interface CheckRow {
  vendor_name?: string;
  payee_name?: string;
  check_date?: string;
  payment_amount?: string;
  invoice_amount?: string;
  amount?: string;
  gl_account_name?: string;
  gl_account_number?: string;
  property_name?: string;
  memo?: string;
  description?: string;
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
    const rows = await fetchReport<CheckRow>("check_register_detail", {
      from_date: from,
      to_date: to,
    });

    const propertyLower = property ? property.toLowerCase() : null;
    const accountBase = account.replace(/-00$/, "");

    const transactions: {
      date: string;
      vendor: string;
      property: string;
      description: string;
      amount: number;
    }[] = [];

    for (const r of rows) {
      const rowProperty = (r.property_name || "").trim();
      if (propertyLower && !rowProperty.toLowerCase().includes(propertyLower)) continue;

      const rowGlNum = (r.gl_account_number || "").trim();
      if (rowGlNum !== account && rowGlNum !== accountBase) continue;

      const vendor = r.vendor_name || r.payee_name || "Unknown";
      const amount =
        parseAmount(r.invoice_amount) ||
        parseAmount(r.amount) ||
        parseAmount(r.payment_amount);

      if (amount === 0) continue;

      transactions.push({
        date: r.check_date || "",
        vendor,
        property: rowProperty,
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
