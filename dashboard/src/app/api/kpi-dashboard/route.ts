import { fetchReport, firstOfQuarter, firstOfYear, today, parseAmount, cachedJson, centralNowExported } from "@/lib/appfolio";
import { ENTITY_PROPERTY_IDS } from "@/lib/appfolio-entities";
import { getOwnership } from "@/lib/ownership";
import { getPropertyConfig, gradeProperty, BENCHMARKS, formatAssetClass } from "@/lib/property-config";
import type { AssetClass } from "@/lib/property-config";

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

interface AccountTotalsRow {
  property_name?: string;
  net_amount?: string;
  account_number?: string;
  account_name?: string;
}

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  year_to_date?: string;
}

interface ARRow {
  property_name?: string;
  amount_receivable?: string;
  "0_to30"?: string;
  "30_to60"?: string;
  "60_to90"?: string;
  "90_plus"?: string;
}

const DEBT_SERVICE_PREFIXES = ["8510", "8520", "8530"];

function isDebtService(acctNumber: string): boolean {
  return DEBT_SERVICE_PREFIXES.some((p) => acctNumber.startsWith(p));
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET() {
  try {
    const qtdFrom = firstOfQuarter();
    const qtdTo = today();
    const isQ1 = qtdFrom === firstOfYear();

    function dayBefore(dateStr: string): string {
      const d = new Date(dateStr + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().split("T")[0];
    }

    const basePromises: Promise<unknown[]>[] = [
      fetchReport<RentRollRow>("rent_roll"),
      fetchReport<AccountTotalsRow>("account_totals", {
        posted_on_from: qtdFrom,
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

    const results = await Promise.all(basePromises);
    const rentRows = results[0] as RentRollRow[];
    const accountRows = results[1] as AccountTotalsRow[];
    const hotelIS = results[2] as IncomeRow[];
    const arRows = results[3] as ARRow[];
    const hotelISPrev = !isQ1 ? (results[4] as IncomeRow[]) : [];

    // --- Per-property financials from account_totals ---
    const propertyFinancials = new Map<string, {
      income: number;
      expenses: number;
      debtService: number;
    }>();

    for (const row of accountRows) {
      const name = (row.property_name || "").trim();
      if (!name) continue;
      // Skip BIG management company from property table (Section 9)
      const cfg = getPropertyConfig(name);
      if (cfg.assetClass === "mgmt_company") continue;
      if (cfg.archived) continue;

      if (!propertyFinancials.has(name)) {
        propertyFinancials.set(name, { income: 0, expenses: 0, debtService: 0 });
      }
      const entry = propertyFinancials.get(name)!;
      const net = parseAmount(row.net_amount);
      const acctNum = (row.account_number || "").trim();

      if (acctNum && isDebtService(acctNum)) {
        entry.debtService += Math.abs(net);
      } else {
        if (net > 0) entry.income += net;
        else entry.expenses += Math.abs(net);
      }
    }

    // --- Hotel injection via income_statement ---
    function extractIS(rows: IncomeRow[]) {
      let totalIncome = 0;
      let totalExpenses = 0;
      let debtService = 0;
      for (const row of rows) {
        const name = (row.account_name || "").trim().toLowerCase();
        const amount = parseAmount(row.year_to_date);
        const acctNum = (row.account_number || "").trim();

        if (name === "total income") { totalIncome = amount; continue; }
        if (name === "total expense" || name === "total expenses") { totalExpenses = Math.abs(amount); continue; }
        if (name === "net income" || name === "net operating income") continue;

        if (acctNum && isDebtService(acctNum)) debtService += Math.abs(amount);
      }
      return { income: totalIncome, expenses: totalExpenses, debtService };
    }

    // Inject Hotel (BIG excluded from property table per spec)
    const hotelCur = extractIS(hotelIS);
    if (hotelISPrev.length === 0) {
      propertyFinancials.set("Badger Hotel Group", hotelCur);
    } else {
      const prev = extractIS(hotelISPrev);
      propertyFinancials.set("Badger Hotel Group", {
        income: hotelCur.income - prev.income,
        expenses: hotelCur.expenses - prev.expenses,
        debtService: hotelCur.debtService - prev.debtService,
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
      const netAfterDebt = noi - Math.round(fin.debtService);
      const dscr = fin.debtService > 0 ? noi / fin.debtService : 0;
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

      // Status grading per CRE logic (Section 8)
      const status = gradeProperty({
        dscr: Math.round(dscr * 100) / 100,
        oer: Math.round(oer * 10) / 10,
        occupancyRate,
        collectionRate,
        netAfterDebt,
        leaseExposure12mo,
        assetClass: cfg.assetClass,
      });

      return {
        name,
        slug: slugify(name),
        assetClass: cfg.assetClass,
        assetClassLabel: formatAssetClass(cfg.assetClass),
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
        vacancyLoss: Math.round(occ.vacancyLoss * 3),
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

    // --- Portfolio totals (exclude BIG mgmt company, already filtered above) ---
    const activeProperties = properties.filter((p) => !getPropertyConfig(p.name).archived);
    const portfolioRevenue = activeProperties.reduce((s, c) => s + c.revenue, 0);
    const portfolioExpenses = activeProperties.reduce((s, c) => s + c.expenses, 0);
    const portfolioNoi = portfolioRevenue - portfolioExpenses;
    const totalUnits = activeProperties.reduce((s, c) => s + c.totalUnits, 0);
    const totalOccupied = activeProperties.reduce((s, c) => s + c.occupied, 0);
    const totalSqft = activeProperties.reduce((s, c) => s + c.totalSqft, 0);
    const occupiedSqft = activeProperties.reduce((s, c) => s + c.occupiedSqft, 0);
    const totalVacancyLoss = activeProperties.reduce((s, c) => s + c.vacancyLoss, 0);
    const totalDebtService = activeProperties.reduce((s, c) => s + c.debtService, 0);
    const portfolioDscr = totalDebtService > 0 ? portfolioNoi / totalDebtService : 0;
    const totalDelinquent = activeProperties.reduce((s, c) => s + c.delinquent, 0);
    const concernCount = activeProperties.filter((c) => c.status === "Concern").length;
    const watchCount = activeProperties.filter((c) => c.status === "Watch").length;

    // Portfolio WALT
    const portfolioWaltNum = activeProperties.reduce((s, c) => {
      const occ = rentByProperty.get(c.name);
      return s + (occ ? occ.waltNumerator : 0);
    }, 0);
    const portfolioWaltDen = activeProperties.reduce((s, c) => {
      const occ = rentByProperty.get(c.name);
      return s + (occ ? occ.waltDenominator : 0);
    }, 0);
    const portfolioWalt = portfolioWaltDen > 0
      ? Math.round((portfolioWaltNum / portfolioWaltDen) * 10) / 10
      : null;

    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const monthsElapsed = now.getMonth() - quarterStartMonth + 1;

    return cachedJson({
      portfolio: {
        revenue: portfolioRevenue,
        noi: portfolioNoi,
        noiMargin: portfolioRevenue > 0 ? Math.round((portfolioNoi / portfolioRevenue) * 1000) / 10 : 0,
        occupancyRate: totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0,
        occupancySf: totalSqft > 0 ? Math.round((occupiedSqft / totalSqft) * 100) : 0,
        totalUnits,
        occupied: totalOccupied,
        vacant: totalUnits - totalOccupied,
        totalSqft: Math.round(totalSqft),
        occupiedSqft: Math.round(occupiedSqft),
        vacancyLoss: totalVacancyLoss,
        oer: portfolioRevenue > 0 ? Math.round((portfolioExpenses / portfolioRevenue) * 1000) / 10 : 0,
        dscr: Math.round(portfolioDscr * 100) / 100,
        debtService: Math.round(totalDebtService),
        walt: portfolioWalt,
        delinquent: totalDelinquent,
        propertyCount: activeProperties.length,
        concernCount,
        watchCount,
      },
      properties: activeProperties.sort((a, b) => b.revenue - a.revenue),
      period: {
        from: qtdFrom,
        to: qtdTo,
        label: "QTD",
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
