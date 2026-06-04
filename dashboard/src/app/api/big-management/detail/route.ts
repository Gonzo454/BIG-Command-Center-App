import { NextRequest } from "next/server";
import { firstOfYear, today } from "@/lib/appfolio";
import { getAccountTransactions } from "@/lib/gl-parser";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const account = params.get("account");
  const from = params.get("from") || firstOfYear();
  const to = params.get("to") || today();

  if (!account) {
    return Response.json(
      { error: "account parameter required" },
      { status: 400 }
    );
  }

  try {
    // Strip trailing "-00" suffix to get the GL prefix (e.g. "6304-0000-00" → "6304-0000")
    const prefix = account.replace(/-00$/, "");

    const rows = getAccountTransactions("big", prefix, from, to);

    const transactions = rows.map((r) => ({
      date: r.date,
      vendor: r.payee || "—",
      property: r.entity,
      description: r.description,
      amount: r.amount,
    }));

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
