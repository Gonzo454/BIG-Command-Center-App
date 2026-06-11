import { NextRequest } from "next/server";
import { fetchReport, fetchPvReport, firstOfMonth, firstOfQuarter, firstOfYear, today, parseAmount, cachedJson, centralNowExported } from "@/lib/appfolio";
import { ENTITY_PROPERTY_IDS } from "@/lib/appfolio-entities";
import { PV_COMMUNITIES } from "@/lib/pv-communities";
import { getOwnership } from "@/lib/ownership";
import { getPropertyConfig, gradeProperty, BENCHMARKS, formatAssetClass, BUSINESS_ENTITY_LABELS, type BusinessEntity } from "@/lib/property-config";

interface RentRollRow {
  status?: string;
  property_name?: string;
  market_rent?: string;
  charge_amount?: string;
  rent?: string;
  sqft?: number | string;
  lease_from?: string;
  lease_to?: string;
  past_due?: string;
}

interface GLRow {
  account_name?: string;
  property_name?: string;
  post_date?: string;
  debit?: string;
  credit?: string;
}

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  year_to_date?: string;
  month_to_date?: string;
}

interface PvAccountTotalsRow {
  property_name?: string;
  property_id?: number;
  net_amount?: string;
}

interface PvRentRollRow {
  status?: string;
  property_name?: string;
}

interface ARRow {
  property_name?: string;
  amount_receivable?: string;
  "0_to30"?: string;
  "30_to60"?: string;
  "60_to90"?: string;
  "90_plus"?: string;
}

const DEBT_SERVICE_PREFIXES = ["8510", "8511", "8520", "8525", "8530"];

function isDebtService(acctNumber: string): boolean {
  return DEBT_SERVICE_PREFIXES.some((p) => acctNumber.startsWith(p));
}

function isCapitalAccount(acctNumber: string): boolean {
  return acctNumber.startsWith("3");
}

