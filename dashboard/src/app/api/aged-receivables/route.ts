import { fetchReport, parseAmount } from "@/lib/appfolio";

interface ARRow {
  payer_name?: string;
  property_name?: string;
  unit_name?: string;
  total_amount?: string;
  amount_receivable?: string;
  "0_to30"?: string;
  "30_to60"?: string;
  "60_to90"?: string;
  "90_plus"?: string;
  tenant_status?: string;
}

export async function GET() {
  try {
    const rows = await fetchReport<ARRow>("aged_receivables_detail", {
      as_of_date: new Date().toISOString().split("T")[0],
    });

    // Aggregate by tenant
    const byTenant = new Map<
      string,
      {
        tenant: string;
        property: string;
        unit: string;
        total: number;
        current: number;
        days30: number;
        days60: number;
        days90: number;
        status: string;
      }
    >();

    for (const r of rows) {
      const key = `${r.payer_name}|${r.property_name}|${r.unit_name}`;
      const existing = byTenant.get(key);
      const current = parseAmount(r["0_to30"]);
      const days30 = parseAmount(r["30_to60"]);
      const days60 = parseAmount(r["60_to90"]);
      const days90 = parseAmount(r["90_plus"]);
      const total = parseAmount(r.amount_receivable);

      if (existing) {
        existing.total += total;
        existing.current += current;
        existing.days30 += days30;
        existing.days60 += days60;
        existing.days90 += days90;
      } else {
        byTenant.set(key, {
          tenant: r.payer_name || "Unknown",
          property: r.property_name || "",
          unit: r.unit_name || "",
          total,
          current,
          days30,
          days60,
          days90,
          status: r.tenant_status || "",
        });
      }
    }

    const tenants = Array.from(byTenant.values())
      .filter((t) => t.total !== 0)
      .sort((a, b) => b.total - a.total);

    const summary = {
      totalReceivable: tenants.reduce((s, t) => s + t.total, 0),
      totalCurrent: tenants.reduce((s, t) => s + t.current, 0),
      total30: tenants.reduce((s, t) => s + t.days30, 0),
      total60: tenants.reduce((s, t) => s + t.days60, 0),
      total90: tenants.reduce((s, t) => s + t.days90, 0),
      tenantCount: tenants.length,
    };

    return Response.json({ summary, tenants });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
