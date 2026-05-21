import { fetchReport, parseAmount } from "@/lib/appfolio";

interface RentRollRow {
  property_name?: string;
  unit?: string;
  tenant?: string;
  status?: string;
  market_rent?: string;
  rent?: string;
  lease_to?: string;
  past_due?: string;
  sqft?: number;
  move_in?: string;
}

export async function GET() {
  try {
    const rows = await fetchReport<RentRollRow>("rent_roll");

    const units = rows.map((r) => ({
      property: r.property_name || "",
      unit: r.unit || "",
      tenant: r.tenant || "",
      status: r.status || "",
      marketRent: r.market_rent ? `$${parseAmount(r.market_rent).toLocaleString()}` : "",
      actualRent: r.rent ? `$${parseAmount(r.rent).toLocaleString()}` : "",
      leaseEnd: r.lease_to || "",
      balance: r.past_due ? `$${parseAmount(r.past_due).toLocaleString()}` : "",
    }));

    const totalUnits = units.length;
    const occupied = units.filter(
      (u) => u.status.toLowerCase() === "current"
    ).length;
    const vacant = totalUnits - occupied;

    return Response.json({ units, summary: { totalUnits, occupied, vacant } });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