export const maxDuration = 60;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const paramFrom = params.get("from");
    const paramTo = params.get("to");
    const period = params.get("period") || "mtd";

    // Determine date range based on period or custom params
    let rangeFrom: string;
    let rangeLabel: string;
    if (paramFrom && paramTo) {
      rangeFrom = paramFrom;
      rangeLabel = period === "ytd" ? "YTD" : period === "qtd" ? "QTD" : period === "mtd" ? "MTD" : period === "prevmo" ? "Prev Mo" : "Custom";
    } else if (period === "ytd") {
      rangeFrom = firstOfYear();
      rangeLabel = "YTD";
    } else if (period === "qtd") {
      rangeFrom = firstOfQuarter();
      rangeLabel = "QTD";
    } else {
      rangeFrom = firstOfMonth();
      rangeLabel = "MTD";
    }
    const rangeTo = paramTo || today();

    const qtdFrom = rangeFrom;
    const qtdTo = rangeTo;
    const isQ1 = qtdFrom === firstOfYear();

    function dayBefore(dateStr: string): string {
      const d = new Date(dateStr + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().split("T")[0];
    }

    // Always fetch YTD GL for annualized DSCR (debt coverage is meaningless on partial months)
    const ytdStart = firstOfYear();

    const basePromises: Promise<unknown[]>[] = [
      fetchReport<RentRollRow>("rent_roll"),
      fetchReport<GLRow>("general_ledger", {
        posted_on_from: qtdFrom,
        posted_on_to: qtdTo,
      }),
      // YTD GL for annualized DSCR
      fetchReport<GLRow>("general_ledger", {
        posted_on_from: ytdStart,
        posted_on_to: qtdTo,
      }),
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: qtdFrom,
        posted_on_to: qtdTo,
        properties: { properties_ids: [ENTITY_PROPERTY_IDS.hotel] },
      }),
      fetchReport<ARRow>("aged_receivables_detail", {
        as_of_date: qtdTo,
      }),
    ];

    if (!isQ1) {
      const beforeQtr = dayBefore(qtdFrom);
      basePromises.push(
        fetchReport<IncomeRow>("income_statement", {
          posted_on_from: beforeQtr.slice(0, 8) + "01",
          posted_on_to: beforeQtr,
          properties: { properties_ids: [ENTITY_PROPERTY_IDS.hotel] },
        }),
      );
    }

    // --- Park Vista (separate AppFolio database) ---
    const isMtdPeriod = rangeLabel === "MTD";
    const isYtdPeriod = rangeLabel === "YTD" || qtdFrom === firstOfYear();
    const pvPromises: [Promise<PvRentRollRow[]>, Promise<PvAccountTotalsRow[]>, Promise<GLRow[]>, Promise<GLRow[]>] = [
      fetchPvReport<PvRentRollRow>("rent_roll").catch(() => []),
      fetchPvReport<PvAccountTotalsRow>("account_totals", {
        posted_on_from: qtdFrom,
        posted_on_to: qtdTo,
      }).catch(() => []),
      fetchPvReport<GLRow>("general_ledger", {
        posted_on_from: qtdFrom,
        posted_on_to: qtdTo,
      }).catch(() => []),
      fetchPvReport<GLRow>("general_ledger", {
        posted_on_from: ytdStart,
        posted_on_to: qtdTo,
      }).catch(() => []),
    ];

    const [results, pvResults] = await Promise.all([Promise.all(basePromises), Promise.all(pvPromises)]);
    const [pvRentRows, pvAccountRows, pvGlRows, pvYtdGlRows] = pvResults;

    // Per-community revenue/expenses from PV general ledger
    // (4xxx/5xxx = income, 6xxx/7xxx/8xxx = expenses, debt service accounts excluded)
    const pvCommunityIS = new Map<string, { income: number; expenses: number }>();
    for (const row of pvGlRows) {
      const name = (row.property_name || "").trim();
      if (!name) continue;
      const acctMatch = (row.account_name || "").trim().match(/^(\d{4})/);
      if (!acctMatch) continue;
      const acct = acctMatch[1];
      if (isCapitalAccount(acct) || isDebtService(acct)) continue;
      const prefix = acct.charAt(0);
      const debit = parseAmount(row.debit);
      const credit = parseAmount(row.credit);
      if (!pvCommunityIS.has(name)) pvCommunityIS.set(name, { income: 0, expenses: 0 });
      const entry = pvCommunityIS.get(name)!;
      if (prefix === "4" || prefix === "5") entry.income += credit - debit;
      else if (prefix === "6" || prefix === "7" || prefix === "8") entry.expenses += debit - credit;
    }
    const rentRows = results[0] as RentRollRow[];
    const glRows = results[1] as GLRow[];
    const ytdGlRows = results[2] as GLRow[];
    const hotelIS = results[3] as IncomeRow[];
    const arRows = results[4] as ARRow[];
    const hotelISPrev = !isQ1 ? (results[5] as IncomeRow[]) : [];

    // --- Per-property financials from general_ledger ---
    const propertyFinancials = new Map<string, {
      income: number;
      expenses: number;
      debtService: number;
    }>();

    for (const row of glRows) {
      const name = (row.property_name || "").trim();
      if (!name) continue;
      const cfg = getPropertyConfig(name);
      if (cfg.assetClass === "mgmt_company") continue;
      if (cfg.archived) continue;

      const acctField = (row.account_name || "").trim();
      const acctMatch = acctField.match(/^(\d{4}-\d{4}(-\d{2})?)/);
      if (!acctMatch) continue;
      let account = acctMatch[1];
      if (account.endsWith("-00")) account = account.slice(0, -3);
      const prefix = account.charAt(0);

      // Skip capital accounts (3xxx)
      if (isCapitalAccount(account)) continue;

      if (!propertyFinancials.has(name)) {
        propertyFinancials.set(name, { income: 0, expenses: 0, debtService: 0 });
      }
      const entry = propertyFinancials.get(name)!;
      const debit = parseFloat(row.debit || "0") || 0;
      const credit = parseFloat(row.credit || "0") || 0;

      if (isDebtService(account)) {
        entry.debtService += (debit - credit);
      } else if (account.startsWith("5875") || account.startsWith("5873") || account.startsWith("5760")) {
        // Hotel labor/merchant fees/billbacks: expense despite 5xxx range
        entry.expenses += (debit - credit);
      } else if (prefix === "4" || prefix === "5") {
        // Revenue/income accounts: credit-normal
        entry.income += (credit - debit);
      } else if (prefix === "6" || prefix === "7" || prefix === "8") {
        // Operating expense accounts: debit-normal
        entry.expenses += (debit - credit);
      }
    }

    // --- Annualized DSCR: aggregate YTD NOI + debt service per property ---
    // DSCR = YTD NOI / YTD Debt Service (annualization cancels out)
    const ytdDebtByProperty = new Map<string, number>();
    const ytdNoiByProperty = new Map<string, { income: number; expenses: number }>();
    for (const row of ytdGlRows) {
      const name = (row.property_name || "").trim();
      if (!name) continue;
      const acctField = (row.account_name || "").trim();
      const acctMatch = acctField.match(/^(\d{4}-\d{4}(-\d{2})?)/);
      if (!acctMatch) continue;
      let account = acctMatch[1];
      if (account.endsWith("-00")) account = account.slice(0, -3);
      const prefix = account.charAt(0);
      if (isCapitalAccount(account)) continue;
      const debit = parseFloat(row.debit || "0") || 0;
      const credit = parseFloat(row.credit || "0") || 0;

      if (isDebtService(account)) {
        ytdDebtByProperty.set(name, (ytdDebtByProperty.get(name) || 0) + (debit - credit));
      } else {
        if (!ytdNoiByProperty.has(name)) ytdNoiByProperty.set(name, { income: 0, expenses: 0 });
        const e = ytdNoiByProperty.get(name)!;
        if (account.startsWith("5875") || account.startsWith("5873") || account.startsWith("5760")) e.expenses += (debit - credit);
        else if (prefix === "4" || prefix === "5") e.income += (credit - debit);
        else if (prefix === "6" || prefix === "7" || prefix === "8") e.expenses += (debit - credit);
      }
    }

    // --- Hotel injection via income_statement ---
    function extractIS(rows: IncomeRow[]) {
      let totalIncome = 0;
      let totalExpenses = 0;
      for (const row of rows) {
        const name = (row.account_name || "").trim().toLowerCase();
        const amount = parseAmount(row.year_to_date);
        if (name === "total income") { totalIncome = amount; continue; }
        if (name === "total expense" || name === "total expenses") { totalExpenses = Math.abs(amount); continue; }
      }
      return { income: totalIncome, expenses: totalExpenses };
    }

    // Inject Hotel income/expenses (BIG excluded from property table per spec)
    // Preserve GL-based debt service for Hotel
    const hotelGlDebt = propertyFinancials.get("Badger Hotel Group")?.debtService || 0;
    const hotelCur = extractIS(hotelIS);
    if (hotelISPrev.length === 0) {
      propertyFinancials.set("Badger Hotel Group", { ...hotelCur, debtService: hotelGlDebt });
    } else {
      const prev = extractIS(hotelISPrev);
      propertyFinancials.set("Badger Hotel Group", {
        income: hotelCur.income - prev.income,
        expenses: hotelCur.expenses - prev.expenses,
        debtService: hotelGlDebt,
      });
    }

    // --- Rent roll: occupancy, SF, vacancy loss, WALT, lease exposure ---
    const occupiedRents = new Map<string, number[]>();
    for (const r of rentRows) {
      const prop = (r.property_name || "").trim();
      if (!prop) continue;
      const s = (r.status || "").toLowerCase();
      if (s.includes("current") || s.includes("occupied") || s.includes("notice")) {
        const rent = parseAmount(r.market_rent) || parseAmount(r.rent);
        if (rent > 0) {
          if (!occupiedRents.has(prop)) occupiedRents.set(prop, []);
          occupiedRents.get(prop)!.push(rent);
        }
      }
    }

    const now = centralNowExported();
    const oneYearOut = new Date(now);
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

    const rentByProperty = new Map<string, {
      totalUnits: number;
      occupied: number;
      vacancyLoss: number;
      totalSqft: number;
      occupiedSqft: number;
      totalInPlaceRent: number;
      waltNumerator: number;
      waltDenominator: number;
      expiringRent12mo: number;
    }>();

    for (const r of rentRows) {
      const prop = (r.property_name || "").trim();
      if (!prop) continue;
      if (!rentByProperty.has(prop)) {
        rentByProperty.set(prop, {
          totalUnits: 0, occupied: 0, vacancyLoss: 0,
          totalSqft: 0, occupiedSqft: 0, totalInPlaceRent: 0,
          waltNumerator: 0, waltDenominator: 0, expiringRent12mo: 0,
        });
      }
      const entry = rentByProperty.get(prop)!;
      entry.totalUnits++;
      const s = (r.status || "").toLowerCase();
      const sqft = typeof r.sqft === "number" ? r.sqft : parseFloat(String(r.sqft || "0")) || 0;
      entry.totalSqft += sqft;

      if (s.includes("current") || s.includes("occupied") || s.includes("notice")) {
        entry.occupied++;
        entry.occupiedSqft += sqft;
        const annualRent = (parseAmount(r.rent) || 0) * 12;
        entry.totalInPlaceRent += annualRent;

        // WALT: weight by annual rent × remaining lease term in years
        if (r.lease_to && annualRent > 0) {
          const leaseEnd = new Date(r.lease_to + "T12:00:00Z");
          const remainingYrs = Math.max(0, (leaseEnd.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          entry.waltNumerator += annualRent * remainingYrs;
          entry.waltDenominator += annualRent;

          // Lease-expiration exposure: rent expiring within 12 months
          if (leaseEnd >= now && leaseEnd <= oneYearOut) {
            entry.expiringRent12mo += annualRent;
          }
        }
      } else {
        let rent = parseAmount(r.market_rent) || parseAmount(r.charge_amount);
        if (!rent) {
          const rents = occupiedRents.get(prop);
          if (rents && rents.length > 0) {
            rent = rents.reduce((a, b) => a + b, 0) / rents.length;
          }
        }
        entry.vacancyLoss += rent;
      }
    }

    // --- Aged receivables: collection/delinquency per property ---
    const arByProperty = new Map<string, {
      totalBilled: number;
      delinquent: number;
    }>();
    for (const r of arRows) {
      const prop = (r.property_name || "").trim();
      if (!prop) continue;
      if (!arByProperty.has(prop)) arByProperty.set(prop, { totalBilled: 0, delinquent: 0 });
      const entry = arByProperty.get(prop)!;
      const total = parseAmount(r.amount_receivable);
      const over30 = parseAmount(r["30_to60"]) + parseAmount(r["60_to90"]) + parseAmount(r["90_plus"]);
      entry.totalBilled += total;
      entry.delinquent += over30;
    }

    // Compute months elapsed from date range for monthly NOI grading
    // Uses actual day count / 30.44 for accurate partial-month custom ranges
    const fromDate = new Date(qtdFrom + "T12:00:00Z");
    const toDate = new Date(qtdTo + "T12:00:00Z");
    const daysDiff = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24) + 1;
    const monthsElapsed = Math.max(1, Math.round(daysDiff / 30.44 * 10) / 10);

    // --- Build CRE KPIs per property ---
    const allProperties = Array.from(propertyFinancials.keys());
    const properties = allProperties.map((name) => {
      const fin = propertyFinancials.get(name)!;
      const occ = rentByProperty.get(name) || {
        totalUnits: 0, occupied: 0, vacancyLoss: 0,
        totalSqft: 0, occupiedSqft: 0, totalInPlaceRent: 0,
        waltNumerator: 0, waltDenominator: 0, expiringRent12mo: 0,
      };
      const ar = arByProperty.get(name) || { totalBilled: 0, delinquent: 0 };
      const ownershipPct = getOwnership(name);
      const cfg = getPropertyConfig(name);
      const bench = BENCHMARKS[cfg.assetClass];

      const revenue = Math.round(fin.income);
      const expenses = Math.round(fin.expenses);
      const noi = revenue - expenses;
      const noiMargin = revenue > 0 ? (noi / revenue) * 100 : 0;
      // DSCR uses YTD data (annualization cancels: YTD NOI / YTD Debt = Annual NOI / Annual Debt)
      const ytdDebt = ytdDebtByProperty.get(name) || 0;
      const ytdNoi = ytdNoiByProperty.has(name)
        ? ytdNoiByProperty.get(name)!.income - ytdNoiByProperty.get(name)!.expenses
        : 0;
      const netAfterDebt = ytdDebt > 0 ? noi - Math.round(fin.debtService) : null;
      const dscr = ytdDebt > 0 ? ytdNoi / ytdDebt : 0;
      const oer = revenue > 0 ? (expenses / revenue) * 100 : 0;

      // Occupancy: SF-based for commercial, unit-based for residential
      const occupancyRate = occ.totalSqft > 0
        ? Math.round((occ.occupiedSqft / occ.totalSqft) * 100)
        : (occ.totalUnits > 0 ? Math.round((occ.occupied / occ.totalUnits) * 100) : 0);

      // WALT
      const walt = occ.waltDenominator > 0
        ? Math.round((occ.waltNumerator / occ.waltDenominator) * 10) / 10
        : null;

      // Lease expiration exposure (% of rent expiring in 12mo)
      const leaseExposure12mo = occ.totalInPlaceRent > 0
        ? Math.round((occ.expiringRent12mo / occ.totalInPlaceRent) * 1000) / 10
        : 0;

      // Rent per SF (annualized)
      const rentPerSf = occ.occupiedSqft > 0
        ? Math.round((occ.totalInPlaceRent / occ.occupiedSqft) * 100) / 100
        : null;

      // Collection rate (estimated from AR)
      const totalRentBilled = revenue > 0 ? revenue : 1;
      const collectionRate = ar.delinquent > 0
        ? Math.round(Math.max(0, Math.min(100, ((totalRentBilled - ar.delinquent) / totalRentBilled) * 100)) * 10) / 10
        : 100;

      // Status grading: 3-tier (Strong/Stable/Review)
      const monthlyNoi = monthsElapsed > 0 ? noi / monthsElapsed : noi;
      const occForGrading = occ.totalSqft > 0 || occ.totalUnits > 0 ? occupancyRate : undefined;
      const status = gradeProperty({ monthlyNoi, occupancyRate: occForGrading, propertyName: name });

      return {
        name,
        slug: slugify(name),
        assetClass: cfg.assetClass,
        assetClassLabel: formatAssetClass(cfg.assetClass),
        businessEntity: cfg.businessEntity,
        managedOnly: cfg.managedOnly,
        ownershipPct,
        revenue,
        expenses,
        noi,
        noiMargin: Math.round(noiMargin * 10) / 10,
        netAfterDebt,
        totalUnits: occ.totalUnits,
        occupied: occ.occupied,
        vacant: occ.totalUnits - occ.occupied,
        occupancyRate,
        totalSqft: Math.round(occ.totalSqft),
        occupiedSqft: Math.round(occ.occupiedSqft),
        vacancyLoss: cfg.zeroVacancyLoss ? 0 : Math.round(occ.vacancyLoss * monthsElapsed),
        debtService: Math.round(fin.debtService),
        dscr: Math.round(dscr * 100) / 100,
        oer: Math.round(oer * 10) / 10,
        walt,
        leaseExposure12mo,
        rentPerSf,
        collectionRate,
        delinquent: Math.round(ar.delinquent),
        status,
        // Benchmark targets for this property's asset class
        targets: {
          oer: `${bench.oerLow}–${bench.oerHigh}%`,
          noiMargin: `${bench.noiMarginLow}–${bench.noiMarginHigh}%`,
          dscrMin: bench.dscrMin,
          waltYears: bench.waltYears,
          occupancy: bench.occupancyTarget,
        },
      };
    }).filter((c) => c.revenue > 0 || c.totalUnits > 0);

    // --- Group properties by business entity ---
    const activeProperties = properties.filter((p) => !getPropertyConfig(p.name).archived);

    function computeEntitySummary(entityProps: typeof activeProperties) {
      const rev = entityProps.reduce((s, c) => s + c.revenue, 0);
      const exp = entityProps.reduce((s, c) => s + c.expenses, 0);
      const noi = rev - exp;
      const units = entityProps.reduce((s, c) => s + c.totalUnits, 0);
      const occ = entityProps.reduce((s, c) => s + c.occupied, 0);
      const sqft = entityProps.reduce((s, c) => s + c.totalSqft, 0);
      const occSqft = entityProps.reduce((s, c) => s + c.occupiedSqft, 0);
      const vacLoss = entityProps.reduce((s, c) => s + c.vacancyLoss, 0);
      const debt = entityProps.reduce((s, c) => s + c.debtService, 0);
      const ytdD = entityProps.reduce((s, c) => s + (ytdDebtByProperty.get(c.name) || 0), 0);
      const ytdN = entityProps.reduce((s, c) => {
        const yn = ytdNoiByProperty.get(c.name);
        return s + (yn ? yn.income - yn.expenses : 0);
      }, 0);
      const dscr = ytdD > 0 ? ytdN / ytdD : 0;
      const deliq = entityProps.reduce((s, c) => s + c.delinquent, 0);
      const waltNum = entityProps.reduce((s, c) => {
        const r = rentByProperty.get(c.name);
        return s + (r ? r.waltNumerator : 0);
      }, 0);
      const waltDen = entityProps.reduce((s, c) => {
        const r = rentByProperty.get(c.name);
        return s + (r ? r.waltDenominator : 0);
      }, 0);
      return {
        revenue: rev,
        noi,
        noiMargin: rev > 0 ? Math.round((noi / rev) * 1000) / 10 : 0,
        occupancyRate: units > 0 ? Math.round((occ / units) * 100) : 0,
        totalUnits: units,
        occupied: occ,
        vacant: units - occ,
        totalSqft: Math.round(sqft),
        occupiedSqft: Math.round(occSqft),
        vacancyLoss: vacLoss,
        oer: rev > 0 ? Math.round((exp / rev) * 1000) / 10 : 0,
        dscr: Math.round(dscr * 100) / 100,
        debtService: Math.round(debt),
        walt: waltDen > 0 ? Math.round((waltNum / waltDen) * 10) / 10 : null,
        delinquent: deliq,
        propertyCount: entityProps.length,
        reviewCount: entityProps.filter((c) => c.status === "Review").length,
        stableCount: entityProps.filter((c) => c.status === "Stable").length,
        strongCount: entityProps.filter((c) => c.status === "Strong").length,
      };
    }

    // --- Park Vista section (from PV AppFolio database) ---
    // Debt service per community from PV general ledger (8510/8511/8520/8525/8530)
    function pvDebtByCommunity(rows: GLRow[]) {
      const map = new Map<string, number>();
      for (const row of rows) {
        const name = (row.property_name || "").trim();
        if (!name) continue;
        const acctMatch = (row.account_name || "").trim().match(/^(\d{4})/);
        if (!acctMatch || !isDebtService(acctMatch[1])) continue;
        const debit = parseAmount(row.debit);
        const credit = parseAmount(row.credit);
        map.set(name, (map.get(name) || 0) + (debit - credit));
      }
      return map;
    }
    const pvDebtMap = pvDebtByCommunity(pvGlRows);
    const pvYtdDebtMap = pvDebtByCommunity(pvYtdGlRows);

    // YTD NOI per community from PV GL (for annualized DSCR, same approach as JRW)
    const pvYtdNoiMap = new Map<string, number>();
    for (const row of pvYtdGlRows) {
      const name = (row.property_name || "").trim();
      if (!name) continue;
      const acctMatch = (row.account_name || "").trim().match(/^(\d{4})/);
      if (!acctMatch) continue;
      const acct = acctMatch[1];
      if (isCapitalAccount(acct) || isDebtService(acct)) continue;
      const prefix = acct.charAt(0);
      const debit = parseAmount(row.debit);
      const credit = parseAmount(row.credit);
      if (prefix === "4" || prefix === "5") {
        pvYtdNoiMap.set(name, (pvYtdNoiMap.get(name) || 0) + (credit - debit));
      } else if (prefix === "6" || prefix === "7" || prefix === "8") {
        pvYtdNoiMap.set(name, (pvYtdNoiMap.get(name) || 0) - (debit - credit));
      }
    }

    const pvOccByCommunity = new Map<string, { total: number; occupied: number }>();
    for (const r of pvRentRows) {
      const n = (r.property_name || "").trim();
      if (!n) continue;
      if (!pvOccByCommunity.has(n)) pvOccByCommunity.set(n, { total: 0, occupied: 0 });
      const entry = pvOccByCommunity.get(n)!;
      entry.total++;
      const st = (r.status || "").toLowerCase();
      if (st.includes("current") || st.includes("occupied")) entry.occupied++;
    }

    const pvBench = BENCHMARKS.residential;
    const pvOwnership = getOwnership("Park Vista");
    const pvProperties = PV_COMMUNITIES.map((c) => {
      const fin = pvCommunityIS.get(c.name) || { income: 0, expenses: 0 };
      const occ = pvOccByCommunity.get(c.name) || { total: 0, occupied: 0 };
      const debtService = Math.round(pvDebtMap.get(c.name) || 0);
      const revenue = Math.round(fin.income);
      const expenses = Math.round(fin.expenses);
      const noi = revenue - expenses;
      const ytdDebt = pvYtdDebtMap.get(c.name) || 0;
      const ytdNoi = pvYtdNoiMap.get(c.name) || 0;
      const dscr = ytdDebt > 0 ? ytdNoi / ytdDebt : 0;
      const monthlyNoi = monthsElapsed > 0 ? noi / monthsElapsed : noi;
      return {
        name: c.name,
        slug: c.slug,
        assetClass: "residential" as const,
        assetClassLabel: "Senior Housing",
        businessEntity: "park_vista" as BusinessEntity,
        managedOnly: false,
        ownershipPct: pvOwnership,
        revenue,
        expenses,
        noi,
        noiMargin: revenue > 0 ? Math.round((noi / revenue) * 1000) / 10 : 0,
        netAfterDebt: debtService > 0 ? noi - debtService : null,
        totalUnits: occ.total,
        occupied: occ.occupied,
        vacant: occ.total - occ.occupied,
        occupancyRate: occ.total > 0 ? Math.round((occ.occupied / occ.total) * 100) : 0,
        totalSqft: 0,
        occupiedSqft: 0,
        vacancyLoss: 0,
        debtService,
        dscr: Math.round(dscr * 100) / 100,
        oer: revenue > 0 ? Math.round((expenses / revenue) * 1000) / 10 : 0,
        walt: null,
        leaseExposure12mo: 0,
        rentPerSf: null,
        collectionRate: 100,
        delinquent: 0,
        status: gradeProperty({
          monthlyNoi,
          occupancyRate: occ.total > 0 ? (occ.occupied / occ.total) * 100 : undefined,
          propertyName: c.name,
        }),
        targets: {
          oer: `${pvBench.oerLow}–${pvBench.oerHigh}%`,
          noiMargin: `${pvBench.noiMarginLow}–${pvBench.noiMarginHigh}%`,
          dscrMin: pvBench.dscrMin,
          waltYears: pvBench.waltYears,
          occupancy: pvBench.occupancyTarget,
        },
      };
    }).filter((c) => c.revenue > 0 || c.totalUnits > 0)
      .sort((a, b) => b.revenue - a.revenue);

    const pvRevenue = pvProperties.reduce((s, c) => s + c.revenue, 0);
    const pvNoi = pvProperties.reduce((s, c) => s + c.noi, 0);
    const pvExpenses = pvProperties.reduce((s, c) => s + c.expenses, 0);
    const pvDebtTotal = pvProperties.reduce((s, c) => s + c.debtService, 0);
    const pvYtdNoiTotal = pvProperties.reduce((s, c) => s + (pvYtdNoiMap.get(c.name) || 0), 0);
    const pvYtdDebtTotal = pvProperties.reduce((s, c) => s + (pvYtdDebtMap.get(c.name) || 0), 0);
    const pvTotalUnits = pvProperties.reduce((s, c) => s + c.totalUnits, 0);
    const pvOccupied = pvProperties.reduce((s, c) => s + c.occupied, 0);
    const pvSection = pvProperties.length > 0 || pvRevenue !== 0 ? {
      entity: "park_vista" as BusinessEntity,
      label: BUSINESS_ENTITY_LABELS.park_vista,
      summary: {
        revenue: pvRevenue,
        noi: pvNoi,
        noiMargin: pvRevenue > 0 ? Math.round((pvNoi / pvRevenue) * 1000) / 10 : 0,
        occupancyRate: pvTotalUnits > 0 ? Math.round((pvOccupied / pvTotalUnits) * 100) : 0,
        totalUnits: pvTotalUnits,
        occupied: pvOccupied,
        vacant: pvTotalUnits - pvOccupied,
        totalSqft: 0,
        occupiedSqft: 0,
        vacancyLoss: 0,
        oer: pvRevenue > 0 ? Math.round((pvExpenses / pvRevenue) * 1000) / 10 : 0,
        dscr: pvYtdDebtTotal > 0 ? Math.round((pvYtdNoiTotal / pvYtdDebtTotal) * 100) / 100 : 0,
        debtService: pvDebtTotal,
        walt: null,
        delinquent: 0,
        propertyCount: pvProperties.length,
        reviewCount: pvProperties.filter((c) => c.status === "Review").length,
        stableCount: pvProperties.filter((c) => c.status === "Stable").length,
        strongCount: pvProperties.filter((c) => c.status === "Strong").length,
      },
      properties: pvProperties,
    } : null;

    // Group by entity — Park Vista leads (biggest earner)
    const entityOrder: BusinessEntity[] = ["jrw", "big", "badger_hotel", "badger_realty"];
    const sections = entityOrder
      .map((entity) => {
        const entityProps = activeProperties
          .filter((p) => p.businessEntity === entity)
          .sort((a, b) => b.revenue - a.revenue);
        if (entityProps.length === 0) return null;
        // BIG is a pure management company — its summary reflects only its own
        // corporate P&L, not the P&L of third-party-owned properties it manages.
        const summaryProps =
          entity === "big" ? entityProps.filter((p) => !p.managedOnly) : entityProps;
        return {
          entity,
          label: BUSINESS_ENTITY_LABELS[entity],
          summary: computeEntitySummary(summaryProps.length > 0 ? summaryProps : entityProps),
          properties: entityProps,
        };
      })
      .filter(Boolean);

    if (pvSection) sections.unshift(pvSection);

    // Overall portfolio totals (backwards compat)
    const portfolioSummary = computeEntitySummary(activeProperties);

    return cachedJson({
      portfolio: portfolioSummary,
      sections,
      properties: activeProperties.sort((a, b) => b.revenue - a.revenue),
      period: {
        from: qtdFrom,
        to: qtdTo,
        label: rangeLabel,
        monthsElapsed,
      },
    });
  } catch (err) {
    console.error("KPI Dashboard error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
