import { NextRequest } from "next/server";
import { fetchReport, firstOfMonth, today, parseAmount } from "@/lib/appfolio";

interface CheckRow {
  vendor_name?: string;
  payee_name?: string;
  check_id?: string;
  check_number?: string;
  check_date?: string;
  payment_amount?: string;
  invoice_amount?: string;
  amount?: string;
  gl_account_name?: string;
  property_name?: string;
  memo?: string;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = params.get("from") || firstOfMonth();
  const to = params.get("to") || today();

  try {
    const rows = await fetchReport<CheckRow>("check_register_detail", {
      from_date: from,
      to_date: to,
    });

    // Group by check and deduplicate
    const checkMap = new Map<string, { vendor: string; date: string; total: number; lines: { gl: string; property: string; amount: number }[] }>();

    for (const r of rows) {
      const vendor = r.vendor_name || r.payee_name || "Unknown";
      const checkKey = r.check_id || r.check_number || `${vendor}-${r.check_date}-${r.payment_amount}`;
      const lineAmount = parseAmount(r.invoice_amount) || parseAmount(r.amount) || parseAmount(r.payment_amount);

      if (!checkMap.has(checkKey)) {
        checkMap.set(checkKey, {
          vendor,
          date: r.check_date || "",
          total: parseAmount(r.payment_amount),
          lines: [],
        });
      }

      checkMap.get(checkKey)!.lines.push({
        gl: r.gl_account_name || "",
        property: r.property_name || "",
        amount: lineAmount,
      });
    }

    const checks = Array.from(checkMap.values())
      .sort((a, b) => b.total - a.total)
      .map((c) => ({
        ...c,
        lineCount: c.lines.length,
      }));

    const totalDisbursed = checks.reduce((sum, c) => sum + c.total, 0);

    return Response.json({ checks, totalDisbursed, period: { from, to } });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
