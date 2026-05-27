# ADR-001: AppFolio Replacement — Functional Specification

**Status:** Proposed  
**Date:** 2026-05-21  
**Decision Makers:** Joe Wagner, Mike Wagner  
**Goal:** Eliminate AppFolio ($2,000/month) by building a custom property management system tailored to BIG's operations.

---

## BIG's Portfolio

- ~400 managed units across multifamily, commercial, senior living, and hospitality
- Multi-entity structure (multiple LLCs under Blackdeer Investment Group Inc.)
- 229 transactions/month, $1M+ monthly disbursements
- Key properties: Honey Creek II, Badger Hotel (Comfort Suites), Station 955, Rincon 225, Park Vista Senior Living, Legacy at DeForest, Greywolf Industrial I & II
- Current bookkeeper: VRSapients Cloud Accounting Services ($640/month) — being replaced by Metify
- Tax prep: Baker Tilly (across nearly every entity)
- Database subdomain: `blackdeerig.appfolio.com`

---

## What Already Exists (Done)

### Email Monitor (`monitor.js`)
Runs daily on BlueSteel cron. Pulls check register from AppFolio Reports API v2, analyzes it, emails an HTML summary.

| Capability | Status |
|---|---|
| Total disbursements MTD | Done |
| Top 10 properties by spend | Done |
| Top 10 vendors by spend | Done |
| Vendor drill-down by GL account | Done |
| GL account drill-down to individual transactions | Done |
| Flagging engine (Baker Tilly, legal, large utilities, CC statements, CapEx, franchise fees) | Done |
| CC statement dedup | Done |

### Executive Dashboard (`dashboard/`)
Next.js app on Vercel. Pulls live data from AppFolio Reports API v2.

| Page / Feature | AppFolio Report Consumed | Status |
|---|---|---|
| Executive Overview (KPI cards, charts) | `account_totals`, `check_register_detail` | Done |
| Properties list | `account_totals` | Done |
| Property-level P&L drill-down | `income_statement` (property-filtered) | Done |
| Financial Reports (Income Statement) | `income_statement` | Done |
| Cash Flow (Operating/Investing/Financing) | `cash_flow` | Done |
| Budget vs Actuals with variance | `budget`, `income_statement` | Done |
| Aged Receivables (aging buckets) | `aged_receivables_detail` | Done |
| Rent Roll | `rent_roll` | Done |
| Lease Expirations | `rent_roll` (derived) | Done |
| Vendors (disbursements) | `check_register_detail` | Done |
| Joe Agent (DeepSeek AI chat) | All of the above via tool calls | Done |
| PDF / XLSX export | N/A (client-side) | Done |
| Date range picker, MTD/YTD toggle | N/A | Done |
| Recharts visualizations (profit gauge, bars) | N/A | Done |

### AppFolio API Access
| API | Access Level | Credentials |
|---|---|---|
| Reports API v2 (read-only) | Active, working | Client ID: `743a62f1a9f979ccd708aa1c8e5f4a6c` |
| Stack API (read/write) | Partner application submitted, pending approval | Not yet issued |

---

## What AppFolio Still Does — Feature-by-Feature Replacement Spec

Each section below describes: (1) what AppFolio does today for BIG, (2) how to replicate it, and (3) how to improve on it.

---

### 1. Chart of Accounts & General Ledger

**What AppFolio does:**
- Maintains BIG's full chart of accounts (GL account numbers + names)
- Tracks balances per GL account, per property, per entity
- Supports account types: Asset, Liability, Equity, Income (4xxx-5xxx), Expense (6xxx+)
- Multi-property allocation — a single transaction can hit multiple properties
- Multi-entity — each LLC has its own set of books; can consolidate across entities
- Period close — locks accounting periods to prevent backdated entries

**How BIG uses it:**
- 10+ GL categories actively used (Management Fees, Wages, Software & Licenses, Legal, Utilities, Tenant Improvements, Franchise Fees, etc.)
- GL codes visible in every check register transaction
- Income vs Expense classification drives all P&L reporting

