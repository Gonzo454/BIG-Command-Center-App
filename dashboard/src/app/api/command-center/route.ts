import { fetchReport, fetchPvReport, firstOfYear, firstOfMonth, firstOfQuarter, today, parseAmount, cachedJson } from "@/lib/appfolio";
import { ENTITY_PROPERTY_IDS, classifyEntityByName } from "@/lib/appfolio-entities";
import { getOwnership } from "@/lib/ownership";
import { PV_COMMUNITIES } from "@/lib/pv-communities";
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

function extractSectionTotals(rows: IncomeRow[], column: "month_to_date" | "year_to_date" = "year_to_date"): { totalIncome: number; totalExpenses: number } {
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const row of rows) {
    const name = (row.account_name || "").toLowerCase().trim();
    const amount = parseAmount(row[column]);
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

  // Only show complete months (current partial month drops misleadingly
  // because expenses post early while income posts later in the month)
  for (let m = 0; m < currentMonth; m++) {
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
      if (section === "pv") continue;
      const pct = ownershipAdjusted ? getOwnership(propertyName) : 1;

      const debit = parseFloat(r.debit || "0") || 0;
      const credit = parseFloat(r.credit || "0") || 0;

      if (prefix === "4" || prefix === "5") {
        if (account.startsWith("5875") || account.startsWith("5873") || account.startsWith("5760")) {
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
    const period = searchParams.get("period") || "mtd";
    const paramFrom = searchParams.get("from");
    const paramTo = searchParams.get("to");

    let rangeFrom: string;
    let rangeTo: string;
    let basisLabel: string;

    if (paramFrom && paramTo) {
      rangeFrom = paramFrom;
      rangeTo = paramTo;
      basisLabel = period === "mtd" ? "MTD" : period === "qtd" ? "QTD" : period === "ytd" ? "YTD" : "Custom";
    } else if (period === "mtd") {
      rangeFrom = firstOfMonth();
      rangeTo = today();
      basisLabel = "MTD";
    } else if (period === "qtd") {
      rangeFrom = firstOfQuarter();
      rangeTo = today();
      basisLabel = "QTD";
    } else {
      rangeFrom = firstOfYear();
      rangeTo = today();
      basisLabel = "YTD";
    }

    const ytdFrom = rangeFrom;
    const ytdTo = rangeTo;

    // Always fetch full-year GL for sparklines
    const fullYearFrom = firstOfYear();
    const fullYearTo = today();

    const bigFilter = { properties_ids: [ENTITY_PROPERTY_IDS.big] };
    const hotelFilter = { properties_ids: [ENTITY_PROPERTY_IDS.hotel] };

    // For QTD/Custom: need YTD subtraction (fetch baseline before range start)
    // Skip when range already starts Jan 1 (Q1 QTD = YTD, no baseline needed)
    const needSubtraction = basisLabel !== "YTD" && basisLabel !== "MTD" && ytdFrom !== firstOfYear();
    const baselineEnd = needSubtraction
      ? (() => { const d = new Date(ytdFrom + "T00:00:00"); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })()
      : "";
    const baselineFrom = needSubtraction
      ? `${new Date(ytdFrom + "T00:00:00").getFullYear()}-01-01`
      : "";

    // All API calls in parallel (BIG database + PV database)
    const [bigIS, hotelIS, glRows, rentRows, arRows, pvIS, pvBaselineIS, allIS, bigBaselineIS, hotelBaselineIS, allBaselineIS] = await Promise.all([
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
        posted_on_from: fullYearFrom,
        posted_on_to: fullYearTo,
      }),
      fetchReport<RentRollRow>("rent_roll"),
      fetchReport<ArRow>("aged_receivables_detail", { as_of_date: ytdTo }),
      fetchPvReport<IncomeRow>("income_statement", {
        posted_on_from: ytdFrom,
        posted_on_to: ytdTo,
      }).catch(() => [] as IncomeRow[]),
      needSubtraction
        ? fetchPvReport<IncomeRow>("income_statement", {
            posted_on_from: baselineFrom,
            posted_on_to: baselineEnd,
          }).catch(() => [] as IncomeRow[])
        : Promise.resolve([] as IncomeRow[]),
      // All-properties income_statement for JRW (JRW = all - BIG - Hotel)
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: ytdFrom,
        posted_on_to: ytdTo,
      }),
      // Baseline income_statements for QTD/Custom subtraction
      needSubtraction
        ? fetchReport<IncomeRow>("income_statement", {
            posted_on_from: baselineFrom,
            posted_on_to: baselineEnd,
            properties: bigFilter,
          })
        : Promise.resolve([] as IncomeRow[]),
      needSubtraction
        ? fetchReport<IncomeRow>("income_statement", {
            posted_on_from: baselineFrom,
            posted_on_to: baselineEnd,
            properties: hotelFilter,
          })
        : Promise.resolve([] as IncomeRow[]),
      needSubtraction
        ? fetchReport<IncomeRow>("income_statement", {
            posted_on_from: baselineFrom,
            posted_on_to: baselineEnd,
          })
        : Promise.resolve([] as IncomeRow[]),
    ]);

    // BIG P&L from income_statement
    // For MTD use month_to_date column; for YTD use year_to_date;
    // for QTD/Custom use year_to_date subtraction (current minus baseline)
    const isYtd = basisLabel === "YTD";
    const isMtd = basisLabel === "MTD";

    let bigPnL: SectionPnL;
    let hotelPnL: SectionPnL;

    if (isMtd) {
      const bigTotals = extractSectionTotals(bigIS, "month_to_date");
      bigPnL = {
        income: bigTotals.totalIncome,
        opex: bigTotals.totalExpenses,
        noi: bigTotals.totalIncome - bigTotals.totalExpenses,
        netIncome: bigTotals.totalIncome - bigTotals.totalExpenses,
      };
      const hotelTotals = extractSectionTotals(hotelIS, "month_to_date");
      hotelPnL = {
        income: hotelTotals.totalIncome,
        opex: hotelTotals.totalExpenses,
        noi: hotelTotals.totalIncome - hotelTotals.totalExpenses,
        netIncome: hotelTotals.totalIncome - hotelTotals.totalExpenses,
      };
    } else if (isYtd) {
      const bigTotals = extractSectionTotals(bigIS, "year_to_date");
      bigPnL = {
        income: bigTotals.totalIncome,
        opex: bigTotals.totalExpenses,
        noi: bigTotals.totalIncome - bigTotals.totalExpenses,
        netIncome: bigTotals.totalIncome - bigTotals.totalExpenses,
      };
      const hotelTotals = extractSectionTotals(hotelIS, "year_to_date");
      hotelPnL = {
        income: hotelTotals.totalIncome,
        opex: hotelTotals.totalExpenses,
        noi: hotelTotals.totalIncome - hotelTotals.totalExpenses,
        netIncome: hotelTotals.totalIncome - hotelTotals.totalExpenses,
      };
    } else {
      // QTD/Custom: income_statement YTD subtraction (current minus baseline)
      const bigEnd = extractSectionTotals(bigIS, "year_to_date");
      const bigBase = extractSectionTotals(bigBaselineIS, "year_to_date");
      const bigInc = bigEnd.totalIncome - bigBase.totalIncome;
      const bigExp = bigEnd.totalExpenses - bigBase.totalExpenses;
      bigPnL = { income: bigInc, opex: bigExp, noi: bigInc - bigExp, netIncome: bigInc - bigExp };

      const htlEnd = extractSectionTotals(hotelIS, "year_to_date");
      const htlBase = extractSectionTotals(hotelBaselineIS, "year_to_date");
      const htlInc = htlEnd.totalIncome - htlBase.totalIncome;
      const htlExp = htlEnd.totalExpenses - htlBase.totalExpenses;
      hotelPnL = { income: htlInc, opex: htlExp, noi: htlInc - htlExp, netIncome: htlInc - htlExp };
    }

    // JRW P&L: income_statement for all periods (JRW = all - BIG - Hotel)
    let jrwIncome = 0;
    let jrwOpex = 0;
    let jrwDebtService = 0;
    let jrwDeprecAmort = 0;
    let jrwOtherBelow = 0;
    let hotelRoomRevenue = 0;

    const periodGlRows = glRows.filter((r) => {
      const pd = r.post_date || "";
      return pd >= ytdFrom && pd <= ytdTo;
    });

    {
      // Use income_statement: JRW = all properties - BIG - Hotel
      // (income_statement is authoritative; GL-based P&L diverges due to
      //  account classification and adjusting entries)
      let jrwIncomeRaw: number;
      let jrwOpexRaw: number;

      if (isMtd) {
        const allTotals = extractSectionTotals(allIS, "month_to_date");
        const bigTotalsIS = extractSectionTotals(bigIS, "month_to_date");
        const hotelTotalsIS = extractSectionTotals(hotelIS, "month_to_date");
        jrwIncomeRaw = allTotals.totalIncome - bigTotalsIS.totalIncome - hotelTotalsIS.totalIncome;
        jrwOpexRaw = allTotals.totalExpenses - bigTotalsIS.totalExpenses - hotelTotalsIS.totalExpenses;
      } else if (isYtd) {
        const allTotals = extractSectionTotals(allIS, "year_to_date");
        const bigTotalsIS = extractSectionTotals(bigIS, "year_to_date");
        const hotelTotalsIS = extractSectionTotals(hotelIS, "year_to_date");
        jrwIncomeRaw = allTotals.totalIncome - bigTotalsIS.totalIncome - hotelTotalsIS.totalIncome;
        jrwOpexRaw = allTotals.totalExpenses - bigTotalsIS.totalExpenses - hotelTotalsIS.totalExpenses;
      } else {
        // QTD/Custom: year_to_date subtraction
        const allEnd = extractSectionTotals(allIS, "year_to_date");
        const allBase = extractSectionTotals(allBaselineIS, "year_to_date");
        const bigEnd = extractSectionTotals(bigIS, "year_to_date");
        const bigBase = extractSectionTotals(bigBaselineIS, "year_to_date");
        const htlEnd = extractSectionTotals(hotelIS, "year_to_date");
        const htlBase = extractSectionTotals(hotelBaselineIS, "year_to_date");
        const allInc = allEnd.totalIncome - allBase.totalIncome;
        const allExp = allEnd.totalExpenses - allBase.totalExpenses;
        const bigInc = bigEnd.totalIncome - bigBase.totalIncome;
        const bigExp = bigEnd.totalExpenses - bigBase.totalExpenses;
        const htlInc = htlEnd.totalIncome - htlBase.totalIncome;
        const htlExp = htlEnd.totalExpenses - htlBase.totalExpenses;
        jrwIncomeRaw = allInc - bigInc - htlInc;
        jrwOpexRaw = allExp - bigExp - htlExp;
      }

      if (ownershipView) {
        // Approximate ownership weighting via GL revenue distribution
        let totalRaw = 0, totalWeighted = 0;
        for (const r of periodGlRows) {
          const acctField = (r.account_name || "").trim();
          const acctMatch = acctField.match(/^(\d{4}-\d{4}(-\d{2})?)/);
          if (!acctMatch) continue;
          const propertyName = r.property_name || "";
          const section = classifyEntityByName(propertyName);
          if (section !== "jrw") continue;
          const prefix = acctMatch[1].charAt(0);
          if (prefix !== "4") continue;
          const debit = parseFloat(r.debit || "0") || 0;
          const credit = parseFloat(r.credit || "0") || 0;
          const amount = credit - debit;
          if (amount <= 0) continue;
          totalRaw += amount;
          totalWeighted += amount * getOwnership(propertyName);
        }
        const ratio = totalRaw > 0 ? totalWeighted / totalRaw : 1;
        jrwIncome = jrwIncomeRaw * ratio;
        jrwOpex = jrwOpexRaw * ratio;
      } else {
        jrwIncome = jrwIncomeRaw;
        jrwOpex = jrwOpexRaw;
      }
    }

    // GL loop: hotel room revenue, below-NOI items (debt service, deprec, other)
    for (const r of periodGlRows) {
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

      // JRW below-NOI items from GL (income/opex always from income_statement)
      if (section === "jrw") {
        const pct = ownershipView ? getOwnership(propertyName) : 1;
        if (prefix === "6" || prefix === "7") {
          if (account.startsWith("6600") || account.startsWith("6650")) {
            jrwDeprecAmort += (debit - credit) * pct;
          }
        } else if (prefix === "8") {
          if (account.startsWith("8510") || account.startsWith("8511") || account.startsWith("8520") || account.startsWith("8525") || account.startsWith("8530")) {
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

    // BIG margin (reconciled with capital contributions so the margin reflects
    // Joe's cash infusions — without them operating expenses exceed fee revenue)
    const adjBigIncome = bigPnL.income * bigPct;
    const adjBigOpex = bigPnL.opex * bigPct;
    const adjBigNet = adjBigIncome - adjBigOpex;

    // Capital activity from GL (3xxx accounts under Blackdeer Investment Group)
    let bigCapital = 0;
    for (const r of glRows) {
      const postDate = r.post_date || "";
      if (postDate < ytdFrom || postDate > ytdTo) continue;
      const propName = (r.property_name || "").trim();
      if (!propName.startsWith("Blackdeer Investment Group")) continue;
      const acctField = (r.account_name || "").trim();
      if (!/^3\d{3}-/.test(acctField)) continue;
      const debit = parseFloat(r.debit || "0") || 0;
      const credit = parseFloat(r.credit || "0") || 0;
      bigCapital += credit - debit;
    }
    bigCapital *= bigPct;

    const bigNetWithCapital = adjBigNet + bigCapital;
    const bigMargin = adjBigIncome > 0 ? Math.round((bigNetWithCapital / adjBigIncome) * 100) : 0;

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

    // Park Vista P&L from PV AppFolio
    const pvPct = ownershipView ? getOwnership("Park Vista") : 1;
    let pvIncome: number;
    let pvExpenses: number;
    if (isYtd) {
      const pvTotals = extractSectionTotals(pvIS, "year_to_date");
      pvIncome = pvTotals.totalIncome * pvPct;
      pvExpenses = pvTotals.totalExpenses * pvPct;
    } else if (isMtd) {
      const pvTotals = extractSectionTotals(pvIS, "month_to_date");
      pvIncome = pvTotals.totalIncome * pvPct;
      pvExpenses = pvTotals.totalExpenses * pvPct;
    } else {
      // QTD/Custom: YTD subtraction (end YTD minus baseline YTD)
      const pvEndTotals = extractSectionTotals(pvIS, "year_to_date");
      const pvBaseTotals = extractSectionTotals(pvBaselineIS, "year_to_date");
      pvIncome = (pvEndTotals.totalIncome - pvBaseTotals.totalIncome) * pvPct;
      pvExpenses = (pvEndTotals.totalExpenses - pvBaseTotals.totalExpenses) * pvPct;
    }
    const pvNet = pvIncome - pvExpenses;

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
        netIncomeWithCapital: Math.round(bigNetWithCapital),
        capitalActivity: Math.round(bigCapital),
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
      pv: {
        totalIncome: Math.round(pvIncome),
        totalExpenses: Math.round(pvExpenses),
        netIncome: Math.round(pvNet),
        communityCount: PV_COMMUNITIES.length,
        ownershipPct: ownershipView ? 51 : 100,
      },
      alerts: {
        leasesExpiring,
        agedReceivables: Math.round(agedReceivables),
        feeReconciliationGap: feeRecon.internalGap,
      },
      period: {
        from: ytdFrom,
        to: ytdTo,
        basis: basisLabel,
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

export const maxDuration = 60;
