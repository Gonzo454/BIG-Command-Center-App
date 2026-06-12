import { NextRequest } from "next/server";
import {
  fetchReport,
  fetchPvReport,
  firstOfYear,
  firstOfMonth,
  firstOfQuarter,
  today,
  parseAmount,
  cachedJson,
} from "@/lib/appfolio";
import { classifyEntityByName } from "@/lib/appfolio-entities";
import { getOwnership } from "@/lib/ownership";
import { getPropertyConfig } from "@/lib/property-config";
import { buildPortfolioSeries, lastCompleteMonthEnd, type GLRow } from "@/lib/portfolio-series";

export const maxDuration = 60;

interface IncomeRow {
  account_name?: string;
  month_to_date?: string;
  year_to_date?: string;
}

interface ArRow {
  payer_name?: string;
  property_name?: string;
  amount_receivable?: string;
  "0_to30"?: string;
  "30_to60"?: string;
  "60_to90"?: string;
  "90_plus"?: string;
}

interface RentRollRow {
  property_name?: string;
  status?: string;
}

interface ReportPayload {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
  generatedAt: string;
}

const fmt = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString();

function resolveRange(period: string): { from: string; to: string; label: string } {
  const now = new Date();
  if (period === "prev_mo") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const from = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: lastCompleteMonthEnd(now), label: "Previous Month" };
  }
  if (period === "mtd") return { from: firstOfMonth(), to: today(), label: "MTD" };
  if (period === "qtd") return { from: firstOfQuarter(), to: today(), label: "QTD" };
  if (period === "ttm") {
    const first = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const from = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: lastCompleteMonthEnd(now), label: "Trailing 12 Months" };
  }
  return { from: firstOfYear(), to: today(), label: "YTD" };
}

interface EntityTotals {
  revenue: number;
  expenses: number;
}

/** Entity-scoped revenue/expense totals from main-database GL rows. */
function entityTotalsFromGL(glRows: GLRow[], joeView: boolean): Record<"jrw" | "big" | "hotel", EntityTotals> {
  const totals = {
    jrw: { revenue: 0, expenses: 0 },
    big: { revenue: 0, expenses: 0 },
    hotel: { revenue: 0, expenses: 0 },
  };
  const hotelPct = joeView ? getOwnership("Badger Hotel Group") : 1;
  for (const r of glRows) {
    const acctField = (r.account_name || "").trim();
    const acctMatch = acctField.match(/^(\d{4}-\d{3,4}(-\d{2,3})?)/);
    if (!acctMatch) continue;
    let account = acctMatch[1];
    account = account.replace(/-0+$/, "");
    const prefix = account.charAt(0);

    const propertyName = r.property_name || "";
    const section = classifyEntityByName(propertyName);
    if (section === "pv") continue;
    const pct = !joeView ? 1 : section === "jrw" ? getOwnership(propertyName) : section === "hotel" ? hotelPct : 1;

    const debit = parseFloat(r.debit || "0") || 0;
    const credit = parseFloat(r.credit || "0") || 0;

    if (prefix === "4" || prefix === "5") {
      if (account.startsWith("5875") || account.startsWith("5873") || account.startsWith("5760")) {
        totals[section].revenue -= (debit - credit) * pct;
      } else if (!account.startsWith("5756")) {
        totals[section].revenue += (credit - debit) * pct;
      }
    } else if (prefix === "6" || prefix === "7") {
      totals[section].expenses += (debit - credit) * pct;
    }
  }
  return totals;
}