**How to replicate:**
- Database tables: `gl_accounts` (number, name, type, parent, active), `gl_entries` (debit/credit, amount, account, property, entity, date, memo, source_doc)
- Every financial transaction creates balanced double-entry GL entries (debits = credits)
- Period close via a `closed_periods` table that prevents new entries before a cutoff date
- Multi-property: every GL entry has a `property_id` foreign key
- Multi-entity: every GL entry has an `entity_id` foreign key; consolidation reports aggregate across entities

**How to improve:**
- Real-time consolidated view across all entities (AppFolio makes you switch between entity databases)
- AI-powered GL coding suggestions based on vendor + description patterns
- Automated reclassification alerts when entries look miscoded

---

### 2. Accounts Payable / Bill Management

**What AppFolio does:**
- Enter bills with vendor, amount, GL account, property allocation, due date, invoice number
- Multi-line bills — split across GL accounts and/or properties
- Approval workflow — bills can require approval before payment
- Pay bills via check, ACH, or credit card
- Recurring bill templates
- Bill attachments (invoice PDFs)

**How BIG uses it:**
- Heavy use — 229 disbursements/month
- Major vendors: Baker Tilly (tax prep, multi-entity), VRSapients (bookkeeping), utilities, contractors
- Blackdeer Investment Group Inc. is #1 vendor at $615k/month (management fees, wages, owner distributions)
- LRBK Visa credit card statement payments with multiple line items

**How to replicate:**
- Database tables: `bills` (vendor, invoice_number, due_date, status, total, property, entity), `bill_lines` (gl_account, amount, property, description), `bill_approvals` (approver, status, timestamp)
- Bill entry form with multi-line GL coding
- Status workflow: Draft → Pending Approval → Approved → Scheduled → Paid
- Recurring bill templates with auto-generation
- File attachments stored in S3/Vercel Blob

**How to improve:**
- OCR invoice scanning — upload a PDF, AI extracts vendor/amount/GL code/due date automatically
- Duplicate bill detection (same vendor + amount + date range)
- Vendor-specific GL coding defaults (Baker Tilly always hits "Professional Services", etc.)
- Batch approval — approve multiple bills at once
- Mobile-friendly approval workflow

---

### 3. Payment Processing (Vendor Payments)

**What AppFolio does:**
- Cut physical checks (print from AppFolio or use check stock)
- ACH vendor payments (direct deposit to vendor bank accounts)
- Credit card payments tracked (LRBK Visa)
- Payment-to-bill matching (marks bills as paid)
- Void/reissue checks

**How BIG uses it:**
- Lake Ridge Bank checking accounts for disbursements
- Lake Ridge Bank Visa for operational expenses
- $1M+ monthly outflow across ~229 transactions

**How to replicate:**
- **ACH vendor payments**: Stripe Treasury or Increase.com API — initiate ACH debits from BIG's bank account to vendor bank accounts. Cost: ~$0.50-1.00/transaction
- **Check printing**: Generate check PDFs with MICR encoding for local printing, or use a check fulfillment service (Checkbook.io, Lob) for mailed checks. Cost: ~$1.50/check
- **Credit card tracking**: Manual entry or Plaid connection to pull CC transactions automatically
- Payment records auto-create GL entries (debit AP/expense, credit cash)

**How to improve:**
- Automated payment scheduling — bills due within X days auto-queue for batch payment
- Real-time payment status tracking (ACH sent → settled)
- Smart payment method selection (ACH for large amounts, CC for points/rewards)
- Vendor self-service portal where vendors submit invoices directly

---

### 4. Bank Reconciliation

**What AppFolio does:**
- Connects to bank via bank feeds (automatic transaction import)
- Shows unreconciled transactions side-by-side with GL entries
- Match bank transactions to GL entries (1:1 or 1:many)
- Track reconciliation status per bank account per period
- Supports multiple bank accounts (checking, savings, Visa)

