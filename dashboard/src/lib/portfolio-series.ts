import { fetchReport, fetchPvReport, parseAmount } from "@/lib/appfolio";
import { classifyEntityByName } from "@/lib/appfolio-entities";
import { getOwnership } from "@/lib/ownership";
import { getPropertyConfig } from "@/lib/property-config";

export interface GLRow {
  account_name?: string;
  property_name?: string;
  post_date?: string;
  party_name?: string;
  debit?: string;
  credit?: string;
}

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  month_to_date?: string;
  year_to_date?: string;
}

export interface EntityMonth {
  /** "YYYY-MM" */
  month: string;
  revenue: number;
  expenses: number;
  netIncome: number;
  /** interest portion of debt service (no principal) */
  interestExpense?: number;
}

export interface PortfolioSeries {
  months: string[];
  jrw: EntityMonth[];
  big: EntityMonth[];
  hotel: EntityMonth[];
  pvshm: EntityMonth[];
  /** monthly mirror-line variance: BIG 5820 fee income vs JRW mgmt-fee expense */
  mirror: { month: string; big5820: number; jrwFee: number; variance: number }[];
}

const DEBT_SERVICE_PREFIXES = ["8510", "8511", "8520", "8525", "8530"];

/**
 * Mirror check compares like-for-like: BIG's 5820 fee revenue billed to
 * JRW-owned properties vs the management-fee expense those same properties
 * book. BIG also collects fees from managed-only/non-JRW payers (Water Tower,
 * Vantage, Research Park, Prairie Square, the hotel, third parties) which
 * have no JRW expense mirror and are excluded from both sides.
 */
const JRW_PARTY_ALIASES = [
  "2172 mpw",
  "2080 mpw",
  "mpw",
  "cg silver",
  "greywolf",
  "greyworks",
  "cic2",
  "hc1",
  "honey creek 1",
  "honey creek i",
  "honey badger",
  "honey creek ii",
  "honey creek iv",
  "spooner",
  "germantown",
  "columbia st",
  "red badger",
  "honey creek iii",
];

const NON_JRW_PARTY_MARKERS = [
  "water tower",
  "prairie square",
  "research park",
  "vantage",
  "metro crossing",
  "station 955",
  "badger hotel",
  "gc real estate",
  "hc4",
  "tfi",
];

function isJrwParty(partyName: string | undefined): boolean {
  const p = (partyName || "").toLowerCase();
  if (!p) return false;
  if (NON_JRW_PARTY_MARKERS.some((m) => p.includes(m))) return false;
  return JRW_PARTY_ALIASES.some((a) => p.includes(a));
}

/**
 * Months before the AppFolio migration settled contain catch-up/beginning
 * balance entries (fees billed in one month, expensed in another), so the
 * mirror check only evaluates months from this point forward.
 */
export const MIRROR_CHECK_FROM = "2025-10";

