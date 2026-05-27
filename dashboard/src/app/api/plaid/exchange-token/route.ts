import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";

export async function POST(request: Request) {
  if (!isPlaidConfigured()) {
    return Response.json(
      { error: "Plaid is not configured." },
      { status: 503 }
    );
  }

  try {
    const { public_token, institution } = await request.json();

    if (!public_token) {
      return Response.json({ error: "public_token is required" }, { status: 400 });
    }

    const client = getPlaidClient();
    const response = await client.itemPublicTokenExchange({
      public_token,
    });

    return Response.json({
      access_token: response.data.access_token,
      item_id: response.data.item_id,
      institution: institution || null,
    });
  } catch (err) {
    console.error("Plaid token exchange error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to exchange token" },
      { status: 500 }
    );
  }
}