**How BIG uses it:**
- Lake Ridge Bank checking account(s)
- Lake Ridge Bank Visa credit card
- Monthly reconciliation (likely performed by VRSapients, soon by Metify)

**How to replicate:**
- **Bank feeds**: Plaid API — connect BIG's bank accounts, pull transactions daily. Cost: ~$500/month for Plaid
- Database tables: `bank_transactions` (from Plaid), `reconciliation_matches` (bank_txn_id ↔ gl_entry_id), `reconciliation_sessions` (account, period, status, reconciled_by)
- Reconciliation UI: two-column view — bank transactions on left, GL entries on right, drag to match or auto-match by amount+date
- Status: Unreconciled → Matched → Reconciled; period locked when balanced

**How to improve:**
- AI-powered auto-matching — match by amount, date proximity, vendor name fuzzy match. AppFolio does basic matching; we can do smarter
- Real-time bank balance display (Plaid balance API)
- Anomaly detection — flag bank transactions with no corresponding GL entry
- Automatic creation of GL entries for bank fees, interest, etc.

---

### 5. Online Rent Collection

**What AppFolio does:**
- Tenant portal for online payment (ACH, credit card, debit card)
- Auto-pay enrollment
- Late fee automation (charge late fees X days after due date)
- Payment reminders
- Payment receipts
- Returned payment (NSF) handling
- Rent ledger per unit

**How BIG uses it:**
- ~400 units paying rent monthly
- Mix of residential (Station 955, Rincon 225), senior living (Park Vista, Legacy at DeForest), hospitality (Badger Hotel)

**How to replicate:**
- **ACH rent payments**: Stripe ACH — $0.80/transaction, capped at $5. For 400 units = ~$320-2,000/month max
- **Credit/debit card payments**: Stripe — 2.9% + $0.30 per transaction (tenants typically absorb this fee)
- **Auto-pay**: Stripe subscriptions or scheduled payments with stored payment methods
- Database tables: `rent_charges` (unit, amount, due_date, period), `rent_payments` (tenant, amount, method, stripe_payment_id, status), `late_fees` (auto-generated based on rules)
- Late fee engine: configurable rules per property/lease (grace period, flat fee vs % of rent, max fee)
- NSF handling: Stripe webhooks for failed payments → auto-create NSF charge + notify tenant

**How to improve:**
- Multi-channel payment reminders (SMS + email, not just email)
- Tenant payment history dashboard with trends
- Predictive delinquency — flag tenants likely to be late based on payment history patterns
- Flexible payment plans for tenants in hardship (split rent, deferred payments)
- Direct integration with collections workflow (auto-escalate after X days)

---

### 6. Tenant & Lease Management

**What AppFolio does:**
- Tenant records (contact info, SSN, employment, emergency contacts, vehicles)
- Lease creation and storage (move-in, move-out, terms, rent amount, security deposit)
- Lease renewal tracking and rent escalation schedules
- Move-in/move-out workflows (charges, inspections, deposit return)
- Tenant screening (credit, criminal, eviction history)
- Occupancy tracking per unit

**How BIG uses it:**
- Mixed portfolio: multifamily leases (12-month), senior living agreements, hotel bookings
- Rent roll shows: property, unit, tenant, status, market rent, actual rent, lease end date, past due balance

**How to replicate:**
- Database tables: `tenants` (name, contact, ssn_encrypted, status), `leases` (tenant, unit, start_date, end_date, monthly_rent, security_deposit, terms), `units` (property, number, type, sqft, market_rent, status)
- Lease lifecycle: Application → Approved → Active → Expiring → Renewed/Vacated
- Rent escalation scheduler — define annual increases, auto-update rent charges
- Move-in/move-out checklist with inspection photos
- Security deposit tracking (escrow accounting, state-specific return deadlines)

