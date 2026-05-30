import { fetchReport, firstOfYear, today, parseAmount } from "@/lib/appfolio";
import { computeSectionPnL, computeMonthlyTrend, parseGL, classifyEntity, dateToSerial } from "@/lib/gl-parser";

interface RentRollRow {
  status?: string;
  lease_to?: string;
}

interface ArRow {
  total_amount?: string;
}

interface IncomeRow {
  account_number?: string;
  year_to_date?: string;
}

export async function GET() {
  try {
    // Entity-filtered P&L from GL export (the correct approach)
    const ytdFrom = firstOfYear();
    const ytdTo = today();
    const sections = computeSectionPnL(ytdFrom, ytdTo);

    // BIG margin = net income / total income
    const bigMargin = sections.big.income > 0
      ? Math.round((sections.big.netIncome / sections.big.income) * 100)
      : 0;

    // Monthly sparkline trends
    const year = new Date().getFullYear();
    const monthlyData = computeMonthlyTrend(year);
    const jrwTrend = monthlyData.map((m) => m.jrw);
    const bigTrend = monthlyData.map((m) => m.big);
    const hotelTrend = monthlyData.map((m) => m.hotel);

    // Live data from AppFolio API for alerts (rent roll, AR)
    const [rentRows, arRows, incomeRows] = await Promise.all([
      fetchReport<RentRollRow>("rent_roll"),
      fetchReport<ArRow>("aged_receivables_detail", { as_of_date: ytdTo }),
      fetchReport<IncomeRow>("income_statement", {
        from_date: ytdFrom,
        to_date: ytdTo,
      }),
    ]);

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

    // Fee reconciliation per spec §7 (entity-filtered GL handles this correctly)
    // Management leg: BIG 5820-0000 income vs property 6300 + 7301 expense
    // Asset-mgmt leg: BIG 5820-1000 income vs property 7300 expense
    let bigMgmtIncome = 0;
    let bigAssetIncome = 0;
    let propertyMgmtExpense = 0;
    let propertyAssetExpense = 0;
    for (const row of incomeRows) {
      const num = (row.account_number || "").trim();
      const ytd = parseAmount(row.year_to_date);
      if (num.startsWith("5820-0000")) bigMgmtIncome += ytd;
      if (num.startsWith("5820-1000")) bigAssetIncome += ytd;
      if (num.startsWith("6300-0000") || num.startsWith("7301-0000")) {
        propertyMgmtExpense += Math.abs(ytd);
      }
      if (num.startsWith("7300-0000")) {
        propertyAssetExpense += Math.abs(ytd);
      }
    }
    const varianceMgmt = bigMgmtIncome - propertyMgmtExpense;
    const varianceAsset = bigAssetIncome - propertyAssetExpense;
    const feeReconciliationGap = Math.round(Math.abs(varianceMgmt + varianceAsset));

    const propertyCount = 14;

    // Hotel room revenue: specifically 4400-1000 + 4400-2000 from GL (entity = Badger Hotel)
    const glData = parseGL();
    let hotelRoomRevenue = 0;
    const fromSerial = dateToSerial(ytdFrom);
    const toSerial = dateToSerial(ytdTo);
    for (const t of glData) {
      if (t.date > 0 && (t.date < fromSerial || t.date > toSerial)) continue;
      if (classifyEntity(t.entity) !== "hotel") continue;
      if (t.account.startsWith("4400-1000") || t.account.startsWith("4400-2000")) {
        hotelRoomRevenue += t.credit - t.debit;
      }
    }

    return Response.json({
      jrw: {
        noi: Math.round(sections.jrw.noi),
        netIncome: Math.round(sections.jrw.netIncome),
        occupancyRate,
        propertyCount,
        monthlyTrend: jrwTrend,
      },
      big: {
        feeRevenue: Math.round(sections.big.income),
        totalIncome: Math.round(sections.big.income),
        totalExpenses: Math.round(sections.big.opex),
        netIncome: Math.round(sections.big.netIncome),
        margin: bigMargin,
        propertiesManaged: propertyCount,
        monthlyTrend: bigTrend,
      },
      hotel: {
        roomRevenue: hotelRoomRevenue,
        totalRevenue: Math.round(sections.hotel.income),
        gop: Math.round(sections.hotel.noi),
        netIncome: Math.round(sections.hotel.netIncome),
        monthlyTrend: hotelTrend,
      },
      alerts: {
        leasesExpiring,
        agedReceivables: Math.round(agedReceivables),
        feeReconciliationGap,
      },
      period: {
        from: ytdFrom,
        to: ytdTo,
        basis: "YTD",
      },
    });
  } catch (err) {
    console.error("Command center error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
