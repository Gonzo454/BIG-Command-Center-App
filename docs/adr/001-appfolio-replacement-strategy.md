# ADR-001: AppFolio Replacement Strategy

**Status:** Proposed  
**Date:** 2026-05-27  
**Decision Makers:** Joe Wagner, Mike Wagner  

## Context

Blackdeer Investment Group (BIG) currently pays ~$2,000/month ($24,000/year) for AppFolio Max plan to manage its property portfolio (~400 units across multifamily, commercial, senior living, and hospitality). The question is whether we can eliminate this cost by building custom software.

### What We Already Built

This repo contains two components that already replace AppFolio's **read-side** (reporting and analytics):

**1. Email Monitor** (`monitor.js`)
- Automated daily check register analysis
- Top properties/vendors/GL accounts by spend
- Flagged items (Baker Tilly fees, legal, large utilities, CC payments, CapEx, franchise fees)
- Vendor drill-down by GL account
- GL account drill-down to individual transactions
- Runs on BlueSteel cron, delivers via email

**2. Executive Dashboard** (`dashboard/`)
- Next.js app deployed on Vercel
- Pulls live data from AppFolio Reports API v2
- Pages: Executive Overview, Properties, Financial Reports (Income Statement), Aged Receivables, Lease Expirations, Rent Roll, Vendors
- Property-level P&L drill-down
- Budget vs Actuals with variance analysis
- Cash Flow statement (Operating, Investing, Financing)
- Joe Agent (DeepSeek AI) for natural language financial queries
- PDF and XLSX export
- Date range picker, MTD/YTD filtering
- Recharts visualizations (profit gauge, bar charts)

### AppFolio Reports API v2 (Read-Only, Already Consumed)

The dashboard currently consumes these reports:
| Report | Used In |
|---|---|
| `account_totals` | Executive Dashboard, Property P&L |
| `income_statement` | Financial Reports, Property P&L, Budget |
| `check_register_detail` | Vendors, Monitor |
| `rent_roll` | Rent Roll, Lease Expirations |
| `aged_receivables_detail` | Aged Receivables |
| `budget` | Budget vs Actuals |
| `cash_flow` | Cash Flow Statement |

### What AppFolio Still Does (Write-Side)

These are the operational capabilities the dashboard does **not** replace:

| Capability | Description | Complexity |
|---|---|---|
| **GL Accounting / Journal Entries** | Double-entry bookkeeping, chart of accounts, journal entries, period close | High |
| **Accounts Payable / Bill Pay** | Enter bills, approve, cut checks or ACH payments to vendors | High |
| **Bank Reconciliation** | Match bank feeds to GL transactions, reconcile accounts | High |
| **Owner Distributions** | Calculate and distribute net income to property owners/entities | Medium |
| **Tenant Portal** | Online rent payment, maintenance requests, lease documents | Medium |
| **Online Rent Collection** | ACH/credit card rent payments, auto-pay, late fee automation | Medium |
| **Lease Management** | Lease creation, renewal tracking, rent escalations, move-in/move-out | Medium |
| **Maintenance Work Orders** | Create, assign, track, close maintenance requests | Low-Medium |
| **Vendor Management** | Vendor records, 1099 tracking, W-9 storage | Low |
| **Document Storage** | Lease files, invoices, receipts attached to transactions | Low |
| **Tax Reporting** | 1099 generation, tax package preparation | Medium |
| **CAM Reconciliation** | Common Area Maintenance charge-backs for commercial tenants | Medium |
| **Insurance Tracking** | Certificate of insurance management | Low |

### BIG's Actual Usage Pattern

Based on the financial data (229 transactions/month, $1M+ monthly disbursements):
- **Heavy use:** GL accounting, multi-property tracking, multi-entity financial consolidation, vendor payments, owner distributions, bank reconciliation
- **Moderate use:** Tenant portal, rent collection, lease management, maintenance
- **Light/unused:** AI Leasing Assistant, Leasing CRM, Student Housing, Affordable Housing compliance, Investment Management features

### Key External Integrations in AppFolio

- Bank feeds (automatic transaction import)
- ACH payment processing (tenant rent, vendor payments)
- Credit card payment processing
- 1099/tax reporting to IRS
- Screening services (credit/background checks)
- Insurance certificate tracking

## Decision Options

### Option A: Expand the Dashboard into a Full PMS

Add write-side capabilities directly to the existing `dashboard/` Next.js app, eventually replacing AppFolio entirely.

**Architecture:** Next.js + Vercel Postgres (or Supabase) + Stripe (ACH) + Plaid (bank feeds)

**Phased approach:**
1. **Phase 1 — Accounting Core** (the hardest part)
   - Chart of accounts management
   - Journal entries with double-entry validation
   - Bank reconciliation with Plaid bank feed integration
   - Accounts payable: bill entry, approval workflow, payment scheduling
   - Period close / lock
   