**How to improve:**
- Automated lease renewal offers — generate renewal letters with proposed new rent 90/60/30 days before expiration
- Digital lease signing (DocuSign API — ~$25-50/month)
- Lease comparison view — current vs proposed terms side by side
- Portfolio-wide lease expiration calendar with rent-at-risk calculations (already partially done in dashboard)
- Tenant communication log — track all emails, calls, letters in one place

---

### 7. Maintenance / Work Orders

**What AppFolio does:**
- Tenant-submitted maintenance requests (via portal or phone)
- Work order creation, assignment to vendor/staff, priority, status tracking
- Photo attachments
- Vendor dispatch and scheduling
- Cost tracking per work order (labor + materials)
- Work order history per unit

**How BIG uses it:**
- Residential properties need ongoing maintenance
- Senior living facilities have higher maintenance frequency
- Hospitality (Badger Hotel) has room maintenance requirements

**How to replicate:**
- Database tables: `work_orders` (unit, category, description, priority, status, assigned_to, reported_by, created_at), `work_order_notes` (text, photos, author, timestamp), `work_order_costs` (vendor, amount, gl_account)
- Status workflow: Submitted → Assigned → In Progress → Completed → Closed
- Tenant-facing form for submissions (property, unit, category, description, photos)
- Vendor notification when assigned (email/SMS)
- Cost roll-up to property P&L via GL entries

**How to improve:**
- AI triage — categorize and prioritize based on description keywords ("water leak" = emergency, "squeaky door" = low priority)
- Photo-based damage assessment
- Preventive maintenance scheduler (HVAC filters every 90 days, etc.)
- Vendor performance scoring (response time, completion rate, cost)
- Real-time status updates to tenant via SMS

---

### 8. Owner Distributions

**What AppFolio does:**
- Calculate net income per property/entity
- Determine owner share based on ownership percentages
- Generate distribution checks or ACH payments to owners
- Owner statements showing income, expenses, net, and distribution amount
- Withholding for reserves

**How BIG uses it:**
- Blackdeer Investment Group Inc. is the #1 vendor at $615k — management fees, wages, and owner distributions flowing back to the parent entity
- Multiple entities with potentially different ownership structures

**How to replicate:**
- Database tables: `ownership` (entity, owner, percentage), `distributions` (entity, period, gross_income, expenses, net, reserve_hold, distributed_amount, payment_method), `distribution_lines` (distribution, owner, share_pct, amount, payment_status)
- Calculation engine: Pull P&L for entity for period → apply management fee % → calculate net → apply ownership splits → deduct reserves → generate payment
- Owner statement PDF generator (property performance summary + distribution detail)
- ACH distribution payments via Stripe/Increase

**How to improve:**
- Real-time owner dashboard — owners can see live property performance, not just monthly statements
- Waterfall distribution modeling — support preferred returns, catch-up provisions, profit splits for different investor classes
- Distribution forecast — project future distributions based on current run rate
- Tax document generation (K-1 support data, not the K-1 itself — that's Baker Tilly's job)

---

### 9. Financial Reporting

**What AppFolio does:**
- Income Statement (P&L) by property, entity, portfolio-wide, custom date range
- Balance Sheet
- Cash Flow Statement (Operating, Investing, Financing)
- Budget vs Actuals with variance
- Check Register Detail
- Aged Receivables (0-30, 31-60, 61-90, 90+ day buckets)
- Rent Roll
- Account Totals
- 1099 reports
- Custom report builder

**How BIG uses it:**
- All of the above are consumed by the dashboard via Reports API v2
- Baker Tilly needs clean financials for tax prep across all entities

**How to replicate:**
- The dashboard already replicates most of the read-side reporting
- With our own GL data, reports pull from local database instead of AppFolio API
- Add: Balance Sheet (not yet in dashboard), Trial Balance, General Ledger detail
- Add: 1099 report generation (aggregate vendor payments for year, generate 1099-NEC/MISC forms)
- Tax package export — zip of P&L, Balance Sheet, and GL detail per entity for Baker Tilly

