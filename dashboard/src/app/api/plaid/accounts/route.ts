import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";

export async function POST(request: Request) {
  if (!isPlaidConfigured()) {
    return Response.json(
      { error: "Plaid is not configured." },
      { status: 503 }
    );
  }

  try {
    const { access_token } = await request.json();

    if (!access_token) {
      return Response.json({ error: "access_token is required" }, { status: 400 });
    }

    const client = getPlaidClient();
    const response = await client.accountsBalanceGet({
      access_token,
    });

    const accounts = response.data.accounts.map((acct) => ({
      id: acct.account_id,
      name: acct.name,
      officialName: acct.official_name,
      type: acct.type,
      subtype: acct.subtype,
      mask: acct.mask,
      balances: {
        available: acct.balances.available,
        current: acct.balances.current,
        limit: acct.balances.limit,
        currency: acct.balances.iso_currency_code || "USD",
      },
    }));

    const institution = response.data.item?.institution_id || null;

    return Response.json({ accounts, institution });
  } catch (err) {
    console.error("Plaid accounts error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
