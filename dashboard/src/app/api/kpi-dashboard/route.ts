import { fetchReport, firstOfQuarter, today, parseAmount, cachedJson, centralNowExported } from "@/lib/appfolio";
import { ENTITY_PROPERTY_IDS } from "@/lib/appfolio-entities";
import { getOwnership } from "@/lib/ownership";

interface RentRollRow {
  status?: string;
  property_name?: string;
  market_rent?: string;
  charge_amount?: string;
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

const DEBT_SERVICE_PREFIXES = ["8510", "8520", "8530"];
const LABOR_PREFIXES = ["6100", "6110", "6120", "6130", "6140", "6150", "6200", "6210", "6220", "6230", "6240", "6250", "6300"];

function isDebtService(acctNumber: string): boolean {
  return DEBT_SERVICE_PREFIXES.some((p) => acctNumber.startsWith(p));
}

function isLabor(acctNumber: string): boolean {
  return LABOR_PREFIXES.some((p) => acctNumber.startsWith(p));
}

function getStatus(noiMargin: number, occupancy: number): "Strong" | "Watch" | "Concern" {
  if (occupancy < 70 || noiMargin < 15) return "Concern";
  if (occupancy < 85 || noiMargin < 22) return "Watch";
  return "Strong";
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET() {
  try {
    const qtdFrom = firstOfQuarter();
    const qtdTo = today();

    const [rentRows, accountRows, bigIS, hotelIS] = await Promise.all([
      fetchReport<RentRollRow>("rent_roll"),
      fetchReport<AccountTotalsRow>("account_totals", {
        posted_on_from: qtdFrom,
        posted_on_to: qtdTo,
      }),
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: qtdFrom,
        posted_on_to: qtdTo,
        properties: { properties_ids: [ENTITY_PROPERTY_IDS.big] },
      }),
      fetchReport<IncomeRow>("income_statement", {
        posted_on_from: qtdFrom,
        posted_on_to: qtdTo,
        properties: { properties_ids: [ENTITY_PROPERTY_IDS.hotel] },
      }),
    ]);

    // Build per-property financials from account_totals (JRW properties)
    const propertyFinancials = new Map<string, {
      income: number;
      expenses: number;
      debtService: number;
      labor: number;
    }>();

    for (const row of accountRows) {
      const name = (row.property_name || "").trim();
      if (!name) continue;
      if (!propertyFinancials.has(name)) {
        propertyFinancials.set(name, { income: 0, expenses: 0, debtService: 0, labor: 0 });
      }
      const entry = propertyFinancials.get(name)!;
      const net = parseAmount(row.net_amount);
      const acctNum = (row.account_number || "").trim();

      if (acctNum && isDebtService(acctNum)) {
        entry.debtService += Math.abs(net);
      } else if (acctNum && isLabor(acctNum)) {
        entry.labor += Math.abs(net);
        if (net < 0) entry.expenses += Math.abs(net);
        else entry.income += net;
      } else {
        if (net > 0) entry.income += net;
        else entry.expenses += Math.abs(net);
      }
    }

    // Inject BIG and Hotel from income_statement (they're not in account_totals)
    function injectEntity(rows: IncomeRow[], entityName: string) {
      let totalIncome = 0;
      let totalExpenses = 0;
      let debtService = 0;
      let labor = 0;
      for (const row of rows) {
        const name = (row.account_name || "").trim().toLowerCase();
        const amount = parseAmount(row.year_to_date);
        const acctNum = (row.account_number || "").trim();

        if (name === "total income") { totalIncome = amount; continue; }
        if (name === "total expense" || name === "total expenses") { totalExpenses = Math.abs(amount); continue; }
        if (name === "net income" || name === "net operating income") continue;

        if (acctNum && isDebtService(acctNum)) debtService += Math.abs(amount);
        if (acctNum && isLabor(acctNum)) labor += Math.abs(amount);
      }
      propertyFinancials.set(entityName, {
        income: totalIncome,
        expenses: totalExpenses,
        debtService,
        labor,
      });
    }

    injectEntity(bigIS, "Blackdeer Investment Group");
    injectEntity(hotelIS, "Badger Hotel Group");

    // Build occupancy per property from rent roll
    const rentByProperty = new Map<string, {
      total: number;
      occupied: number;
      vacancyLoss: number;
    }>();

    for (const r of rentRows) {
      const prop = (r.property_name || "").trim();
      if (!prop) continue;
      if (!rentByProperty.has(prop)) {
        rentByProperty.set(prop, { total: 0, occupied: 0, vacancyLoss: 0 });
      }
      const entry = rentByProperty.get(prop)!;
      entry.total++;
      const s = (r.status || "").toLowerCase();
      if (s.includes("current") || s.includes("occupied") || s.includes("notice")) {
        entry.occupied++;
      } else {
        const rent = parseAmount(r.market_rent) || parseAmount(r.charge_amount);
        entry.vacancyLoss += rent;
      }
    }

    // Build KPIs for all properties
    const allProperties = Array.from(propertyFinancials.keys());
    const communities = allProperties.map((name) => {
      const fin = propertyFinancials.get(name)!;
      const occ = rentByProperty.get(name) || { total: 0, occupied: 0, vacancyLoss: 0 };
      const ownershipPct = getOwnership(name);

      const revenue = Math.round(fin.income);
      const expenses = Math.round(fin.expenses);
      const noi = revenue - expenses;
      const noiMargin = revenue > 0 ? (noi / revenue) * 100 : 0;
      const netAfterDebt = noi - Math.round(fin.debtService);
      const occupancyRate = occ.total > 0 ? Math.round((occ.occupied / occ.total) * 100) : 0;
      const laborPercent = revenue > 0 ? (fin.labor / revenue) * 100 : 0;
      const dscr = fin.debtService > 0 ? noi / fin.debtService : 0;
      const oer = revenue > 0 ? (expenses / revenue) * 100 : 0;

      return {
        name,
        slug: slugify(name),
        ownershipPct,
        revenue,
        expenses,
        noi,
        noiMargin: Math.round(noiMargin * 10) / 10,
        netAfterDebt,
        totalUnits: occ.total,
        occupied: occ.occupied,
        vacant: occ.total - occ.occupied,
        occupancyRate,
        vacancyLoss: Math.round(occ.vacancyLoss * 3), // estimate quarterly from monthly rent
        laborPercent: Math.round(laborPercent * 10) / 10,
        laborTotal: Math.round(fin.labor),
        debtService: Math.round(fin.debtService),
        dscr: Math.round(dscr * 100) / 100,
        oer: Math.round(oer * 10) / 10,
        status: getStatus(noiMargin, occupancyRate),
      };
    }).filter((c) => c.revenue > 0 || c.totalUnits > 0);

    // Portfolio totals
    const portfolioRevenue = communities.reduce((s, c) => s + c.revenue, 0);
    const portfolioExpenses = communities.reduce((s, c) => s + c.expenses, 0);
    const portfolioNoi = portfolioRevenue - portfolioExpenses;
    const totalUnits = communities.reduce((s, c) => s + c.totalUnits, 0);
    const totalOccupied = communities.reduce((s, c) => s + c.occupied, 0);
    const totalVacancyLoss = communities.reduce((s, c) => s + c.vacancyLoss, 0);
    const totalLabor = communities.reduce((s, c) => s + c.laborTotal, 0);
    const concernCount = communities.filter((c) => c.status === "Concern").length;
    const watchCount = communities.filter((c) => c.status === "Watch").length;

    const now = centralNowExported();
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const monthsElapsed = now.getMonth() - quarterStartMonth + 1;

    return cachedJson({
      portfolio: {
        revenue: portfolioRevenue,
        noi: portfolioNoi,
        noiMargin: portfolioRevenue > 0 ? Math.round((portfolioNoi / portfolioRevenue) * 1000) / 10 : 0,
        occupancyRate: totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0,
        totalUnits,
        occupied: totalOccupied,
        vacant: totalUnits - totalOccupied,
        vacancyLoss: totalVacancyLoss,
        laborPercent: portfolioRevenue > 0 ? Math.round((totalLabor / portfolioRevenue) * 1000) / 10 : 0,
        oer: portfolioRevenue > 0 ? Math.round((portfolioExpenses / portfolioRevenue) * 1000) / 10 : 0,
        propertyCount: communities.length,
        concernCount,
        watchCount,
      },
      properties: communities.sort((a, b) => b.revenue - a.revenue),
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