**How to improve:**
- Joe Agent already allows natural language queries across all financial data
- Comparative reporting — this month vs last month, this year vs last year, property vs property
- Customizable report templates — save report configurations for repeat use
- Automated monthly reporting package — auto-generate and email owner statements + financial summaries
- Real-time data (no 5-minute cache delay like current AppFolio API setup)

---

### 10. Vendor Management

**What AppFolio does:**
- Vendor directory (name, address, contact, bank info for ACH)
- 1099 eligibility flag and W-9 storage
- Payment history per vendor
- Vendor insurance certificate tracking (COI)
- Vendor categories

**How BIG uses it:**
- Dozens of vendors across all properties
- Major recurring vendors: Baker Tilly, utilities (WE Energies, WPS), insurance, contractors
- 1099 generation needed annually

**How to replicate:**
- Database tables: `vendors` (name, address, contact, tax_id, is_1099_eligible, payment_method, bank_info_encrypted), `vendor_documents` (vendor, type, file_url, expiry_date), `vendor_categories` (name)
- W-9 and COI document upload with expiry date tracking
- Payment history derived from bills/payments data

**How to improve:**
- Insurance certificate expiration alerts — notify when COI expires, auto-email vendor for renewal
- Vendor portal — vendors submit invoices, update their info, download 1099s
- Vendor spend analytics (already partially in dashboard) — trends over time, budget vs actual by vendor category
- Preferred vendor list by category and property

---

### 11. Document Storage

**What AppFolio does:**
- Attach documents to transactions, tenants, properties, vendors, work orders
- Lease document storage
- Invoice/receipt storage
- Search and retrieve

**How to replicate:**
- S3-compatible blob storage (Vercel Blob, AWS S3, or Cloudflare R2)
- Database: `documents` (parent_type, parent_id, filename, url, uploaded_by, uploaded_at, tags)
- Attach files to any entity: tenant, lease, bill, vendor, property, work order
- Full-text search via document metadata/tags

**How to improve:**
- OCR + AI extraction — upload a document, auto-extract key data (amounts, dates, parties)
- Document templates — generate leases, notices, letters from templates with auto-filled data
- Audit trail — who uploaded what, when, immutable log

---

### 12. Tenant Portal

**What AppFolio does:**
- Tenant login
- View lease details and documents
- Make rent payments
- Submit maintenance requests
- View payment history
- View balance/ledger

**How to replicate:**
- Separate tenant-facing web app (or section of the main app with role-based access)
- Auth: email/password or magic link
- Dashboard showing: current balance, next payment due, lease summary
- Payment integration (Stripe)
- Maintenance request form
- Payment history and receipt downloads

