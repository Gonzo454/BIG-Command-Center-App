# Carrie's Punch-Down List — Command Center KPI Build

**Date:** June 5, 2026
**Context:** KPI Dashboard rebuild per Build Spec v1 — items below need input/confirmation before they can be implemented.

---

## 1. Asset-Class Tag Confirmation

Each property needs an asset-class tag to drive its benchmark targets (OER, NOI margin, DSCR, WALT, occupancy). These are my best guesses — please confirm or correct:

| Property | Current Tag | Correct? |
|---|---|---|
| 2172 MPW, LLC (Land Leases) | Land Lease | |
| CG Silver Badger, LLC | Residential | |
| Greywolf Industrial II | Industrial | |
| HC1 Acquisitions Honey Creek I | Office (Modified Gross) | |
| Honey Badger, LLC Honey Creek II | Office (Modified Gross) | |
| Honey Creek IV, LLC | Office (Modified Gross) | |
| Prairie Square | Office (Modified Gross) | |
| Spooner St | Residential | |
| Water Tower Place | Office (Modified Gross) | |
| 2080 MPW LLC | Office (Modified Gross) | |
| Greyworks LLC | Industrial | |
| Badger Hotel Group | Hotel | |

**Why it matters:** OER targets range from 10-20% (NNN retail) to 55-70% (hotel). A wrong tag = wrong benchmark = misleading health status.

---

## 2. Market Rent Data

AppFolio returns `market_rent: null` for all vacant units across all properties. This means:
- We **cannot** show "in-place vs. market" rent comparison
- We **cannot** compute releasing spreads
- Vacancy loss estimates use average occupied rent as a proxy

**However** — we have addresses for each property and know the asset class. Three options to solve this:

### Option A — Submarket Rent Schedule (fastest, good enough for now)
Devin builds a `market-rent.ts` config with estimated $/SF/yr per property based on:
- Property address → submarket (most are Madison-area: Fitchburg, Sun Prairie, etc.)
- Asset class → typical rate band:
  - Madison flex/industrial: ~$8–12/SF NNN
  - Madison suburban office: ~$15–22/SF gross
  - Madison retail: ~$14–20/SF
  - Residential/student housing: market comp per unit
- Values tagged "est." in the UI so nobody mistakes them for hard comps
- You/Carrie can review and override individual numbers

**Pros:** Immediate, free, gets the dashboard functional
**Cons:** Ballpark only — not property-specific comps

### Option B — Carrie/Broker Provides Numbers
If Badger Realty or a broker has actual market rents per property (even ballpark $/SF), we plug those in directly — most accurate without a subscription.

**Pros:** Trusted numbers from someone who knows the buildings
**Cons:** Manual, needs periodic updates

### Option C — CoStar or Market Data API (best long-term)
Wire up a CRE data provider (CoStar, Crexi, Reonomy, CompStak) for live market comp data. Auto-updating and authoritative.

**Note:** Mike mentioned Badger Realty may have CoStar access. If so, we could either:
1. Use their CoStar login to manually pull comps (Option B with better data)
2. Get a CoStar API key for automated integration (true Option C)

**Pros:** Authoritative, auto-updating, shows real releasing spreads
**Cons:** Requires paid subscription/API key; CoStar API access is expensive

### Recommendation
Start with **Option A now** (Devin builds submarket estimates, Carrie corrects), upgrade to **Option C** later if Badger Realty's CoStar access includes API. Option B is the middle ground if someone wants to provide a one-time spreadsheet of market rents per property.

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

DSCR (NOI ÷ debt service) is the single most important CRE metric. Currently computed from AppFolio accounts 8510/8520/8530 (mortgage interest, real estate taxes below the line, insurance below the line).

**Question:** Does every property with a mortgage have its debt service properly recorded in these accounts in AppFolio? If any properties have debt service recorded under different account numbers, or if some debt data lives outside AppFolio, the DSCR numbers will be wrong.

**Properties showing $0 debt service (need verification):**
- 2172 MPW Land Leases
- CG Silver Badger
- Greyworks LLC
- Spooner St

Are these truly debt-free, or is the data elsewhere?

---

## 5. Station 955 Loan — Additional Details

**Confirmed:**
- Principal: $1,300,000
- Annual interest rate: 10%
- Loan commenced: August 1, 2025
- Payments start: August 1, 2027 (24-month deferral)
- Interest accruing during deferral

**Still needed:**
- What is the payment structure once payments begin? (Monthly? What amortization schedule?)
- Is principal + accrued interest rolled into the amortization, or is accrued interest paid as a lump sum at payment start?
- What is the loan maturity date?

---

## 6. Ownership Confirmation — Remaining Questions

**Confirmed in this round:**
- Badger Hotel: 65%
- Greywolf Industrial: 63%
- Honey Creek IV: 75%
- Honey Badger (HC2): 52%
- Park Vista: 51%
- 2080 MPW: 70%
- Spooner: 50%
- Managed-only (0%): Prairie Square, Water Tower, HC1, Research Park, Vantage IV
- Archived: Germantown Warhawks (sold), Columbia St Marys (sold), HC3 (back to bank)

**Question:** Greyworks LLC — is this still 100% Joe-owned? Left unchanged at 100% since no update was provided.

---

## 7. BIG Ownership Split

The Command Center currently shows Joe at 51% for BIG/Blackdeer Investment Group.

**Question:** Is 51% still correct? Who owns the other 49%? (This affects the Joe's Share toggle on BIG management pages.)
