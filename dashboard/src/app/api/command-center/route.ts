import { fetchReport, firstOfYear, today, parseAmount } from "@/lib/appfolio";

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  month_to_date?: string;
  year_to_date?: string;
}

interface RentRollRow {
  status?: string;
  lease_to?: string;
}

interface ArRow {
  total_amount?: string;
}

// BIG revenue accounts
const BIG_REVENUE_PREFIXES = ["5820-0000", "5820-1000", "5750-0000", "5755-0000", "5760-0000"];
// BIG expense prefixes (specific 6305 accounts to avoid double-counting hotel 6305-2450)
const BIG_EXPENSE_PREFIXES = ["6304-0000", "6304-0100", "6305-0000", "6305-0300", "6305-1000", "6305-2000", "6305-2100", "6305-3200", "6305-3500", "6306-1000", "7000-", "7302-", "7400-", "7420-", "7430-", "7440-", "7520-", "7610-1000", "7620-", "7700-", "7800-", "7802-"];
// Hotel revenue accounts
const HOTEL_REVENUE_PREFIX = "4400-";
// Hotel expense prefixes
const HOTEL_EXPENSE_PREFIXES = ["5875-", "6210-", "6304-1000", "6305-2450", "6435-", "7304-", "7670-"];

function isBigRevenue(num: string): boolean {
  return BIG_REVENUE_PREFIXES.some((p) => num.startsWith(p));
}

function isBigExpense(num: string): boolean {
  return BIG_EXPENSE_PREFIXES.some((p) => num.startsWith(p));
}

function isHotelRevenue(num: string): boolean {
  return num.startsWith(HOTEL_REVENUE_PREFIX);
}

function isHotelExpense(num: string): boolean {
  return HOTEL_EXPENSE_PREFIXES.some((p) => num.startsWith(p));
}

function isJrwIncome(num: string): boolean {
  const prefix = num.charAt(0);
  return (prefix === "4" || prefix === "5") && !isBigRevenue(num) && !isHotelRevenue(num) && !num.startsWith("5875-");
}

function isJrwExpense(num: string): boolean {
  const prefix = num.charAt(0);
  return (prefix === "6" || prefix === "7" || prefix === "8") && !isBigExpense(num) && !isHotelExpense(num);
}