**How to improve:**
- Modern mobile-first UI (AppFolio's tenant portal is dated)
- SMS notifications for rent due, payment received, maintenance updates
- In-app messaging with property management team
- Document upload for tenant (renter's insurance, move-in photos)

---

### 13. CAM Reconciliation (Commercial)

**What AppFolio does:**
- Common Area Maintenance expense tracking for commercial tenants
- CAM charge calculation per tenant based on square footage pro-rata
- Year-end reconciliation (actual vs estimated CAM charges)
- Generate CAM reconciliation statements

**How BIG uses it:**
- Greywolf Industrial I & II (commercial/industrial properties)
- Any other commercial leases in portfolio

**How to replicate:**
- Database: `cam_pools` (property, expense_categories, total_sqft), `cam_allocations` (tenant, sqft, pro_rata_share), `cam_estimates` (tenant, year, monthly_amount), `cam_reconciliations` (tenant, year, estimated_total, actual_total, adjustment)
- Year-end job: sum actual CAM expenses per pool → calculate per-tenant share → compare to estimates → generate adjustment charges/credits

**How to improve:**
- Real-time CAM tracking — tenants and management can see running actual vs estimate at any time, not just at year-end
- Automated CAM charge adjustments — as actuals come in monthly, auto-adjust future estimates

---

### 14. Insurance Tracking

**What AppFolio does:**
- Track insurance policies per property
- Certificate of insurance (COI) management for vendors
- Expiration alerts
- Renter's insurance compliance tracking

**How to replicate:**
- Database: `insurance_policies` (property_or_vendor, carrier, policy_number, coverage_type, effective_date, expiry_date, coverage_amount, document_url)
- Automated expiration alerts (30/60/90 day warnings)
- Renter's insurance verification per lease

---

### 15. Screening Services

**What AppFolio does:**
- Integrated tenant screening (credit, criminal, eviction)
- FolioScreen (AppFolio's native screening product)
- Application fee collection

**How to replicate:**
- Third-party API: TransUnion SmartMove ($25/screening) or RentPrep
- Application form collects consent + SSN → submit to screening API → return results
- Application fee collected via Stripe at time of submission

---

## AppFolio Features BIG Does NOT Use

These are AppFolio Max features that BIG likely doesn't use and should not be replicated:

| Feature | Why Not Needed |
|---|---|
| AI Leasing Assistant (Lisa) | BIG is an owner-operator, not chasing leads |
| Leasing CRM / Leasing Signals | Properties are stabilized, not in heavy lease-up |
| Affordable Housing Compliance (LIHTC/Section 8) | No evidence of subsidized housing |
| Student Housing Features | Not in portfolio |
| Community Association/HOA Management | BIG is an investment firm, not HOA manager |
| Smart Maintenance AI Dispatch | Overkill for portfolio size |
| Realm-X Flows / AI Automation | Enterprise AI features likely unconfigured |
| Investment Management Module | BIG manages its own investments internally |

---

## External Services Required

To replace AppFolio entirely, BIG's custom app will need these third-party integrations:

| Service | Purpose | Estimated Cost |
|---|---|---|
| **Stripe** | ACH rent collection ($0.80/txn, $5 cap), CC payments (2.9%+$0.30), vendor ACH payments | ~$500-2,500/month depending on volume |
| **Plaid** | Bank feed connection, auto-import transactions, balance checks | ~$500/month |
| **DocuSign** or **Dropbox Sign** | E-signature for leases and documents | ~$25-50/month |
| **TransUnion SmartMove** or **RentPrep** | Tenant screening (credit, criminal, eviction) | ~$25/screening (pass to applicant) |
| **Vercel** | Hosting (dashboard + app) | ~$20/month (Pro plan) |
| **Vercel Postgres** or **Supabase** or **Neon** | Database | ~$25-50/month |
| **S3 / Vercel Blob / Cloudflare R2** | Document storage | ~$5-20/month |
| **SendGrid** or **Resend** | Transactional email (payment receipts, notifications, alerts) | ~$20/month |
| **Twilio** | SMS notifications (optional) | ~$50-100/month |
| **Lob** or **Checkbook.io** | Physical check printing/mailing (if needed) | ~$1.50/check |
| **DeepSeek** | Joe Agent AI queries | ~$10-20/month |

**Total estimated monthly SaaS cost: ~$1,200-3,300/month** (vs $2,000/month for AppFolio)

Note: The lower end assumes mostly ACH payments and minimal check printing. The upper end assumes high transaction volume + all optional services. Many of these costs (Stripe fees, screening) are pass-through to tenants and vendors.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (already in use) | Deployed on Vercel |
| Backend/API | Next.js API Routes (already in use) | Server components + route handlers |
| Database | Vercel Postgres or Supabase | PostgreSQL with row-level security |
| Auth | NextAuth.js or Clerk | Role-based: admin, property manager, owner, tenant |
| Payments | Stripe | ACH + CC for rent + vendor payments |
| Bank feeds | Plaid | Auto-import bank transactions |
| File storage | Vercel Blob or S3 | Documents, invoices, photos |
| Email | Resend or SendGrid | Transactional emails |
| AI | DeepSeek (via OpenAI SDK) | Already integrated as Joe Agent |
| Monitoring | Existing `monitor.js` | Email alerts, can be expanded |

---

## Data Migration from AppFolio

Before canceling AppFolio, all historical data must be exported:

| Data | Export Method | Priority |
|---|---|---|
| Chart of Accounts | Reports API v2 (`account_totals`) or manual CSV export | Critical |
| GL Transaction History | Reports API v2 (`check_register_detail`, `income_statement`) — pull full date range | Critical |
| Tenant/Lease Records | Stack API (once approved) or manual CSV export | Critical |
| Vendor Records | Stack API or manual export | High |
| Bank Reconciliation History | Manual export (no API for this) | Medium |
| Documents/Attachments | Stack API or manual download | Medium |
| Work Order History | Stack API or manual export | Low |
| Payment History | Reports API v2 | High |

**Important:** Run the old and new systems in parallel for at least 1-2 months before cutting over. Reconcile both systems to ensure data integrity.

---

## Build Sequence

Suggested order based on dependency chain and value to BIG:

| Phase | What | Dependencies | Unlocks |
|---|---|---|---|
| **1** | Database schema + GL engine + Chart of Accounts | None | Everything else |
| **2** | Vendor management + Bill entry + AP workflow | Phase 1 | Paying bills without AppFolio |
| **3** | Bank feed integration (Plaid) + Bank reconciliation | Phase 1 | Monthly close without AppFolio |
| **4** | Tenant/lease management + Rent roll | Phase 1 | Tenant data ownership |
| **5** | Online rent collection (Stripe ACH) + Tenant portal | Phase 4 | Rent collection without AppFolio |
| **6** | Owner distributions + Owner portal | Phase 1 + Phase 3 | Owner payments without AppFolio |
| **7** | Maintenance/work orders | Phase 4 | Full operations without AppFolio |
| **8** | Reporting migration (Balance Sheet, Trial Balance, 1099s) | Phase 1-3 | Tax prep without AppFolio |
| **9** | Data migration + parallel run | All above | AppFolio cancellation |
| **10** | CAM reconciliation, insurance tracking, screening | Phase 4 | Full feature parity |

**AppFolio can be canceled after Phase 6 is complete and parallel run is verified.**

---

## Appendix: AppFolio API Reference

### Reports API v2 (Read-Only) — Active

Base URL: `https://blackdeerig.appfolio.com/api/v2/reports/{report_name}.json`  
Auth: HTTP Basic (Client ID : Client Secret)  
Rate limit: 7 requests per 15 seconds, 5,000 rows per page

| Report | Description |
|---|---|
| `account_totals` | GL account balances by property |
| `income_statement` | P&L with MTD and YTD columns |
| `check_register_detail` | Every disbursement with GL detail |
| `rent_roll` | All units with tenant, rent, lease, status |
| `aged_receivables_detail` | Outstanding balances by aging bucket |
| `budget` | Budget figures by GL account |
| `cash_flow` | Cash flow by activity type |
| `balance_sheet` | Assets, liabilities, equity |
| `deposit_register` | Deposit transactions |
| `payment_plans` | Active payment plan details |
| `receivables_activity` | Receivables transactions |
| `rental_applications` | Application data |

### Stack API (Read/Write) — Pending Approval

Auth: API Key from AppFolio  
Endpoints (based on AppFolio documentation):

| Resource | Operations | Useful For |
|---|---|---|
| Properties | GET, CREATE, UPDATE | Sync property data |
| Units | GET, CREATE, UPDATE | Sync unit data |
| Tenants | GET, CREATE, UPDATE | Sync tenant records |
| Occupancies | GET | Current occupancy data |
| Bills | GET, CREATE, BULK CREATE, UPDATE | AP management |
| Charges | GET, CREATE, BULK CREATE | Tenant charges |
| Vendors | GET, CREATE, UPDATE | Vendor management |
| Journal Entries | CREATE | GL adjustments |
| Bank Accounts | GET | Bank account list |
| Work Orders | GET, CREATE, UPDATE | Maintenance |
| Attachments | GET, CREATE | Document management |
| Rental Applications | GET | Application data |
| Collections Placements | GET | Collections data |