async function pvTotalsForRange(from: string, to: string, joeView: boolean): Promise<EntityTotals> {
  if (from.slice(0, 4) !== to.slice(0, 4)) {
    // Cross-year range (e.g. TTM): AppFolio's year_to_date column only covers
    // one fiscal year, so split into per-calendar-year segments
    const [a, b] = await Promise.all([
      pvTotalsForRange(from, `${from.slice(0, 4)}-12-31`, joeView),
      pvTotalsForRange(`${to.slice(0, 4)}-01-01`, to, joeView),
    ]);
    return { revenue: a.revenue + b.revenue, expenses: a.expenses + b.expenses };
  }
  const pct = joeView ? getOwnership("Park Vista") : 1;
  try {
    const rows = await fetchPvReport<IncomeRow>("income_statement", {
      posted_on_from: from,
      posted_on_to: to,
    });
    let income = 0;
    let expenses = 0;
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    const ytdBased = from.endsWith("-01-01");
    for (const row of rows) {
      const name = (row.account_name || "").toLowerCase().trim();
      const amount = parseAmount(sameMonth ? row.month_to_date : row.year_to_date);
      if (name === "total income") income = amount;
      if (name === "total expense" || name === "total expenses") expenses = Math.abs(amount);
    }
    if (!sameMonth && !ytdBased) {
      // Multi-month window not aligned to fiscal year: approximate via
      // YTD subtraction using a baseline fetch
      const dayBefore = new Date(from + "T12:00:00Z");
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const beforeStr = dayBefore.toISOString().slice(0, 10);
      const baseRows = await fetchPvReport<IncomeRow>("income_statement", {
        posted_on_from: beforeStr.slice(0, 4) + "-01-01",
        posted_on_to: beforeStr,
      }).catch(() => [] as IncomeRow[]);
      let baseIncome = 0;
      let baseExpenses = 0;
      for (const row of baseRows) {
        const name = (row.account_name || "").toLowerCase().trim();
        const amount = parseAmount(row.year_to_date);
        if (name === "total income") baseIncome = amount;
        if (name === "total expense" || name === "total expenses") baseExpenses = Math.abs(amount);
      }
      if (from.slice(0, 4) === to.slice(0, 4)) {
        income -= baseIncome;
        expenses -= baseExpenses;
      }
    }
    return { revenue: income * pct, expenses: expenses * pct };
  } catch {
    return { revenue: 0, expenses: 0 };
  }
}

