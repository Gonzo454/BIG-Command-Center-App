import { NextRequest } from "next/server";
import { firstOfYear, today } from "@/lib/appfolio";
import { parseGL, classifyEntity, dateToSerial, Section } from "@/lib/gl-parser";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const account = params.get("account");
  const entity = (params.get("entity") || "big") as Section;
  const from = params.get("from") || firstOfYear();
  const to = params.get("to") || today();

  if (!account) {
    return Response.json(
      { error: "account parameter required" },
      { status: 400 }
    );
  }

  try {
    // Strip trailing "-00" suffix to get the account prefix (e.g. "6304-0000-00" → "6304-0000")
    const prefix = account.replace(/-00$/, "");

    const allTransactions = parseGL();
    const fromSerial = dateToSerial(from);
    const toSerial = dateToSerial(to);

    const transactions: {
      date: string;
      vendor: string;
      property: string;
      description: string;
      amount: number;
    }[] = [];

    for (const t of allTransactions) {
      if (t.date > 0 && (t.date < fromSerial || t.date > toSerial)) continue;
      if (classifyEntity(t.entity) !== entity) continue;
      if (!t.account.startsWith(prefix)) continue;

      const acctPrefix = t.account.charAt(0);
      let net: number;
      if (acctPrefix === "4" || acctPrefix === "5") {
        if (t.account.startsWith("5875") || t.account.startsWith("5873")) {
          net = t.debit - t.credit; // hotel labor/merchant = expense
        } else if (t.account.startsWith("5756")) {
          continue; // gain on sale — skip
        } else {
          net = t.credit - t.debit; // revenue
        }
      } else if (t.account.startsWith("6600") || t.account.startsWith("6650")) {
        continue; // depreciation/amortization — skip
      } else {
        net = t.debit - t.credit; // expenses
      }
      if (net === 0) continue;

      // Convert Excel serial date to ISO string
      const dateObj = new Date((t.date - 25569) * 86400000);
      const isoDate = t.date > 0
        ? `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, "0")}-${String(dateObj.getUTCDate()).padStart(2, "0")}`
        : "";

      transactions.push({
        date: isoDate,
        vendor: t.payee || "—",
        property: t.entity || "",
        description: t.description || "",
        amount: net,
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
