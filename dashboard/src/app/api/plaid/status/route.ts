import { isPlaidConfigured } from "@/lib/plaid";

export async function GET() {
  return Response.json({
    configured: isPlaidConfigured(),
    environment: process.env.PLAID_ENV || "sandbox",
  });
}
