import { fetchReport } from "@/lib/appfolio";

interface RentRollRow {
  property_name?: string;
  unit_name?: string;
  tenant_name?: string;
  status?: string;
  market_rent?: string;
  actual_rent?: string;
  move_in_date?: string;
  lease_end_date?: string;
  balance?: string;
}

export async function GET() {
  try {
    const rows = await fetchReport<RentRollRow>("rent_roll");

    const units = rows.map((r) => ({
      property: r.property_name || "",
      unit: r.unit_name || "",
      tenant: r.tenant_name || "",
      status: r.status || "",
      marketRent: r.market_rent || "",
      actualRent: r.actual_rent || "",
      moveIn: r.move_in_date || "",
      leaseEnd: r.lease_end_date || "",
      balance: r.balance || "",
    }));

    const totalUnits = units.length;
    const occupied = units.filter(
      (u) => u.status.toLowerCase().includes("occupied") || u.tenant
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
