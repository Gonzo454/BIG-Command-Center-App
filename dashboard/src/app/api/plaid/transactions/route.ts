import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";

export async function POST(request: Request) {
  if (!isPlaidConfigured()) {
    return Response.json(
      { error: "Plaid is not configured." },
      { status: 503 }
    );
  }

  try {
    const { access_token, start_date, end_date } = await request.json();

    if (!access_token) {
      return Response.json({ error: "access_token is required" }, { status: 400 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = start_date || thirtyDaysAgo.toISOString().split("T")[0];
    const endDate = end_date || now.toISOString().split("T")[0];

    const client = getPlaidClient();
    const response = await client.transactionsGet({
      access_token,
      start_date: startDate,
      end_date: endDate,
      options: { count: 100, offset: 0 },
    });

    const transactions = response.data.transactions.map((txn) => ({
      id: txn.transaction_id,
      date: txn.date,
      name: txn.name || txn.merchant_name || "Unknown",
      merchantName: txn.merchant_name,
      amount: txn.amount,
      currency: txn.iso_currency_code || "USD",
      category: txn.category?.join(" > ") || "Uncategorized",
      pending: txn.pending,
      accountId: txn.account_id,
    }));

    return Response.json({
      transactions,
      totalTransactions: response.data.total_transactions,
    });
  } catch (err) {
    console.error("Plaid transactions error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
