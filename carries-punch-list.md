# Carrie's Punch-Down List — Command Center KPI Build

**Date:** June 5, 2026 (last updated June 13, 2026)
**Context:** KPI Dashboard rebuild per Build Spec v1 — items below need input/confirmation before they can be finalized.

---

## Status Summary

| # | Item | Status |
|---|------|--------|
| 1 | Asset-Class Tag Confirmation | **Awaiting confirmation** — tags applied, need review |
| 2 | Market Rent Data | **Awaiting decision** — three options presented |
| 3 | Expense Recovery Ratio | **Awaiting answer** — markup vs pass-through |
| 4 | Per-Property Debt Service Verification | **Awaiting answer** |
| 5 | Station 955 Loan — Payment Structure | **Partially resolved** — core details confirmed, payment structure TBD |
| 6 | Ownership Confirmation | **Mostly resolved** — Greyworks still open |
| 7 | BIG Ownership Split | **Awaiting answer** |

---

## What's Been Completed Since Last Update

- **KPI Dashboard fully rebuilt** (PR #58) — removed Labor %, added WALT, lease-expiration exposure, rent collection/delinquency, rent/SF, per-asset-class OER/NOI targets, CRE status grading (DSCR, OER, occupancy, collection, lease exposure)
- **Per-property detail pages updated** (PR #61) — each property now shows CRE metrics appropriate to its asset class (not the old Park Vista senior-housing metrics)
- **Station 955 loan page live** (PR #58) — shows $1.3M principal, accrued interest at 10%, countdown to Aug 2027 payment start, full monthly accrual schedule
- **Badger Realty card on dashboard** (PR #58/60) — with paw logo, notes CoStar access potential
- **Vacancy loss fixed** (PR #57) — estimates using avg occupied rent when AppFolio returns null market_rent
- **Sold/returned properties archived** — Germantown, Columbia St Marys, HC3 removed from active views
- **BIG removed from property table** — no longer inflates JRW property metrics
- **KPI Dashboard accessible from BIG sidebar** (PR #59)

---

## 1. Asset-Class Tag Confirmation

Each property has been tagged and benchmarks are active. Please confirm or correct:

| Property | Current Tag | Benchmarks Applied | Correct? |
|---|---|---|---|
| 2172 MPW, LLC (Land Leases) | Land Lease | OER 10–20%, no DSCR/WALT | |
| CG Silver Badger, LLC | Residential | OER 35–50%, DSCR ≥1.20x, Occ ≥90% | |
| Greywolf Industrial II | Industrial | OER 20–35%, DSCR ≥1.20x, WALT ≥4 yrs, Occ ≥90% | |
| HC1 Acquisitions Honey Creek I | Office (Modified Gross) | OER 35–45%, DSCR ≥1.25x, WALT ≥5 yrs, Occ ≥85% | |
| Honey Badger, LLC Honey Creek II | Office (Modified Gross) | OER 35–45%, DSCR ≥1.25x, WALT ≥5 yrs, Occ ≥85% | |
| Honey Creek IV, LLC | Office (Modified Gross) | OER 35–45%, DSCR ≥1.25x, WALT ≥5 yrs, Occ ≥85% | |
| Prairie Square | Office (Modified Gross) | OER 35–45%, DSCR ≥1.25x, WALT ≥5 yrs, Occ ≥85% | |
| Spooner St | Residential | OER 35–50%, DSCR ≥1.20x, Occ ≥90% | |
| Water Tower Place | Office (Modified Gross) | OER 35–45%, DSCR ≥1.25x, WALT ≥5 yrs, Occ ≥85% | |
| 2080 MPW LLC | Office (Modified Gross) | OER 35–45%, DSCR ≥1.25x, WALT ≥5 yrs, Occ ≥85% | |
| Greyworks LLC | Industrial | OER 20–35%, DSCR ≥1.20x, WALT ≥4 yrs, Occ ≥90% | |
| Badger Hotel Group | Hotel | OER 55–70%, DSCR ≥1.30x, Occ ≥65% | |

**Why it matters:** A wrong tag = wrong benchmark = misleading "Strong/Watch/Concern" flags. Properties currently flagged "Concern" may just have the wrong asset-class comparison.

---

## 2. Market Rent Data

**Status:** AppFolio returns `market_rent: null` for all vacant units. Dashboard currently shows in-place rent only. Three options:

### Option A — Submarket Rent Schedule (fastest, good enough for now)
Devin builds a `market-rent.ts` config with estimated $/SF/yr per property based on:
- Property address → submarket (most are Madison-area: Fitchburg, Sun Prairie, etc.)
- Asset class → typical rate band:
  - Madison flex/industrial: ~$8–12/SF NNN
  - Madison suburban office: ~$15–22/SF gross
  - Madison retail: ~$14–20/SF
  - Residential/student housing: market comp per unit
- Values tagged "est." in the UI so nobody mistakes them for hard comps
- Carrie can review and override individual numbers

**Pros:** Immediate, free, gets releasing spreads functional
**Cons:** Ballpark only — not property-specific comps

### Option B — Carrie/Broker Provides Numbers
If Badger Realty or a broker has actual market rents per property (even ballpark $/SF), we plug those in directly.

**Pros:** Trusted numbers from someone who knows the buildings
**Cons:** Manual, needs periodic updates

### Option C — CoStar or Market Data API (best long-term)
Wire up a CRE data provider (CoStar, Crexi, Reonomy, CompStak) for live market comp data.

**Note:** Mike mentioned Badger Realty may have CoStar access. If so:
1. Use their CoStar login to manually pull comps (Option B with better data)
2. Get a CoStar API key for automated integration (true Option C)

**Pros:** Authoritative, auto-updating, shows real releasing spreads
**Cons:** Requires paid subscription/API key; CoStar API access is expensive

### Recommendation
Start with **Option A now**, upgrade to **Option C** later if Badger Realty's CoStar access includes API.

---

## 3. Expense Recovery Ratio (NNN Properties)

The Build Spec calls for an expense recovery ratio: recovered CAM/tax/insurance ÷ recoverable OpEx. Typical targets: retail NNN 85-95%, industrial NNN 80-95%.

**Question:** Does BIG mark up recovered expenses (e.g., 15% admin fee on CAM pass-throughs), or are they pure pass-through? This affects how we calculate the ratio.

**Accounts involved:**
- 4010 CAM/Maintenance Reimbursement
- 4020 Tax Reimbursement
- 4030 Insurance Reimbursement

---

## 4. Per-Property Debt Service Verification

DSCR (NOI ÷ debt service) is now the primary health metric on the dashboard. Currently computed from AppFolio accounts 8510/8520/8530.

**Question:** Does every property with a mortgage have its debt service properly recorded in these accounts in AppFolio? If any properties have debt recorded under different account numbers or outside AppFolio, the DSCR numbers will be wrong.

**Properties showing $0 debt service (need verification — are these truly debt-free?):**
- 2172 MPW Land Leases
- CG Silver Badger
- Greyworks LLC
- Spooner St

---

## 5. Station 955 Loan — Additional Details

**Confirmed and implemented:**
- Principal: $1,300,000
- Annual interest rate: 10%
- Loan commenced: August 1, 2025
- Payments start: August 1, 2027 (24-month deferral)
- Interest accruing during deferral (shown live on `/loans/station-955`)
- Monthly accrual schedule table is live in the app

**Still needed:**
- What is the payment structure once payments begin? (Monthly? What amortization term?)
- Is principal + accrued interest rolled into the amortization, or is accrued interest paid as a lump sum at payment start?
- What is the loan maturity date?

---

## 6. Ownership Confirmation — Remaining Questions

**Confirmed and applied:**
- Badger Hotel: 65%
- Greywolf Industrial: 63%
- Honey Creek IV: 75%
- Honey Badger (HC2): 52%
- Park Vista: 51% (Joe), 49% (Julie Lonegran)
- 2080 MPW: 70%
- Spooner: 50%
- Managed-only (0%): Prairie Square, Water Tower, HC1, Research Park, Vantage IV
- Archived: Germantown Warhawks (sold), Columbia St Marys (sold), HC3 (back to bank)

**Open question:** Greyworks LLC — is this still 100% Joe-owned? Currently set to 100%.

---

## 7. BIG Ownership Split

The Command Center currently shows Joe at 51% for BIG/Blackdeer Investment Group.

**Question:** Is 51% still correct? Who owns the other 49%? (This affects the Joe's Share toggle on BIG management pages.)