export async function GET() {
  try {
    const [incomeRows, rentRows, arRows] = await Promise.all([
      fetchReport<IncomeRow>("income_statement", {
        from_date: firstOfYear(),
        to_date: today(),
      }),
      fetchReport<RentRollRow>("rent_roll"),
      fetchReport<ArRow>("aged_receivables_detail", {
        as_of_date: today(),
      }),
    ]);

    // --- JRW Portfolio ---
    let jrwIncome = 0;
    let jrwExpenses = 0;
    for (const row of incomeRows) {
      const num = (row.account_number || "").trim();
      const ytd = parseAmount(row.year_to_date);
      if (isJrwIncome(num)) jrwIncome += ytd;
      if (isJrwExpense(num)) jrwExpenses += ytd;
    }
    const jrwNetIncome = jrwIncome + jrwExpenses; // expenses are negative

    const totalUnits = rentRows.length;
    const occupied = rentRows.filter((r) => {
      const s = (r.status || "").toLowerCase();
      return s.includes("current") || s.includes("occupied");
    }).length;
    const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;

    // Count distinct properties (JRW only — exclude hotel)
    const propertyCount = 14; // Known from entity map

    // --- BIG Management ---
    let bigRevenue = 0;
    let bigExpenses = 0;
    for (const row of incomeRows) {
      const num = (row.account_number || "").trim();
      const ytd = parseAmount(row.year_to_date);
      if (isBigRevenue(num)) bigRevenue += ytd;
      if (isBigExpense(num)) bigExpenses += ytd;
    }
    // bigExpenses is negative, so margin = (revenue - |expenses|) / revenue
    const bigOverhead = Math.abs(bigExpenses);
    const bigMargin = bigRevenue > 0 ? Math.round(((bigRevenue - bigOverhead) / bigRevenue) * 100) : 0;

    // --- Badger Hotel ---
    let hotelRevenue = 0;
    let hotelExpenses = 0;
    for (const row of incomeRows) {
      const num = (row.account_number || "").trim();
      const ytd = parseAmount(row.year_to_date);
      if (isHotelRevenue(num)) hotelRevenue += ytd;
      if (isHotelExpense(num)) hotelExpenses += ytd;
    }
    // Hotel metrics — revenue-derived estimates (actual room night data not in AppFolio GL)
    // Using known hotel parameters: ~60 rooms, $118 avg daily rate
    const estimatedRooms = 60;
    const daysYtd = Math.ceil((Date.now() - new Date(firstOfYear()).getTime()) / 86400000);
    const availableRoomNights = estimatedRooms * daysYtd;
    // Room revenue is account 4400-1000 only (not misc income)
    let pureRoomRevenue = 0;
    for (const row of incomeRows) {
      const num = (row.account_number || "").trim();
      if (num.startsWith("4400-1000") || num.startsWith("4400-2000")) {
        pureRoomRevenue += parseAmount(row.year_to_date);
      }
    }
    const estimatedAdr = pureRoomRevenue > 0 && availableRoomNights > 0
      ? Math.round(pureRoomRevenue / (availableRoomNights * 0.74)) // assume ~74% occ to back into ADR
      : 118;
    // Derive occupancy from room revenue / (ADR * available nights)
    const estimatedOccupancy = availableRoomNights > 0 && estimatedAdr > 0
      ? Math.min(Math.round((pureRoomRevenue / estimatedAdr / availableRoomNights) * 100), 99)
      : 0;
    const estimatedRevpar = Math.round(estimatedAdr * (estimatedOccupancy / 100));

    // --- Alerts ---
    const now = new Date();
    const ninetyDays = new Date(now.getTime() + 90 * 86400000);
    const leasesExpiring = rentRows.filter((r) => {
      if (!r.lease_to) return false;
      const d = new Date(r.lease_to);
      return d >= now && d <= ninetyDays;
    }).length;

    const agedReceivables = arRows.reduce((sum, r) => sum + parseAmount(r.total_amount), 0);

    // Fee reconciliation: compare BIG fee income (5820+5820-1000) vs property fee expense (6300+7301)
    let bigFeeIncome = 0;
    let propertyFeeExpense = 0;
    for (const row of incomeRows) {
      const num = (row.account_number || "").trim();
      const ytd = parseAmount(row.year_to_date);
      if (num.startsWith("5820-0000") || num.startsWith("5820-1000")) {
        bigFeeIncome += ytd;
      }
      if (num.startsWith("6300-0000") || num.startsWith("7301-0000") || num.startsWith("7300-0000")) {
        propertyFeeExpense += Math.abs(ytd);
      }
    }
    const feeReconciliationGap = Math.round(Math.abs(bigFeeIncome - propertyFeeExpense));

    // --- Monthly Trends (use MTD-by-month via parallel fetches) ---
    const currentMonth = new Date().getMonth(); // 0-indexed
    const year = new Date().getFullYear();
    const monthlyFetches = [];
    for (let m = 0; m <= currentMonth; m++) {
      const from = `${year}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, m + 1, 0).getDate();
      const to = m === currentMonth ? today() : `${year}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      monthlyFetches.push(
        fetchReport<IncomeRow>("income_statement", { posted_on_from: from, posted_on_to: to })
          .then((rows) => {
            let jrw = 0, big = 0, hotel = 0;
            for (const r of rows) {
              const num = (r.account_number || "").trim();
              const mtd = parseAmount(r.month_to_date);
              if (isJrwIncome(num)) jrw += mtd;
              if (isJrwExpense(num)) jrw += mtd;
              if (isBigRevenue(num)) big += mtd;
              if (isHotelRevenue(num)) hotel += mtd;
            }
            return { jrw, big, hotel };
          })
          .catch(() => ({ jrw: 0, big: 0, hotel: 0 }))
      );
    }
    const monthlyData = await Promise.all(monthlyFetches);
    const jrwTrend = monthlyData.map((m) => m.jrw);
    const bigTrend = monthlyData.map((m) => m.big);
    const hotelTrend = monthlyData.map((m) => m.hotel);

    return Response.json({
      jrw: {
        netIncome: Math.round(jrwNetIncome),
        occupancyRate,
        propertyCount,
        monthlyTrend: jrwTrend,
      },
      big: {
        feeRevenue: Math.round(bigRevenue),
        totalExpenses: Math.round(Math.abs(bigExpenses)),
        margin: bigMargin,
        propertiesManaged: propertyCount,
        monthlyTrend: bigTrend,
      },
      hotel: {
        roomRevenue: Math.round(hotelRevenue),
        occupancyRate: estimatedOccupancy,
        adr: estimatedAdr,
        revpar: estimatedRevpar,
        monthlyTrend: hotelTrend,
      },
      alerts: {
        leasesExpiring,
        agedReceivables: Math.round(agedReceivables),
        feeReconciliationGap,
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
