import { fetchReport, firstOfYear, today, parseAmount, cachedJson } from "@/lib/appfolio";
import { ENTITY_PROPERTY_IDS, classifyEntityByName } from "@/lib/appfolio-entities";
import { getOwnership } from "@/lib/ownership";
import { NextRequest } from "next/server";

interface RentRollRow {
  status?: string;
  lease_to?: string;
}

interface ArRow {
  total_amount?: string;
}

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  month_to_date?: string;
  year_to_date?: string;
}

interface GLRow {
  account_name?: string;
  property_name?: string;
  post_date?: string;
  party_name?: string;
  debit?: string;
  credit?: string;
}

interface SectionPnL {
  income: number;
  opex: number;
  noi: number;
  netIncome: number;
}

function extractSectionTotals(rows: IncomeRow[]): { totalIncome: number; totalExpenses: number } {
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const row of rows) {
    const name = (row.account_name || "").toLowerCase().trim();
    const amount = parseAmount(row.year_to_date);
    if (name === "total income") totalIncome = amount;
    if (name === "total expense" || name === "total expenses") totalExpenses = Math.abs(amount);
  }
  return { totalIncome, totalExpenses };
}

function computeMonthlyTrendFromGL(
  glRows: GLRow[],
  year: number,
  ownershipAdjusted: boolean
): { jrw: number; big: number; hotel: number }[] {
  const currentMonth = new Date().getMonth(); // 0-indexed
  const months: { jrw: number; big: number; hotel: number }[] = [];

  for (let m = 0; m <= currentMonth; m++) {
    const monthStr = String(m + 1).padStart(2, "0");
    const lastDay = new Date(year, m + 1, 0).getDate();
    const fromDate = `${year}-${monthStr}-01`;
    const toDate = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

    const monthData = { jrw: 0, big: 0, hotel: 0 };

    for (const r of glRows) {
      const postDate = r.post_date || "";
      if (postDate < fromDate || postDate > toDate) continue;

      const acctField = (r.account_name || "").trim();
      const acctMatch = acctField.match(/^(\d{4}-\d{4}(-\d{2})?)/);
      if (!acctMatch) continue;
      let account = acctMatch[1];
      if (account.endsWith("-00")) account = account.slice(0, -3);

      const prefix = account.charAt(0);
      const propertyName = r.property_name || "";
      const section = classifyEntityByName(propertyName);
      const pct = ownershipAdjusted ? getOwnership(propertyName) : 1;

      const debit = parseFloat(r.debit || "0") || 0;
      const credit = parseFloat(r.credit || "0") || 0;

      if (prefix === "4" || prefix === "5") {
        if (account.startsWith("5875") || account.startsWith("5873")) {
          const amount = (debit - credit) * pct;
          monthData[section] -= amount;
        } else if (!account.startsWith("5756")) {
          const amount = (credit - debit) * pct;
          monthData[section] += amount;
        }
      } else if (prefix === "6" || prefix === "7") {
        const amount = (debit - credit) * pct;
        monthData[section] -= amount;
      }
    }

    months.push(monthData);
  }

  return months;
}

