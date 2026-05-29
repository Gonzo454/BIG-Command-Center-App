import { NextRequest } from "next/server";
import { fetchReport, firstOfYear, today, parseAmount } from "@/lib/appfolio";

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
  gl_account_number?: string;
  property_name?: string;
  memo?: string;
  description?: string;
}

// Map BIG account numbers to the GL name used in the check register
const ACCOUNT_GL_NAMES: Record<string, string[]> = {
  "6304-0000-00": ["Salaries & Wages"],
  "6304-0100-00": ["Accounting Wages", "Wages - Accounting"],
  "6305-0000-00": ["Salaries & Wages Mgmt"],
  "6305-0300-00": ["Worker's Comp"],
  "6305-1000-00": ["Life Insurance"],
  "6305-2000-00": ["Medical Insurance"],
  "6305-2100-00": ["Dental Insurance"],
  "6305-3200-00": ["HSA Contribution"],
  "6305-3500-00": ["Payroll Fees"],
  "6306-1000-00": ["Payroll Taxes"],
  "7000-2000-00": ["Microsoft Office"],
  "7000-2300-00": ["Google Apps"],
  "7302-0000-00": ["Consulting Service"],
  "7400-0000-00": ["Office Administrations"],
  "7420-0000-00": ["Office Supplies - Non-recoverable"],
  "7420-2000-00": ["Postage & Shipping"],
  "7430-0000-00": ["Computer Repairs & Support", "Computer Repairs & Support - Non-recoverable"],
  "7430-0110-00": ["IT Support - Rhyme"],
  "7440-0000-00": ["Computer Software & License Fees"],
  "7520-0000-00": ["Employee Relations"],
  "7610-1000-00": ["AppFolio"],
  "7620-1000-00": ["Permits & Licenses"],
  "7700-0000-00": ["Miscellaneous Expense - Non-recoverable"],
  "7800-0000-00": ["Bank Fees"],
  "7802-0000-00": ["Late Fees"],
  // Revenue accounts
  "5820-0000-00": ["Management Fees"],
  "5820-1000-00": ["Asset Management Fees"],
  "5750-0000-00": ["Leasing Commission Income", "Leasing Commissions"],
  "5755-0000-00": ["Sale Commission", "Commissions"],
  "5760-0000-00": ["Internet & Computer Services"],
  "5720-1000-00": ["Insurance Fee"],
  "5700-0000-00": ["Miscellaneous Income"],
  "5700-0001-00": ["Interest Income"],
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const account = params.get("account");
  const from = params.get("from") || firstOfYear();
  const to = params.get("to") || today();

  if (!account) {
    return Response.json(
      { error: "account parameter required" },
      { status: 400 }
    );
  }

  try {
    const rows = await fetchReport<CheckRow>("check_register_detail", {
      from_date: from,
      to_date: to,
    });

    const glNames = ACCOUNT_GL_NAMES[account] || [];
    const glNamesLower = glNames.map((n) => n.toLowerCase());

    const transactions: {
      date: string;
      vendor: string;
      property: string;
      description: string;
      amount: number;
    }[] = [];

    for (const r of rows) {
      const rowGlName = (r.gl_account_name || "").trim();
      const rowGlNameLower = rowGlName.toLowerCase();
      const rowProperty = (r.property_name || "").trim();

      // Match by GL account number if available
      const rowGlNum = (r.gl_account_number || "").trim();
      let matched = false;
      if (rowGlNum && rowGlNum === account) {
        matched = true;
      }
      // Match by GL name
      if (!matched && glNamesLower.some((n) => rowGlNameLower === n)) {
        // Only include BIG entity transactions (property contains "Blackdeer")
        if (
          rowProperty.toLowerCase().includes("blackdeer") ||
          rowProperty === ""
        ) {
          matched = true;
        }
      }

      if (!matched) continue;

      const vendor = r.vendor_name || r.payee_name || "Unknown";
      const amount =
        parseAmount(r.invoice_amount) ||
        parseAmount(r.amount) ||
        parseAmount(r.payment_amount);

      if (amount === 0) continue;

      transactions.push({
        date: r.check_date || "",
        vendor,
        property: rowProperty,
        description: r.memo || r.description || "",
        amount,
      });
    }

    transactions.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      return Math.abs(b.amount) - Math.abs(a.amount);
    });

    return Response.json({
      account,
      transactions,
      total: transactions.reduce((s, t) => s + t.amount, 0),
      count: transactions.length,
      period: { from, to },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
