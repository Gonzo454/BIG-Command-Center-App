/**
 * General Ledger Parser — Entity-filtered financial data
 *
 * Parses the AppFolio GL export (xlsx) and filters transactions by the
 * Property column (entity). This is the only reliable way to separate
 * BIG / Hotel / JRW data because the same account numbers appear under
 * multiple entities.
 */
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

export interface GLTransaction {
  account: string; // e.g. "5820-0000"
  entity: string; // e.g. "Blackdeer Investment Group"
  debit: number;
  credit: number;
  date: number; // Excel serial date
  payee: string;
  description: string;
}

export type Section = "big" | "hotel" | "jrw";

// Entity classification — prefix match on the Property column
const BIG_ENTITIES = ["Blackdeer Investment Group"];
const HOTEL_ENTITIES = ["Badger Hotel Group"];
// Everything else defaults to JRW Portfolio

let cachedTransactions: GLTransaction[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getGLPath(): string {
  // Try multiple paths — Vercel serverless has different cwd than local dev
  const candidates = [
    path.join(process.cwd(), "data", "general_ledger.xlsx"),
    path.join(__dirname, "..", "..", "data", "general_ledger.xlsx"),
    path.join(__dirname, "..", "..", "..", "data", "general_ledger.xlsx"),
    path.resolve("data", "general_ledger.xlsx"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]; // will error with a clear message
}

export function parseGL(): GLTransaction[] {
  if (cachedTransactions && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedTransactions;
  }

  const filePath = getGLPath();
  if (!fs.existsSync(filePath)) {
    throw new Error(`GL file not found at ${filePath}`);
  }

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

  const transactions: GLTransaction[] = [];
  let currentAccount = "";

  for (let i = 12; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;

    const prop = String(row[0] || "");

    // Account section header: "NNNN-NNNN - Account Name" or "NNNN-NNNN-NN - ..."
    if (/^\d{4}-\d{4}/.test(prop)) {
      currentAccount = prop.split(" - ")[0].trim();
      // Normalize: remove trailing "-00" suffix if present
      if (currentAccount.endsWith("-00")) {
        currentAccount = currentAccount.slice(0, -3);
      }
      continue;
    }

    // Skip non-transaction rows
    if (
      !prop ||
      prop === "Starting Balance" ||
      prop === "Ending Balance" ||
      prop.startsWith("Total") ||
      prop.startsWith("Net Change")
    )
      continue;

    const debit = Number(row[5]) || 0;
    const credit = Number(row[6]) || 0;
    if (debit === 0 && credit === 0) continue;

    // Extract entity name (before address which starts with a number after " - ")
    let entity: string;
    const entityMatch = prop.match(/^(.+?)\s*-\s*\d/);
    if (entityMatch) {
      entity = entityMatch[1].trim();
    } else {
      entity = prop.split(" - ")[0].trim();
    }

    transactions.push({
      account: currentAccount,
      entity,
      debit,
      credit,
      date: Number(row[1]) || 0,
      payee: String(row[2] || ""),
      description: String(row[8] || ""),
    });
  }

  cachedTransactions = transactions;
  cacheTimestamp = Date.now();
  return transactions;
}

export function classifyEntity(entity: string): Section {
  if (BIG_ENTITIES.some((e) => entity.startsWith(e))) return "big";
  if (HOTEL_ENTITIES.some((e) => entity.startsWith(e))) return "hotel";
  return "jrw";
}

export interface EntityPnL {
  entity: string;
  section: Section;
  income: number;
  opex: number;
  deprecAmort: number;
  debtService: number;
  otherBelow: number; // 8xxx items that aren't debt service (8800 adjustments, 8702 taxes)
  gainOnSale: number;
}

/**
 * Compute P&L for each entity, optionally filtered by date range.
 * Dates are Excel serial numbers (days since 1900-01-01).
 */
export function computeEntityPnL(
  fromDate?: string,
  toDate?: string
): EntityPnL[] {
  const transactions = parseGL();

  // Convert ISO dates to Excel serial numbers for filtering
  const fromSerial = fromDate ? dateToSerial(fromDate) : 0;
  const toSerial = toDate ? dateToSerial(toDate) : 99999;

  const entityMap: Record<string, EntityPnL> = {};

  for (const t of transactions) {
    // Date filter
    if (t.date > 0 && (t.date < fromSerial || t.date > toSerial)) continue;

    if (!entityMap[t.entity]) {
      entityMap[t.entity] = {
        entity: t.entity,
        section: classifyEntity(t.entity),
        income: 0,
        opex: 0,
        deprecAmort: 0,
        debtService: 0,
        otherBelow: 0,
        gainOnSale: 0,
      };
    }

    const e = entityMap[t.entity];
    const acct = t.account;
    const prefix = acct.charAt(0);

    if (prefix === "4" || prefix === "5") {
      if (acct.startsWith("5756")) {
        e.gainOnSale += t.credit - t.debit;
      } else if (acct.startsWith("5875") || acct.startsWith("5873")) {
        // Hotel labor (5875) and merchant fees (5873) are operating expenses
        // despite being in the 5xxx range — they're costs, not revenue
        e.opex += t.debit - t.credit;
      } else {
        e.income += t.credit - t.debit;
      }
    } else if (prefix === "6" || prefix === "7") {
      if (acct.startsWith("6600") || acct.startsWith("6650")) {
        e.deprecAmort += t.debit - t.credit;
      } else {
        e.opex += t.debit - t.credit;
      }
    } else if (prefix === "8") {
      // Per spec: debt service = 8510 + 8520 + 8525 only (mortgage interest)
      // 8800 (Other Misc Adjustments), 8702 (tax expense) are below-the-line
      if (acct.startsWith("8510") || acct.startsWith("8520") || acct.startsWith("8525")) {
        e.debtService += t.debit - t.credit;
      } else {
        e.otherBelow += t.debit - t.credit;
      }
    }
  }

  return Object.values(entityMap);
}

/**
 * Aggregate P&L by section (big/hotel/jrw).
 */
export function computeSectionPnL(fromDate?: string, toDate?: string) {
  const entities = computeEntityPnL(fromDate, toDate);

  const sections: Record<Section, {
    income: number;
    opex: number;
    deprecAmort: number;
    debtService: number;
    otherBelow: number;
    gainOnSale: number;
    noi: number;
    netIncome: number;
  }> = {
    jrw: { income: 0, opex: 0, deprecAmort: 0, debtService: 0, otherBelow: 0, gainOnSale: 0, noi: 0, netIncome: 0 },
    big: { income: 0, opex: 0, deprecAmort: 0, debtService: 0, otherBelow: 0, gainOnSale: 0, noi: 0, netIncome: 0 },
    hotel: { income: 0, opex: 0, deprecAmort: 0, debtService: 0, otherBelow: 0, gainOnSale: 0, noi: 0, netIncome: 0 },
  };

  for (const e of entities) {
    const s = sections[e.section];
    s.income += e.income;
    s.opex += e.opex;
    s.deprecAmort += e.deprecAmort;
    s.debtService += e.debtService;
    s.otherBelow += e.otherBelow;
    s.gainOnSale += e.gainOnSale;
  }

  for (const s of Object.values(sections)) {
    s.noi = s.income - s.opex;
    s.netIncome = s.noi - s.deprecAmort - s.debtService - s.otherBelow + s.gainOnSale;
  }

  return sections;
}

/**
 * Compute monthly trend data by section.
 */
export function computeMonthlyTrend(year: number) {
  const transactions = parseGL();
  const currentMonth = new Date().getMonth(); // 0-indexed

  const months: { jrw: number; big: number; hotel: number }[] = [];

  for (let m = 0; m <= currentMonth; m++) {
    const fromSerial = dateToSerial(`${year}-${String(m + 1).padStart(2, "0")}-01`);
    const lastDay = new Date(year, m + 1, 0).getDate();
    const toSerial = dateToSerial(`${year}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);

    const monthData = { jrw: 0, big: 0, hotel: 0 };

    for (const t of transactions) {
      if (t.date < fromSerial || t.date > toSerial) continue;

      const section = classifyEntity(t.entity);
      const prefix = t.account.charAt(0);

      if (prefix === "4" || prefix === "5") {
        if (t.account.startsWith("5875") || t.account.startsWith("5873")) {
          // Hotel labor + merchant fees are expenses
          const amount = t.debit - t.credit;
          if (section === "jrw") monthData.jrw -= amount;
          else if (section === "big") monthData.big -= amount;
          else monthData.hotel -= amount;
        } else if (!t.account.startsWith("5756")) {
          // Income for the section
          const amount = t.credit - t.debit;
          if (section === "jrw") monthData.jrw += amount;
          else if (section === "big") monthData.big += amount;
          else monthData.hotel += amount;
        }
      } else if (prefix === "6" || prefix === "7") {
        // Expense reduces NOI/net
        const amount = t.debit - t.credit;
        if (section === "jrw") monthData.jrw -= amount;
        else if (section === "big") monthData.big -= amount;
        else monthData.hotel -= amount;
      }
    }

    months.push(monthData);
  }

  return months;
}

/**
 * Get per-account breakdown for a given section (big/hotel/jrw).
 * Returns revenue and expense accounts with amounts, for detail pages.
 */
export function computeAccountBreakdown(
  section: Section,
  fromDate?: string,
  toDate?: string
): { revenue: { account: string; name: string; amount: number }[]; expenses: { account: string; name: string; amount: number }[] } {
  const transactions = parseGL();
  const fromSerial = fromDate ? dateToSerial(fromDate) : 0;
  const toSerial = toDate ? dateToSerial(toDate) : 99999;

  const revenueMap: Record<string, number> = {};
  const expenseMap: Record<string, number> = {};

  // Build account name lookup from GL headers
  const accountNames: Record<string, string> = {};
  const filePath = getGLPath();
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;
    const prop = String(row[0] || "");
    if (/^\d{4}-\d{4}/.test(prop)) {
      const parts = prop.split(" - ");
      let acctNum = parts[0].trim();
      if (acctNum.endsWith("-00")) acctNum = acctNum.slice(0, -3);
      accountNames[acctNum] = parts.slice(1).join(" - ").trim() || acctNum;
    }
  }

  for (const t of transactions) {
    if (t.date > 0 && (t.date < fromSerial || t.date > toSerial)) continue;
    if (classifyEntity(t.entity) !== section) continue;

    const prefix = t.account.charAt(0);
    if (prefix === "4" || prefix === "5") {
      if (t.account.startsWith("5756")) {
        // gain on sale — skip
      } else if (t.account.startsWith("5875") || t.account.startsWith("5873")) {
        // Hotel labor + merchant fees → expense
        expenseMap[t.account] = (expenseMap[t.account] || 0) + (t.debit - t.credit);
      } else {
        revenueMap[t.account] = (revenueMap[t.account] || 0) + (t.credit - t.debit);
      }
    } else if (prefix === "6" || prefix === "7") {
      if (!t.account.startsWith("6600") && !t.account.startsWith("6650")) {
        expenseMap[t.account] = (expenseMap[t.account] || 0) + (t.debit - t.credit);
      }
    }
  }

  const revenue = Object.entries(revenueMap)
    .filter(([, amount]) => amount !== 0)
    .map(([account, amount]) => ({ account, name: accountNames[account] || account, amount }))
    .sort((a, b) => b.amount - a.amount);

  const expenses = Object.entries(expenseMap)
    .filter(([, amount]) => amount !== 0)
    .map(([account, amount]) => ({ account, name: accountNames[account] || account, amount }))
    .sort((a, b) => b.amount - a.amount);

  return { revenue, expenses };
}

/**
 * Check if a payer name matches any known GL entity (internal portfolio).
 * Uses exact match, substring containment, and significant-word overlap.
 */
function isInternalPayer(payee: string, entityNames: Set<string>): boolean {
  if (!payee || payee.trim().length === 0) return true; // blank = reversals/adjustments
  const p = payee.toLowerCase().trim();

  for (const entity of entityNames) {
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

/**
 * Fee reconciliation — BIG-managed entities only.
 *
 * Compares BIG's management/asset-fee income (5820) from payers that match
 * a GL entity against the matching expense (6300 + 7301 + 7300) booked by
 * those JRW/Hotel entities. Payers without a GL entity (Metro Crossing,
 * Station 955, GC Real Estate) are Joe's properties managed by an outside
 * MN company — their 5820 amounts are billback reimbursements, not earned
 * management fees, and are excluded so the gap is a real integrity signal.
 */
export function computeFeeReconciliation(fromDate?: string, toDate?: string) {
  const transactions = parseGL();
  const fromSerial = fromDate ? dateToSerial(fromDate) : 0;
  const toSerial = toDate ? dateToSerial(toDate) : 99999;

  // Build set of all non-BIG entity names (the internal portfolio)
  const internalEntities = new Set<string>();
  for (const t of transactions) {
    if (classifyEntity(t.entity) !== "big") {
      internalEntities.add(t.entity);
    }
  }

  // BIG fee income (5820), split by internal vs external payer
  let internalFeeIncome = 0;
  let externalFeeIncome = 0;
  const externalPayerMap: Record<string, number> = {};

  for (const t of transactions) {
    if (t.date > 0 && (t.date < fromSerial || t.date > toSerial)) continue;
    if (classifyEntity(t.entity) !== "big") continue;
    if (!t.account.startsWith("5820")) continue;

    const amount = t.credit - t.debit;
    if (isInternalPayer(t.payee, internalEntities)) {
      internalFeeIncome += amount;
    } else {
      externalFeeIncome += amount;
      const key = t.payee || "(unattributed)";
      externalPayerMap[key] = (externalPayerMap[key] || 0) + amount;
    }
  }

  // Internal entity fee expense (6300 + 7301 + 7300 from JRW + Hotel)
  let internalFeeExpense = 0;
  for (const t of transactions) {
    if (t.date > 0 && (t.date < fromSerial || t.date > toSerial)) continue;
    if (classifyEntity(t.entity) === "big") continue;
    if (
      t.account.startsWith("6300") ||
      t.account.startsWith("7301") ||
      t.account.startsWith("7300")
    ) {
      internalFeeExpense += t.debit - t.credit;
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

export function dateToSerial(isoDate: string): number {
  const d = new Date(isoDate + "T00:00:00Z");
  // Excel serial: days since 1899-12-30
  const epoch = new Date("1899-12-30T00:00:00Z").getTime();
  return Math.floor((d.getTime() - epoch) / 86400000);
}
