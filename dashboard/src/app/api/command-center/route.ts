import { fetchReport, firstOfYear, today, parseAmount } from "@/lib/appfolio";
import { computeSectionPnL, computeMonthlyTrend, computeFeeReconciliation, parseGL, classifyEntity, dateToSerial } from "@/lib/gl-parser";

interface RentRollRow {
  status?: string;
  lease_to?: string;
}

interface ArRow {
  total_amount?: string;
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
    const [rentRows, arRows] = await Promise.all([
      fetchReport<RentRollRow>("rent_roll"),
      fetchReport<ArRow>("aged_receivables_detail", { as_of_date: ytdTo }),
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

    // Fee reconciliation — excludes billback properties (Metro Crossing,
    // Station 955, GC Real Estate) whose reimbursements flow through BIG's
    // 5820 accounts but aren't earned management fees
    const feeRecon = computeFeeReconciliation(ytdFrom, ytdTo);

    const jrwPropertyCount = 17; // 14 BIG-managed + 3 MN-managed (Metro Crossing, Station 955, GC Real Estate)
    const bigManagedCount = 14;

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
        propertyCount: jrwPropertyCount,
        monthlyTrend: jrwTrend,
      },
      big: {
        feeRevenue: Math.round(sections.big.income),
        totalIncome: Math.round(sections.big.income),
        totalExpenses: Math.round(sections.big.opex),
        netIncome: Math.round(sections.big.netIncome),
        margin: bigMargin,
        propertiesManaged: bigManagedCount,
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
        feeReconciliationGap: feeRecon.internalGap,
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
