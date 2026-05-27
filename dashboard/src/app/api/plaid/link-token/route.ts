import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";
import { CountryCode, Products } from "plaid";

export async function POST() {
  if (!isPlaidConfigured()) {
    return Response.json(
      { error: "Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to environment variables." },
      { status: 503 }
    );
  }

  try {
    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: "big-dashboard-user" },
      client_name: "BIG Financial Dashboard",
      products: [Products.Auth, Products.Transactions, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return Response.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("Plaid link token error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create link token" },
      { status: 500 }
    );
  }
}