export function lastCompleteMonthEnd(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthsBack(count: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function emptyMonth(month: string): EntityMonth {
  return { month, revenue: 0, expenses: 0, netIncome: 0 };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Build monthly Owner Net Income series for every entity from the main
 * AppFolio GL (JRW / BIG / Hotel) plus per-month PV income statements
 * (PVSHM management company).
 *
 * Joe's Share view weights each JRW property by Joe's ownership %, PVSHM by
 * 51%, and the hotel by Joe's stake; BIG is wholly owned.
 */
export async function buildPortfolioSeries(
  monthCount: number,
  joeView: boolean
): Promise<PortfolioSeries> {
  const months = monthsBack(monthCount);
  const fromDate = `${months[0]}-01`;
  const toDate = lastCompleteMonthEnd();

  const pvPct = joeView ? getOwnership("Park Vista") : 1;
  const hotelPct = joeView ? getOwnership("Badger Hotel Group") : 1;

  const [glRows, pvMonths] = await Promise.all([
    fetchReport<GLRow>("general_ledger", {
      posted_on_from: fromDate,
      posted_on_to: toDate,
    }),
    mapWithConcurrency(months, 4, async (month) => {
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      try {
        const rows = await fetchPvReport<IncomeRow>("income_statement", {
          posted_on_from: `${month}-01`,
          posted_on_to: `${month}-${String(lastDay).padStart(2, "0")}`,
        });
        // Sum per-account rows so PV matches the main-DB Operations basis:
        // 4xxx/5xxx revenue, 6xxx/7xxx operating expenses excluding
        // depreciation/amortization; 8xxx (debt service, misc adjustments)
        // excluded except mortgage interest which feeds After Debt Service.
        let income = 0;
        let expenses = 0;
        let interest = 0;
        for (const row of rows) {
          const acct = (row.account_number || "").trim();
          if (!acct) continue;
          const name = (row.account_name || "").toLowerCase().trim();
          const amount = parseAmount(row.month_to_date);
          const prefix = acct.charAt(0);
          if (prefix === "4" || prefix === "5") {
            income += amount;
          } else if (prefix === "6" || prefix === "7") {
            if (!/deprec|amort/.test(name)) expenses += amount;
          } else if (
            prefix === "8" &&
            DEBT_SERVICE_PREFIXES.some((p) => acct.startsWith(p)) &&
            !name.includes("principal")
          ) {
            interest += amount;
          }
        }
        return { month, income, expenses, interest, failed: false };
      } catch {
        return { month, income: 0, expenses: 0, interest: 0, failed: true };
      }
    }),
  ]);

  const failedMonths = pvMonths.filter((m) => m.failed).map((m) => m.month);
  if (failedMonths.length > 0) {
    throw new Error(`PV income statement unavailable for: ${failedMonths.join(", ")}`);
  }

  const idx = new Map(months.map((m, i) => [m, i]));
  const jrw = months.map(emptyMonth);
  const big = months.map(emptyMonth);
  const hotel = months.map(emptyMonth);
  const pvshm = months.map(emptyMonth);
  const mirrorBig = new Array(months.length).fill(0);
  const mirrorJrw = new Array(months.length).fill(0);
  jrw.forEach((m) => (m.interestExpense = 0));
  pvshm.forEach((m) => (m.interestExpense = 0));

  for (const r of glRows) {
    const month = (r.post_date || "").slice(0, 7);
    const i = idx.get(month);
    if (i === undefined) continue;

    const acctField = (r.account_name || "").trim();
    const acctMatch = acctField.match(/^(\d{4}-\d{3,4}(-\d{2,3})?)/);
    if (!acctMatch) continue;
    let account = acctMatch[1];
    account = account.replace(/-0+$/, "");
    const prefix = account.charAt(0);

    const propertyName = r.property_name || "";
    const section = classifyEntityByName(propertyName);
    if (section === "pv") continue; // PVSHM tracked via PV database

    const target = section === "big" ? big : section === "hotel" ? hotel : jrw;
    const pct = !joeView ? 1 : section === "jrw" ? getOwnership(propertyName) : section === "hotel" ? hotelPct : 1;

    const debit = parseFloat(r.debit || "0") || 0;
    const credit = parseFloat(r.credit || "0") || 0;

    if (prefix === "4" || prefix === "5") {
      // Contra-revenue accounts post as debits; 5756 inter-entity is excluded
      if (account.startsWith("5875") || account.startsWith("5873") || account.startsWith("5760")) {
        target[i].revenue -= (debit - credit) * pct;
      } else if (!account.startsWith("5756")) {
        target[i].revenue += (credit - debit) * pct;
      }
      if (section === "big" && account.startsWith("5820") && isJrwParty(r.party_name)) {
        mirrorBig[i] += credit - debit;
      }
    } else if (prefix === "6" || prefix === "7") {
      target[i].expenses += (debit - credit) * pct;
      if (
        section === "jrw" &&
        getPropertyConfig(propertyName).businessEntity === "jrw" &&
        (account.startsWith("6300") || account.startsWith("7301") || account.startsWith("7300"))
      ) {
        mirrorJrw[i] += debit - credit;
      }
    } else if (prefix === "8" && section === "jrw") {
      if (DEBT_SERVICE_PREFIXES.some((p) => account.startsWith(p))) {
        const isInterest = acctField.toLowerCase().includes("interest") || !acctField.toLowerCase().includes("principal");
        if (isInterest) {
          jrw[i].interestExpense = (jrw[i].interestExpense || 0) + (debit - credit) * pct;
        }
      }
    }
  }

  for (const pm of pvMonths) {
    const i = idx.get(pm.month);
    if (i === undefined) continue;
    pvshm[i].revenue = pm.income * pvPct;
    pvshm[i].expenses = pm.expenses * pvPct;
    pvshm[i].interestExpense = pm.interest * pvPct;
  }

  for (const series of [jrw, big, hotel, pvshm]) {
    for (const m of series) {
      m.revenue = Math.round(m.revenue);
      m.expenses = Math.round(m.expenses);
      m.netIncome = m.revenue - m.expenses;
      if (m.interestExpense !== undefined) m.interestExpense = Math.round(m.interestExpense);
    }
  }

  const mirror = months.map((month, i) => ({
    month,
    big5820: Math.round(mirrorBig[i]),
    jrwFee: Math.round(mirrorJrw[i]),
    variance: Math.round(mirrorBig[i] - mirrorJrw[i]),
  }));

  for (const m of mirror) {
    if (m.month < MIRROR_CHECK_FROM) continue;
    if (Math.abs(m.variance) > 500 && (m.big5820 !== 0 || m.jrwFee !== 0)) {
      console.warn(
        `[mirror-check] ${m.month}: BIG 5820 fee income (${m.big5820}) vs JRW mgmt-fee expense (${m.jrwFee}) variance ${m.variance} exceeds ±$500`
      );
    }
  }

  return { months, jrw, big, hotel, pvshm, mirror };
}