function computeFeeReconciliationFromGL(
  glRows: GLRow[],
  fromDate: string,
  toDate: string
) {
  const internalEntities = new Set<string>();
  for (const r of glRows) {
    const prop = r.property_name || "";
    if (classifyEntityByName(prop) !== "big" && prop) {
      internalEntities.add(prop);
    }
  }

  function isInternalPayer(payee: string): boolean {
    if (!payee || payee.trim().length === 0) return true;
    const p = payee.toLowerCase().trim();
    for (const entity of internalEntities) {
      const e = entity.toLowerCase();
      if (p === e || p.includes(e) || e.includes(p)) return true;
      const pWords = p.split(/[\s,]+/).filter((w) => w.length >= 4);
      const eWords = e.split(/[\s,]+/).filter((w) => w.length >= 4);
      for (const pw of pWords) {
        for (const ew of eWords) {
          if (pw === ew) return true;
        }
      }
    }
    return false;
  }

  let internalFeeIncome = 0;
  let externalFeeIncome = 0;
  const externalPayerMap: Record<string, number> = {};

  let internalFeeExpense = 0;

  for (const r of glRows) {
    const postDate = r.post_date || "";
    if (postDate < fromDate || postDate > toDate) continue;

    const acctField = (r.account_name || "").trim();
    const acctMatch = acctField.match(/^(\d{4}-\d{4}(-\d{2})?)/);
    if (!acctMatch) continue;
    let account = acctMatch[1];
    if (account.endsWith("-00")) account = account.slice(0, -3);

    const propertyName = r.property_name || "";
    const section = classifyEntityByName(propertyName);
    const debit = parseFloat(r.debit || "0") || 0;
    const credit = parseFloat(r.credit || "0") || 0;

    // BIG fee income (5820)
    if (section === "big" && account.startsWith("5820")) {
      const amount = credit - debit;
      if (isInternalPayer(r.party_name || "")) {
        internalFeeIncome += amount;
      } else {
        externalFeeIncome += amount;
        const key = r.party_name || "(unattributed)";
        externalPayerMap[key] = (externalPayerMap[key] || 0) + amount;
      }
    }

    // Internal entity fee expense (6300 + 7301 + 7300)
    if (section !== "big") {
      if (account.startsWith("6300") || account.startsWith("7301") || account.startsWith("7300")) {
        internalFeeExpense += debit - credit;
      }
    }
  }

  const internalGap = Math.round(Math.abs(internalFeeIncome - internalFeeExpense));
  const externalPayers = Object.entries(externalPayerMap)
    .filter(([, a]) => a !== 0)
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    internalFeeIncome: Math.round(internalFeeIncome),
    internalFeeExpense: Math.round(internalFeeExpense),
    externalFeeIncome: Math.round(externalFeeIncome),
    totalFeeIncome: Math.round(internalFeeIncome + externalFeeIncome),
    internalGap,
    externalPayers,
    externalClientCount: externalPayers.length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const ownershipView = searchParams.get("view") === "joe";

    const ytdFrom = firstOfYear();
    const ytdTo = today();

    const bigFilter = { properties_ids: [ENTITY_PROPERTY_IDS.big] };
    const hotelFilter = { properties_ids: [ENTITY_PROPERTY_IDS.hotel] };

    // All API calls in parallel (5 calls, well within 7/15s rate limit)
    const [bigIS, hotelIS, glRows, rentRows, arRows] = await Promise.all([
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: ytdFrom,
        posted_on_to: ytdTo,
        properties: bigFilter,
      }),
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: ytdFrom,
        posted_on_to: ytdTo,
        properties: hotelFilter,
      }),
      fetchReport<GLRow>("general_ledger", {
        from_date: ytdFrom,
        to_date: ytdTo,
      }),
      fetchReport<RentRollRow>("rent_roll"),
      fetchReport<ArRow>("aged_receivables_detail", { as_of_date: ytdTo }),
    ]);

    // BIG P&L from income_statement
    const bigTotals = extractSectionTotals(bigIS);
    const bigPnL: SectionPnL = {
      income: bigTotals.totalIncome,
      opex: bigTotals.totalExpenses,
      noi: bigTotals.totalIncome - bigTotals.totalExpenses,
      netIncome: bigTotals.totalIncome - bigTotals.totalExpenses,
    };

    // Hotel P&L from income_statement
    const hotelTotals = extractSectionTotals(hotelIS);
    const hotelPnL: SectionPnL = {
      income: hotelTotals.totalIncome,
      opex: hotelTotals.totalExpenses,
      noi: hotelTotals.totalIncome - hotelTotals.totalExpenses,
      netIncome: hotelTotals.totalIncome - hotelTotals.totalExpenses,
    };

    // JRW P&L computed from GL (all non-BIG, non-Hotel entities)
    let jrwIncome = 0;
    let jrwOpex = 0;
    let jrwDebtService = 0;
    let jrwDeprecAmort = 0;
    let jrwOtherBelow = 0;
    let hotelRoomRevenue = 0;

    for (const r of glRows) {
      const acctField = (r.account_name || "").trim();
      const acctMatch = acctField.match(/^(\d{4}-\d{4}(-\d{2})?)/);
      if (!acctMatch) continue;
      let account = acctMatch[1];
      if (account.endsWith("-00")) account = account.slice(0, -3);

      const propertyName = r.property_name || "";
      const section = classifyEntityByName(propertyName);
      const debit = parseFloat(r.debit || "0") || 0;
      const credit = parseFloat(r.credit || "0") || 0;
      const prefix = account.charAt(0);

      // Hotel room revenue (4400-1000 + 4400-2000)
      if (section === "hotel") {
        if (account.startsWith("4400-1000") || account.startsWith("4400-2000")) {
          const pct = ownershipView ? getOwnership(propertyName) : 1;
          hotelRoomRevenue += (credit - debit) * pct;
        }
      }

      // JRW entity totals
      if (section === "jrw") {
        const pct = ownershipView ? getOwnership(propertyName) : 1;
        if (prefix === "4" || prefix === "5") {
          if (account.startsWith("5875") || account.startsWith("5873")) {
            jrwOpex += (debit - credit) * pct;
          } else if (!account.startsWith("5756")) {
            jrwIncome += (credit - debit) * pct;
          }
        } else if (prefix === "6" || prefix === "7") {
          if (account.startsWith("6600") || account.startsWith("6650")) {
            jrwDeprecAmort += (debit - credit) * pct;
          } else {
            jrwOpex += (debit - credit) * pct;
          }
        } else if (prefix === "8") {
          if (account.startsWith("8510") || account.startsWith("8520") || account.startsWith("8525")) {
            jrwDebtService += (debit - credit) * pct;
          } else {
            jrwOtherBelow += (debit - credit) * pct;
          }
        }
      }
    }

    const jrwNoi = jrwIncome - jrwOpex;
    const jrwNetIncome = jrwNoi - jrwDeprecAmort - jrwDebtService - jrwOtherBelow;

    // Apply ownership to BIG/Hotel if needed
    const bigPct = ownershipView ? getOwnership("Blackdeer Investment Group") : 1;
    const hotelPct = ownershipView ? getOwnership("Badger Hotel Group") : 1;

    // BIG margin
    const adjBigIncome = bigPnL.income * bigPct;
    const adjBigOpex = bigPnL.opex * bigPct;
    const adjBigNet = adjBigIncome - adjBigOpex;
    const bigMargin = adjBigIncome > 0 ? Math.round((adjBigNet / adjBigIncome) * 100) : 0;

    // Monthly sparkline trends from GL
    const year = new Date().getFullYear();
    const monthlyData = computeMonthlyTrendFromGL(glRows, year, ownershipView);
    const jrwTrend = monthlyData.map((m) => m.jrw);
    const bigTrend = monthlyData.map((m) => m.big);
    const hotelTrend = monthlyData.map((m) => m.hotel);

    // Occupancy from rent roll
    const totalUnits = rentRows.length;
    const occupied = rentRows.filter((r) => {
      const s = (r.status || "").toLowerCase();
      return s.includes("current") || s.includes("occupied");
    }).length;
    const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;

    // Lease expirations < 90 days
    const now = new Date();
    const ninetyDays = new Date(now.getTime() + 90 * 86400000);
    const leasesExpiring = rentRows.filter((r) => {
      if (!r.lease_to) return false;
      const d = new Date(r.lease_to);
      return d >= now && d <= ninetyDays;
    }).length;

    // Aged receivables
    const agedReceivables = arRows.reduce((sum, r) => sum + parseAmount(r.total_amount), 0);

    // Fee reconciliation from GL
    const feeRecon = computeFeeReconciliationFromGL(glRows, ytdFrom, ytdTo);

    const jrwPropertyCount = 17;
    const bigManagedCount = 14;

    return cachedJson({
      jrw: {
        noi: Math.round(jrwNoi),
        netIncome: Math.round(jrwNetIncome),
        occupancyRate,
        propertyCount: jrwPropertyCount,
        monthlyTrend: jrwTrend,
      },
      big: {
        feeRevenue: Math.round(adjBigIncome),
        totalIncome: Math.round(adjBigIncome),
        totalExpenses: Math.round(adjBigOpex),
        netIncome: Math.round(adjBigNet),
        margin: bigMargin,
        propertiesManaged: bigManagedCount,
        monthlyTrend: bigTrend,
      },
      hotel: {
        roomRevenue: hotelRoomRevenue,
        totalRevenue: Math.round(hotelPnL.income * hotelPct),
        gop: Math.round(hotelPnL.noi * hotelPct),
        netIncome: Math.round(hotelPnL.netIncome * hotelPct),
        monthlyTrend: hotelTrend,
      },
      alerts: {
        leasesExpiring,
        agedReceivables: Math.round(agedReceivables),
        feeReconciliationGap: feeRecon.internalGap,
      },
      period: {
        from: ytdFrom,
        to: ytdTo,
        basis: "YTD",
      },
      ownershipView,
    });
  } catch (err) {
    console.error("Command center error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