const viewLabel = (joeView: boolean) => (joeView ? "Joe's Share" : "Portfolio View");

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const report = params.get("report") || "consolidated_pnl";
    const period = params.get("period") || "ytd";
    const joeView = params.get("view") === "joe";
    const { from, to, label } = resolveRange(period);
    const generatedAt = new Date().toISOString();
    const subtitle = `${label} (${from} – ${to}) · ${viewLabel(joeView)} · Source: AppFolio GL as of ${today()}`;

    let payload: ReportPayload;

    if (report === "entity_comparison") {
      const [series, ytdGl, ytdPv] = await Promise.all([
        buildPortfolioSeries(12, joeView),
        fetchReport<GLRow>("general_ledger", { posted_on_from: firstOfYear(), posted_on_to: today() }),
        pvTotalsForRange(firstOfYear(), today(), joeView),
      ]);
      const sum = (arr: { revenue: number; expenses: number }[]) =>
        arr.reduce((a, m) => ({ revenue: a.revenue + m.revenue, expenses: a.expenses + m.expenses }), { revenue: 0, expenses: 0 });
      const ttm = {
        jrw: sum(series.jrw),
        big: sum(series.big),
        hotel: sum(series.hotel),
        pvshm: sum(series.pvshm),
      };
      const ytd = { ...entityTotalsFromGL(ytdGl, joeView), pvshm: ytdPv };
      const entities: ["jrw" | "big" | "hotel" | "pvshm", string][] = [
        ["jrw", "JRW Real Estate Holdings"],
        ["big", "Blackdeer I.G."],
        ["hotel", "Badger Hotel Group"],
        ["pvshm", "Park Vista SHM"],
      ];
      payload = {
        title: "Entity Comparison",
        subtitle,
        headers: ["Entity", "TTM Revenue", "TTM Expenses", "TTM Net", "TTM Margin", "YTD Revenue", "YTD Expenses", "YTD Net", "YTD Margin"],
        rows: entities.map(([key, name]) => {
          const t = ttm[key];
          const y = ytd[key];
          const tNet = t.revenue - t.expenses;
          const yNet = y.revenue - y.expenses;
          return [
            name,
            fmt(t.revenue),
            fmt(t.expenses),
            fmt(tNet),
            t.revenue > 0 ? `${Math.round((tNet / t.revenue) * 100)}%` : "—",
            fmt(y.revenue),
            fmt(y.expenses),
            fmt(yNet),
            y.revenue > 0 ? `${Math.round((yNet / y.revenue) * 100)}%` : "—",
          ];
        }),
        generatedAt,
      };
    } else if (report === "jrw_properties") {
      const [glRows, rentRows, arRows] = await Promise.all([
        fetchReport<GLRow>("general_ledger", { posted_on_from: from, posted_on_to: to }),
        fetchReport<RentRollRow>("rent_roll"),
        fetchReport<ArRow>("aged_receivables_detail", { as_of_date: to }),
      ]);
      const byProp = new Map<string, { revenue: number; expenses: number }>();
      for (const r of glRows) {
        const propertyName = (r.property_name || "").trim();
        if (!propertyName || classifyEntityByName(propertyName) !== "jrw") continue;
        if (getPropertyConfig(propertyName).archived) continue;
        const acctField = (r.account_name || "").trim();
        const acctMatch = acctField.match(/^(\d{4}-\d{3,4}(-\d{2,3})?)/);
        if (!acctMatch) continue;
        let account = acctMatch[1];
        account = account.replace(/-0+$/, "");
        const prefix = account.charAt(0);
        const debit = parseFloat(r.debit || "0") || 0;
        const credit = parseFloat(r.credit || "0") || 0;
        const entry = byProp.get(propertyName) || { revenue: 0, expenses: 0 };
        if (prefix === "4" || prefix === "5") {
          if (account.startsWith("5875") || account.startsWith("5873") || account.startsWith("5760")) {
            entry.revenue -= debit - credit;
          } else if (!account.startsWith("5756")) {
            entry.revenue += credit - debit;
          }
        } else if (prefix === "6" || prefix === "7") {
          entry.expenses += debit - credit;
        }
        byProp.set(propertyName, entry);
      }
      const occByProp = new Map<string, { total: number; occupied: number }>();
      for (const r of rentRows) {
        const prop = (r.property_name || "").trim();
        if (!prop) continue;
        const e = occByProp.get(prop) || { total: 0, occupied: 0 };
        e.total++;
        const s = (r.status || "").toLowerCase();
        if (s.includes("current") || s.includes("occupied")) e.occupied++;
        occByProp.set(prop, e);
      }
      const arByProp = new Map<string, number>();
      for (const r of arRows) {
        const prop = (r.property_name || "").trim();
        if (!prop) continue;
        arByProp.set(prop, (arByProp.get(prop) || 0) + parseAmount(r.amount_receivable));
      }
      const rows = Array.from(byProp.entries())
        .map(([name, t]) => {
          const pct = joeView ? getOwnership(name) : 1;
          const noi = (t.revenue - t.expenses) * pct;
          const occ = occByProp.get(name);
          return {
            name,
            noi,
            occ: occ && occ.total > 0 ? `${Math.round((occ.occupied / occ.total) * 100)}%` : "—",
            ar: arByProp.get(name) || 0,
          };
        })
        .sort((a, b) => b.noi - a.noi);
      payload = {
        title: "JRW Property Performance",
        subtitle,
        headers: ["Property", "NOI", "Occupancy", "Receivables"],
        rows: rows.map((r) => [r.name, fmt(r.noi), r.occ, fmt(r.ar)]),
        generatedAt,
      };
    } else if (report === "big_pnl") {
      const glRows = await fetchReport<GLRow>("general_ledger", { posted_on_from: from, posted_on_to: to });
      const streams: Record<string, number> = {
        "Management Fees (5820)": 0,
        "Maintenance Fees (5750)": 0,
        "Leasing Fees (5755)": 0,
        "Billbacks (5760)": 0,
        "Other Revenue": 0,
      };
      let overhead = 0;
      for (const r of glRows) {
        const propertyName = r.property_name || "";
        if (classifyEntityByName(propertyName) !== "big") continue;
        const acctField = (r.account_name || "").trim();
        const acctMatch = acctField.match(/^(\d{4}-\d{3,4}(-\d{2,3})?)/);
        if (!acctMatch) continue;
        let account = acctMatch[1];
        account = account.replace(/-0+$/, "");
        const prefix = account.charAt(0);
        const debit = parseFloat(r.debit || "0") || 0;
        const credit = parseFloat(r.credit || "0") || 0;
        if (prefix === "4" || prefix === "5") {
          const amount = credit - debit;
          if (account.startsWith("5820")) streams["Management Fees (5820)"] += amount;
          else if (account.startsWith("5750")) streams["Maintenance Fees (5750)"] += amount;
          else if (account.startsWith("5755")) streams["Leasing Fees (5755)"] += amount;
          else if (account.startsWith("5760")) streams["Billbacks (5760)"] -= debit - credit;
          else if (!account.startsWith("5756")) streams["Other Revenue"] += amount;
        } else if (prefix === "6" || prefix === "7") {
          overhead += debit - credit;
        }
      }
      const totalRevenue = Object.values(streams).reduce((a, b) => a + b, 0);
      payload = {
        title: "BIG Management P&L",
        subtitle,
        headers: ["Line Item", "Amount"],
        rows: [
          ...Object.entries(streams).map(([name, v]) => [name, fmt(v)] as (string | number)[]),
          ["Total Revenue", fmt(totalRevenue)],
          ["Overhead / Operating Expenses", fmt(-overhead)],
          ["Net Income", fmt(totalRevenue - overhead)],
        ],
        generatedAt,
      };
    } else if (report === "cash_distributions") {
      const glRows = await fetchReport<GLRow>("general_ledger", { posted_on_from: from, posted_on_to: to });
      const byAccount = new Map<string, { entity: string; amount: number }>();
      for (const r of glRows) {
        const propertyName = (r.property_name || "").trim();
        const acctField = (r.account_name || "").trim();
        const acctMatch = acctField.match(/^(3\d{3}-\d{4}(?:-\d{2})?)\s*-?\s*(.*)/);
        if (!acctMatch) continue;
        const debit = parseFloat(r.debit || "0") || 0;
        const credit = parseFloat(r.credit || "0") || 0;
        const net = credit - debit;
        if (net === 0) continue;
        const key = `${propertyName}|${acctMatch[2] || acctField}`;
        const existing = byAccount.get(key);
        if (existing) existing.amount += net;
        else byAccount.set(key, { entity: propertyName, amount: net });
      }
      const rows = Array.from(byAccount.entries())
        .map(([key, v]) => ({ entity: v.entity, account: key.split("|")[1], amount: v.amount }))
        .filter((r) => Math.round(r.amount) !== 0)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      payload = {
        title: "Cash Position & Distributions",
        subtitle,
        headers: ["Entity", "Capital Account", "Net Activity", "Type"],
        rows: [
          ...rows.map((r) => [
            r.entity,
            r.account,
            fmt(r.amount),
            r.amount >= 0 ? "Contribution" : "Distribution",
          ] as (string | number)[]),
          ["Station 955", "Note Receivable", "$1,300,000 @ 10%", "Interest accruing · payments start Aug 2027"],
        ],
        generatedAt,
      };
    } else if (report === "aged_receivables_combined") {
      const asOf = today();
      const [mainAr, pvAr] = await Promise.all([
        fetchReport<ArRow>("aged_receivables_detail", { as_of_date: asOf }),
        fetchPvReport<ArRow>("aged_receivables_detail", { as_of_date: asOf }).catch(() => [] as ArRow[]),
      ]);
      const rows = [...mainAr.map((r) => ({ r, src: "Main" })), ...pvAr.map((r) => ({ r, src: "Park Vista" }))]
        .map(({ r, src }) => ({
          tenant: r.payer_name || "Unknown",
          property: r.property_name || "",
          source: src,
          current: parseAmount(r["0_to30"]),
          d30: parseAmount(r["30_to60"]),
          d60: parseAmount(r["60_to90"]),
          d90: parseAmount(r["90_plus"]),
          total: parseAmount(r.amount_receivable),
        }))
        .filter((r) => Math.round(r.total) !== 0)
        .sort((a, b) => b.total - a.total);
      payload = {
        title: "Aged Receivables — Combined",
        subtitle: `As of ${asOf} · ${viewLabel(joeView)} · Source: AppFolio`,
        headers: ["Tenant", "Property", "Database", "0–30", "31–60", "61–90", "90+", "Total"],
        rows: rows.map((r) => [r.tenant, r.property, r.source, fmt(r.current), fmt(r.d30), fmt(r.d60), fmt(r.d90), fmt(r.total)]),
        generatedAt,
      };
    } else {
      // consolidated_pnl (default)
      const [glRows, pv] = await Promise.all([
        fetchReport<GLRow>("general_ledger", { posted_on_from: from, posted_on_to: to }),
        pvTotalsForRange(from, to, joeView),
      ]);
      const t = entityTotalsFromGL(glRows, joeView);
      const cols = [
        { name: "JRW Real Estate Holdings", ...t.jrw },
        { name: "Blackdeer I.G.", ...t.big },
        { name: "Badger Hotel Group", ...t.hotel },
        { name: "Park Vista SHM", ...pv },
      ];
      const combined = cols.reduce(
        (a, c) => ({ revenue: a.revenue + c.revenue, expenses: a.expenses + c.expenses }),
        { revenue: 0, expenses: 0 }
      );
      payload = {
        title: "Consolidated Owner P&L",
        subtitle,
        headers: ["Line Item", ...cols.map((c) => c.name), "Combined"],
        rows: [
          ["Revenue", ...cols.map((c) => fmt(c.revenue)), fmt(combined.revenue)],
          ["Expenses", ...cols.map((c) => fmt(-c.expenses)), fmt(-combined.expenses)],
          ["Owner Net Income", ...cols.map((c) => fmt(c.revenue - c.expenses)), fmt(combined.revenue - combined.expenses)],
        ],
        generatedAt,
      };
    }

    return cachedJson(payload);
  } catch (err) {
    console.error("Combined reports error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
