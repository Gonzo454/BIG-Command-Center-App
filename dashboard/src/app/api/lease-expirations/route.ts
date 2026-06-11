import { fetchReport, parseAmount } from "@/lib/appfolio";

interface RentRollRow {
  property_name?: string;
  unit?: string;
  tenant?: string;
  status?: string;
  lease_from?: string;
  lease_to?: string;
  rent?: string;
  market_rent?: string;
  past_due?: string;
}

export async function GET() {
  try {
    const rows = await fetchReport<RentRollRow>("rent_roll");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const leases = rows
      .filter((r) => r.status === "Current" && r.lease_to)
      .map((r) => {
        const expDate = new Date(r.lease_to + "T00:00:00");
        const diffMs = expDate.getTime() - today.getTime();
        const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return {
          property: r.property_name || "",
          unit: r.unit || "",
          tenant: r.tenant || "",
          leaseEnd: r.lease_to || "",
          daysUntil,
          rent: parseAmount(r.rent),
          marketRent: parseAmount(r.market_rent),
          pastDue: parseAmount(r.past_due),
        };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);

    const buckets = {
      expired: leases.filter((l) => l.daysUntil < 0),
      within30: leases.filter((l) => l.daysUntil >= 0 && l.daysUntil <= 30),
      within60: leases.filter((l) => l.daysUntil > 30 && l.daysUntil <= 60),
      within90: leases.filter((l) => l.daysUntil > 60 && l.daysUntil <= 90),
      within180: leases.filter((l) => l.daysUntil > 90 && l.daysUntil <= 180),
      beyond180: leases.filter((l) => l.daysUntil > 180),
    };

    const summary = {
      totalLeases: leases.length,
      expiringWithin90: buckets.expired.length + buckets.within30.length + buckets.within60.length + buckets.within90.length,
      totalRentAtRisk: [...buckets.expired, ...buckets.within30, ...buckets.within60, ...buckets.within90].reduce(
        (s, l) => s + l.rent,
        0
      ),
    };

    return Response.json({ summary, buckets, leases });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