2. **Phase 2 — Operations**
   - Tenant/lease management (CRUD, rent rolls, escalations)
   - Online rent collection via Stripe ACH ($0.80/txn, capped at $5)
   - Maintenance work orders
   - Owner distribution calculations and payment
   
3. **Phase 3 — Compliance & Reporting**
   - 1099 generation
   - Tax package preparation
   - CAM reconciliation
   - Document storage/attachment

**Pros:**
- Single codebase, no vendor dependency
- Full control over UX — hyper-customized for BIG
- Dashboard already has the read-side; adding write-side is additive
- Joe Agent can operate on local data with full context
- $0 software licensing after build (just Vercel + Stripe/Plaid SaaS fees)

**Cons:**
- Accounting engine is the riskiest part — errors = real financial liability
- Bank reconciliation and payment processing are regulated
- No existing user base / battle-tested edge cases
- Ongoing maintenance burden for compliance changes

**Estimated ongoing cost:** ~$500-1,000/month (Vercel Pro $20, Plaid ~$500, Stripe per-txn, Supabase ~$25)

### Option B: Build a Separate Property Management App

New standalone app (separate repo) purpose-built as a PMS, with the dashboard as a consumer.

**Pros:**
- Clean separation of concerns
- PMS can serve multiple clients eventually
- Dashboard stays lightweight (read-only)

**Cons:**
- Two codebases to maintain
- Need to build data sync between them
- More infrastructure to manage
- Probably overkill for a single-company tool

### Option C: Cheaper PMS + Keep the Dashboard

Migrate from AppFolio to a cheaper PMS (Rent Manager, Buildium, or TenantCloud) and keep our custom dashboard for analytics.

| PMS | Estimated Cost | Notes |
|---|---|---|
| Rent Manager | $400-800/month | Strong accounting, on-prem option available |
| Buildium | $300-600/month | Good for residential, weaker on commercial |
| TenantCloud | $200-400/month | Budget option, less feature-rich |

**Pros:**
- Fastest path to savings ($1,200-1,600/month saved immediately)
- Get a battle-tested accounting engine without building one
- Dashboard continues to work (just point API at new PMS's data)

**Cons:**
- Still vendor-dependent
- Migration pain (data export/import)
- Dashboard API layer needs rewrite for new PMS's API
- May lose features BIG currently uses
- New PMS may not have an API as good as AppFolio's

### Option D: Hybrid — Dashboard Absorbs Key Features Over Time

Keep AppFolio for now but systematically move capabilities into our dashboard. As each feature reaches parity, reduce AppFolio usage. Eventually downgrade or cancel.

**Phase 1:** Bill approval workflow in dashboard (approve bills → AppFolio executes payment)
**Phase 2:** Lease/tenant management in dashboard (AppFolio becomes just the payment processor)
**Phase 3:** Add Stripe ACH for rent collection, Plaid for bank feeds → cancel AppFolio

**Pros:**
- Lowest risk — always have AppFolio as fallback
- Incremental investment
- Can stop at any phase if ROI doesn't justify continuing

**Cons:**
- Slowest path to cost elimination
- Running two systems in parallel during transition
- Still paying AppFolio during the entire build

## Factors to Consider

1. **Accounting accuracy is non-negotiable.** A bug in GL accounting or bank reconciliation has real financial consequences. AppFolio has been doing this for thousands of customers.

2. **Build speed with AI assistance.** Mike uses AI (Devin, Claude) for programming, which dramatically reduces development time and cost compared to traditional estimates.

3. **BIG's portfolio is mixed-use.** Multifamily, commercial, senior living, hospitality — each has different requirements (CAM reconciliation, assisted living billing, hotel revenue management).

4. **AppFolio Stack API exists.** BIG has Max plan access which includes the Stack API (read/write). This means the dashboard could potentially write back to AppFolio (create bills, journal entries, etc.) as a transitional step before building our own storage.

5. **The dashboard is already deployed and working.** Any path forward should preserve it.

## Recommendation

**TBD — Awaiting decision from Joe and Mike Wagner.**

The key question is: **How much risk are we willing to take on the accounting engine?**

- If high risk tolerance + want full control → **Option A** (expand dashboard)
- If moderate risk tolerance + want savings now → **Option C** (cheaper PMS)
- If low risk tolerance + patient → **Option D** (hybrid incremental)
- If planning to scale to multiple clients → **Option B** (separate app)

## Appendix: AppFolio API Surface

### Reports API v2 (Read-Only) — Currently Used
- `account_totals`, `income_statement`, `check_register_detail`, `rent_roll`
- `aged_receivables_detail`, `budget`, `cash_flow`

### Stack API (Read/Write) — Available on Max Plan
- Properties: CRUD, units, owners
- Tenants: CRUD, leases, charges
- Bills: create, approve, pay
- Journal entries: create
- Bank deposits: create
- Vendor records: CRUD
- Documents: upload/attach
- Work orders: CRUD

Full Stack API reference: https://help.appfolio.com/s/article/Stack-API-Overview
