# Sales Tax Readiness — Texas

**Original:** 2026-06-21 (Stripe Tax + TaxCloud plan).
**Revised:** 2026-08-01 — major revision after a full sourced review. **Part I below is the original plan, preserved, with inline corrections where it is now known to be wrong. Part II is the 2026-08-01 revision and supersedes Part I wherever they conflict.**

> **Read Part II first.** Part I is retained because its mechanics (payout withholding, product tax codes, the Stripe checklist) are still correct and hard-won. Its *vendor choice* and *scope* are what changed.

> **Confidence key:** **[DOC]** = vendor's published docs · **[VERIFY]** = confirm before building · **[CONFIRMED 8/1]** = verified 2026-08-01 against a primary source (statute, TX Comptroller, or vendor pricing page) · **[UNSETTLED]** = genuinely open, needs counsel.

---
---

# PART I — Original plan (2026-06-21), with corrections

**Status at the time:** PRIORITY BACKLOG. **Source:** Stripe + TaxCloud published docs, fetched 2026-06-21.
**Plan owner decision (2026-06-21):** Stripe Tax does per-jurisdiction **calculation/collection**; TaxCloud does the **filing**.

> 🔴 **CORRECTION (2026-08-01) — the TaxCloud half of this decision is REVERSED.** TaxCloud's advantage is free filing in the ~24 SST member states. **Texas is NOT an SST member** [CONFIRMED 8/1 — streamlinedsalestax.org lists TX under "Non-Member States"], so that advantage is worth **exactly nothing** here. TaxCloud in Texas = ~$19–79/mo + ~$45/return for a service we can do free via Webfile. **Do not buy TaxCloud.** See Part II §4.

## 1. The model (2026-06-21)

- **Stripe Tax** calculates + collects tax at checkout (`automatic_tax[enabled]=true`), **only in jurisdictions where we've added registrations**. Fee ~0.5%/transaction **[VERIFY exact rate]**.
  > ✅ **RESOLVED 8/1:** Stripe Tax **Basic** = **0.5%/txn** (no-code) or **50¢/txn** (API integration, includes 10 calculation calls; 5¢/call beyond). No subscription, no minimum. **Tax Complete** (1-yr contract) starts **$90/mo**. [CONFIRMED 8/1 — stripe.com/tax/pricing]
- **TaxCloud** connects via OAuth, pulls sales monthly, files returns. SST Certified Service Provider — free filing in SST states, paid in non-SST states like Texas **[VERIFY]**.
  > 🔴 **VERIFIED AND REJECTED 8/1.** See correction above.

## 2. What this means for OUR app

### 2a. We are the Merchant of Record (marketplace facilitator) [DOC]
For a Connect marketplace, **the platform** calculates/collects/remits using **the platform's** registrations — connected accounts do **not** collect or file. ONE centralized obligation.

> ✅ **CONFIRMED 8/1 and now statutory-cited.** Tex. Tax Code **§151.0242**: a marketplace provider must collect, report and remit state **and local** tax on all marketplace sales, must **certify to its sellers** that it is doing so, and must **retain records 4 years**. Sellers are relieved once certified. Not elective. [comptroller.texas.gov/taxes/sales/marketplace-providers-sellers.php]
>
> ✅ **Stripe Connect support confirmed 8/1:** destination charges ✅ and separate charges+transfers ✅ are both supported when the platform is tax-liable. **Direct charges are NOT supported** — we don't use them. Set `automatic_tax[liability][type]=self`. **No re-architecture needed.** [docs.stripe.com/tax/tax-for-marketplaces]

### 2b. ⚠️ Tax must be withheld from vendor payouts — CRITICAL-PATH money code
With destination charges the platform receives the full amount **including tax** and must **NOT** transfer the tax portion to the vendor. Reverse the tax from the transfer (or transfer gross-minus-tax). Today `pricing.ts` + checkout/transfer logic has **no tax line**.

- **Affected (all protected/critical-path):** `src/lib/pricing.ts`, `api/checkout/session`, `api/checkout/external`, market-box + booth-rental checkout creators, `src/lib/stripe/payments.ts`, `src/lib/stripe/webhooks.ts`, vendor payout/transfer logic.
- Per-file approval required for each (change-discipline Rule 3).

> ✅ **STILL CORRECT AND STILL THE HIGHEST-RISK ITEM.** Stripe documents three withholding options: **transfer reversal (recommended)**, reduced transfer amount, or `application_fee_amount` on invoices. This is a *money* bug risk, not merely compliance — build it carefully and early. [docs.stripe.com/tax/connect]

### 2c. Product tax codes — material for our verticals [DOC + domain judgment]
Fresh produce/groceries often exempt (FM); prepared food taxable (FT). Need listings → Stripe tax codes.

> ✅ **CONFIRMED 8/1, with a sharper rule.** Taxability is **SKU-level, not vertical-level**:
> - **Prepared food is taxable** — Rule 3.293(c)(7)(A) expressly covers "**mobile vendors**" (the operative phrase for food trucks). Prepared = ready for immediate consumption, sold heated, sold with utensils, **or two or more ingredients mixed by the seller**.
> - **Unprepared groceries are exempt** — flour, sugar, bread, milk, eggs, fruits, vegetables (Pub. 96-280).
> - ⚠️ **The trap:** a farmer's tomatoes are exempt but their **homemade salsa is taxable** ("two or more ingredients combined by the seller") — **in the same cart**. Also always taxable: candy, soft drinks, ice, alcohol.
> - ✅ **We already have the right data model:** `listings.is_taxable` (mig 081), per item, defaulting true for FT / false for FM. Currently only feeds an informational vendor report (`vendor/analytics/tax-summary`).
> - ⚠️ Neither Pub. 96-280 nor Rule 3.293 names farmers markets; the rules are written for grocery/convenience stores and applied by analogy. **[MEDIUM confidence on the FM application specifically.]**

## 3. Readiness checklist (2026-06-21) — still valid for the Stripe side

### Stripe side (config, no app code)
- [ ] Set Tax Settings (head office location).
- [ ] Add **registrations per nexus state** (`POST /v1/tax/registrations`, `country=US`, `state=TX`, `type=standard`).
- [ ] Assign **product tax codes** (preset default + per-category food overrides).
- [ ] Enable on every Checkout Session creator: `automatic_tax[enabled]=true`, `automatic_tax[liability][type]=self`, `invoice_creation[enabled]=true`, `invoice_creation[invoice_data][issuer][type]=self`.

### TaxCloud side
> 🔴 **ENTIRE SECTION VOID (8/1)** — we are not using TaxCloud. Preserved only so a future reader knows it was evaluated and why it was rejected (Texas is not an SST state).

### Our code (the real build)
- [ ] Tax-withholding payout change (2b). **Critical-path.**
- [ ] `automatic_tax` + `liability=self` + `issuer=self` on all checkout-session creators.
- [ ] Product → tax-code classification (2c).
- [ ] Capture `total_details.amount_tax` through webhooks/order records.
- [ ] Code-stability Rule 2.1: record before/after on any payout math change.

## 4. Verify before building — ALL NOW RESOLVED (8/1)

1. ~~Does TaxCloud file off Stripe-collected tax or re-derive via TIC?~~ → **MOOT.** Not using TaxCloud.
2. ~~Does TaxCloud support the Connect/marketplace model?~~ → **MOOT.**
3. **Nexus + facilitator obligations** → **RESOLVED for TX:** §151.0242, permit obtained, **assigned MONTHLY filing**. Other states still open.
4. **Correct tax codes for food categories** → **RESOLVED in principle** (see 2c); exact `txcd_` mapping still to be done at build time.
5. **Stripe Tax fee + TaxCloud non-SST pricing** → **RESOLVED** (see §1 correction and Part II §4).

## 5. Scope note (2026-06-21)
> 🔴 **SUPERSEDED — this was the plan's biggest blind spot.** The original scope covered **only facilitated vendor product sales**. There are **four** taxable streams. See Part II §1.

---
---

# PART II — 2026-08-01 revision

All findings below verified 2026-08-01 against primary sources (TX Comptroller publications, Tex. Tax Code, 34 TAC, Stripe/TaxJar/TaxCloud pricing pages). **Nothing here is tax advice** — it is sourced material to inform a Texas CPA/SALT review.

---

## ▶ RESUME HERE (status as of 2026-08-02)

**The platform currently collects $0.00 of sales tax on all four streams.** What exists is the *filing substrate* — storage, validation, and admin entry — not collection. Read this block first; the sections below are the reference material behind it.

### Built and on staging (untested)
| Piece | Where | State |
|---|---|---|
| Jurisdiction storage | migs **214** (columns + 8.25% CHECK) + **215** (re-verify trigger) | Applied Dev+Staging; **Prod pending** |
| Pure calc/validation library | `src/lib/tax/jurisdictions.ts` — `computeItemTax`, `validateJurisdictions`, `buildListSupplement`, `totalRatePct`, `parseJurisdictions` | 22 unit tests green; **wired to nothing** |
| Admin entry UI | `api/admin/markets/[id]/tax-jurisdictions` + `MarketTaxJurisdictionsCard` on `/admin/markets/<id>/edit`, `/admin/markets/<id>`, `/[vertical]/admin/markets` | Built, **never tested** — staging checklist §11.12–11.14 |
| Amenity bundling + vendor-space characterization | `lib/markets/booth-types.ts`, `platform-agreement-clauses.ts` (`_platform_vendor_space`), copy renames | Shipped `0d313e0d` |

### Blocked on / waiting
1. **Staging test pass** — `apps/web/docs/staging_test_checklist.md` §11.12–11.14. Until an admin enters real seven-digit codes for real markets, the storage holds nothing.
2. **CPA answers** — §6 below. **Three are design-blocking, not reporting details:** sourcing (Q4) determines the payout-withholding math, chip-in taxability (Q6) is already live code, and admission fees (Q5) must be answered *before* ticketing is designed.

### Next build, in order — do NOT reorder without a reason
1. **Real jurisdiction data** for actual markets (part of the staging pass). Cheapest item; blocks everything downstream.
2. **Quarterly rate refresh** — designed, not built. Codes are stable, rates drift. Comptroller serves `Last-Modified`/`ETag` on a static XLSX, so freshness is assertable. Auto-apply rate changes; flag-only when a code disappears.
3. **Stream 2 — subscriptions.** Our own revenue, one Stripe object, Stripe Tax Basic does the work. **No payout-withholding surgery, no critical-path money files.** This is the lowest-risk path to being genuinely compliant on *something*.
4. **Stream 1 — facilitated vendor sales.** Includes withholding tax from vendor payouts (§2b). Critical-path money code (`payments.ts`, checkout, payout path) — per-file approval required. **Largest remaining piece. Do not start before Q4 (sourcing) is answered**, or the withholding math gets built twice.
5. **Stream 4 — commission.** Hold pending CPA + ITFA litigation status.

### 🚨 The closest deadline is a copy guardrail, not a filing date
`src/lib/vendor/tax-notice.ts:9` and `:36` tell FT vendors *"Sales tax will be automatically applied to your listings."* **That is currently false.** Owner decision 2026-08-01 was to ship the functionality rather than soften the copy, because there were no live vendors. **Guardrail: fix the copy OR ship subscription tax before the first live FT vendor — whichever comes first.** With a live event approaching, this is the nearest hard edge in the whole tax effort.

---

## 1. There are FOUR taxable streams, not one

| # | Stream | Taxable in TX? | Authority |
|---|---|---|---|
| 1 | **Vendor product sales** (facilitator) | **YES** — prepared food taxable, unprepared groceries exempt | §151.0242; Rule 3.293; Pub. 96-280 |
| 2 | **Our subscription tiers** ($25 Pro / $50 Boss / $9.99 buyer) | **YES** — data processing service, **80% of charge taxable** (20% statutory exemption) | §151.0035; §151.351; Rule 3.330; Pub. 96-259 (01/2026) |
| 3 | **Booth / vendor-space rental fees** | **NO** — space rental is outside the sales tax base | **Pub. 96-211**; Tax Policy News 7/2021 |
| 4 | **Our commission / take-rate** | **YES (since 10/1/2025)** ⚠️ **CONTESTED** | **Rule 3.330(b)(5)** |

### 1.1 Stream 2 — subscriptions (SaaS)
Pub. 96-259 (dated 01/2026): *"Data processing services providers include **sellers of software as a service** and application service providers"* … *"Twenty percent of the charge for data processing services is exempt from tax."* The 20% exemption is statutory (**§151.351**, unchanged since 1999) and survived the **April 2025 rewrite of Rule 3.330** intact.

**Math:** $50 Boss tier → $50 × 80% = $40 taxable × up to 8.25% = **$3.30**. Same structure for the $9.99 buyer membership (consumer-facing — **no resale certificate available**).

**Note:** data processing is **§151.0101(a)(12)** (not (a)(14) — that's security services).

### 1.2 Stream 3 — booth/vendor space: NOT taxable, with two traps
**Pub. 96-211:** *"Booth fees, floor space fees and rental charges for a space to sell or display taxable items are not subject to sales tax."* Rationale (Tax Policy News 7/2021): space = real property, outside the base.

- ⚠️ **Trap 1 — separately stated amenities are taxable.** *"When stated separately from booth fees, an event promoter must collect tax on the rental of tables, chairs, electricity and power strips."*
  → **MITIGATED IN PRODUCT (2026-08-01):** one all-in price per space; **no line-item amenity charges**. Design constraint documented in `src/lib/markets/booth-types.ts`, referenced from `BoothInventoryManager.tsx` + `ParkSpotsManager.tsx`, with operator-facing instructions in both cards. Amenities may be **descriptive attributes** (park spots' power/water booleans) — never priced add-ons.
- ⚠️ **Trap 2 — food-truck spots may be taxable parking. [UNSETTLED]** Texas taxes *"motor vehicle parking and storage services"* (**§151.0101(a)(4)**). **Rule 3.315(h): "A rental or lease of a parking facility is presumed to be taxable."** BUT **(h)(1)** excludes rentals for a non-parking purpose and gives **a flea market** as its own example — factually near-identical to a food-truck park. **No Texas ruling, STAR letter, or guidance found either way.**
  → **(h)(1) conditions the exclusion on the lessor receiving and retaining documentation describing the nontaxable activity.** Our platform generates the agreement, so that document carries the characterization.
  → **MITIGATED (2026-08-01):** "vendor space" characterization + agreement clause disclaiming parking/storage/overnight; user-facing copy renamed off "parking."
  → **Substance controls, not labels.** If an operator actually permits overnight parking, the clause won't save it.

### 1.3 Stream 4 — 🚨 our commission is now taxable [CONTESTED]
**34 TAC §3.330(b)(5), effective 10/1/2025:** *"marketplace provider services may be included in taxable data processing services… For example, services provided by a marketplace provider to its marketplace seller that **store product listings and photographs, maintain records of transactions, and compile analytics** are taxable data processing services."*

That example describes this platform almost line-for-line. Under it our take-rate is itself a taxable service sold to the vendor (80% base), **in addition to** the tax we collect as facilitator on the underlying sale — the *"tax on 130% of marketplace sales"* problem. Comptroller Hegar's own *Fiscal Notes* (9/2024) confirms the two-layer design and notes the **Legislature declined to grant marketplaces an exemption in 2023**.

**Math:** $100 order → $13 commission → tax ≈ **$0.86** (13% × 80% × 8.25%).

⚠️ **CONTESTED / [UNSETTLED]:** McDermott and others argue the rule violates the **Internet Tax Freedom Act** (online commissions taxed while auctioneers/consignment shops aren't) and exceeds the Comptroller's authority. Status of any 2026 challenge **unverified**. A successful challenge would reshape streams 2 and 4.

**Key reframe (owner decision 2026-08-01):** sales tax on our commission is **not our cost — it is the vendor's tax that we collect**. We are the seller of a taxable service; the vendor is the customer. So the question is "collect or absorb," not "avoid."

**DECIDED 2026-08-01 — SKIPPED FOR NOW:** restructuring the fee as "10% commission + 3% Stripe pass-through" to shrink the taxable base. Rationale: §151.0035(b)'s payment-settlement exclusion **expressly does not cover marketplace provider charges** (Texas anticipated the move); savings ≈ $0.20 per $100; and 3.330(b)(5) may be struck anyway. Revisit only with CPA blessing. **If ever attempted it must be substantively real:** pass through exactly what Stripe charges, no markup, separately stated, documented per transaction.

## 2. Texas filing mechanics — we are on MONTHLY

**Permit: obtained. Filing frequency: MONTHLY (assigned by the Comptroller, 2026).**

- Frequency is **liability-driven, not elective** (34 TAC 3.286(g)): monthly if ≥ **$1,500 state tax/quarter**; quarterly if under; yearly if < $1,000/yr with authorization. Yearly status is auto-revoked above $1,000 and reviewed annually.
- **Due: 20th of the following month.**
- 💰 **Claim both discounts:** **0.5% timely-filing** + **1.25% prepayment** = up to **1.75% of tax collected** retained. Both available to monthly filers. [3.286; Comptroller Report & Pay FAQ]
- **Webfile is free:** https://security.app.cpa.state.tx.us/

### 2.1 🚨 As a marketplace provider we MUST file the long form + List Supplement — from day one
Form **01-922** instructions (Rev. 8-25): *"You must file the list supplement with the Texas Sales and Use Tax Return if you: … **are a marketplace provider** or remote seller."* Long form **01-114** required when reporting to more than one local jurisdiction **or** as a marketplace provider.

**List Supplement (Form 01-116) is a per-jurisdiction table:**
| Col | Content |
|---|---|
| 1 | Every city, transit authority, county, SPD we did business in |
| 2 | **Seven-digit local code** for each |
| 3 | Amount subject to tax per jurisdiction |
| 4 | Local rate (⅛% to 2%) |
| 5 | Tax due per jurisdiction |

**Consequence: per-jurisdiction detail is mandatory on the FIRST return, not something that kicks in at scale.** This is the single strongest argument for the storage design in §3.

Rates: state **6.25%** + local up to **2%** = max combined **8.25%**, drawn from four local types (city, county, transit, SPD).

### 2.2 [UNSETTLED] Sourcing — origin vs destination
34 TAC 3.334: marketplace sales source to *"the location… to which the item is shipped or delivered"* (destination) — **but** an order *"placed in person at a seller's place of business"* is **origin**-sourced. Our model is online pre-order + in-person pickup at a market. Practically both roads likely land on the market address, but it determines **which rate we charge**. → CPA question.

## 3. Build the storage infrastructure FIRST (before any calculator)

**Store on every order at time of sale:**
- taxable amount · exempt amount · tax collected
- **jurisdiction breakdown with seven-digit local codes** (state / city / county / transit / SPD) + each rate
- **which rate version** produced it (quarterly rate-file version, or the Stripe calculation ID)
- the sourcing address used (the market)

**Why first:**
1. **Rates change quarterly** — an unrecorded rate cannot be reconstructed later.
2. **Refunds must reverse at the original rate**, not today's.
3. **4-year retention** is statutory for marketplace providers (§151.0242).
4. **Required on the first return** (§2.1) — not future-proofing.
5. **Filing frequency becomes a non-event** — monthly vs quarterly is just the date range on one query.

### 3.1 The name→code mapping — build it, it's small
**Stripe Tax exports give jurisdiction NAMES; Texas wants SEVEN-DIGIT LOCAL CODES.** That gap is real but bounded:

**Our jurisdiction set is bounded by ENTITY count, not transaction count.** We are **pickup-only** (verified: no shipping anywhere in checkout), so every product sale sources to one of a **small fixed set of market addresses**. Resolve each market **once at creation**, store codes on the market row, and every order inherits them. Subscriptions form a second bounded set (one address per vendor, changes rarely).

This is why we do **not** need TaxCloud/Avalara: those solve **unbounded rooftop address resolution** for shippers, 46-state rate maintenance, nexus monitoring, and multi-state filing. We have none of those problems in Texas-only.

**Design:**
- `markets` gains jurisdiction columns (codes + rates + rate-file version).
- Resolve manually at first via the Comptroller Rate Locator (few markets); automate only if market count grows.
- Orders snapshot the codes at sale time.
- Monthly return = group by code → straight into Form 01-116.
- **Audit bonus:** Stripe's names vs our stored codes are two independent sources; agreement is a strong position.

**Revisit when:** we register in a second state.

## 4. Vendor decision — Stripe Tax BASIC, file manually [DECIDED 2026-08-01]

| Option | Year-1 cost (TX only) | Verdict |
|---|---|---|
| **Stripe Tax Basic + Webfile** | 50¢/txn (API), no minimum, no contract | ✅ **CHOSEN** |
| Stripe Tax Complete | $90/mo Tier 1 + 8 overage filings @ $55 ≈ **$1,520/yr** (monthly filing = 12) | ⏸ later, at a trigger |
| TaxCloud | ~$228–948/yr + ~$45/return | ❌ SST benefit worthless in TX |
| TaxJar standalone | ~$468–968/yr | ❌ same engine Stripe resells |

**Why Basic first:** no 1-year lock-in while 3.330(b)(5) litigation and our volume are both unsettled · no monthly minimum at near-zero volume · **identical calculation engine** (Complete only adds registration + filing services) · **Basic → Complete is a billing change, not an integration change**.

**Reporting confirmed available on Basic** [CONFIRMED 8/1 — docs.stripe.com/tax/reports + stripe.com/tax/pricing]:
- **Itemized export** and **Summarized export** — CSV, with **country/state/county/city/district** breakdown. Docs: *"Use itemized exports for US states that require sub-state level reporting."*
- Columns include `jurisdiction_name`, `jurisdiction_level`, `tax_amount`, `taxable_amount`, `non_taxable_amount`.
- **Custom date ranges independent of filing cadence** — pull monthly regardless.
- *Location reports* are state-only and Dashboard-view-only — not sufficient for TX.
- ⚠️ Tier 1 of Complete caps at **200 txns/month** — likely the real binding constraint if we ever move; per-transaction overage rate unpublished (**ask Stripe sales**).

**Trigger to revisit Complete:** second state registration · sustained volume past Basic's economics · or a month where reconciliation takes > 2 hours.

## 5. Build order

1. ✅ **DONE 8/1** — amenity bundling enforced in product (§1.2 Trap 1).
2. ✅ **DONE 8/1** — "vendor space" characterization: agreement clause + user-facing rename (§1.2 Trap 2).
3. ✅ **DONE 8/1-8/2** — **Storage infrastructure** (§3): jurisdiction columns on `markets` (mig 214), item-level snapshot on `order_items`, re-verify-on-address-change trigger (mig 215), `lib/tax/jurisdictions.ts` + 22 tests, admin entry card. **Two follow-ons remain:** (a) enter real codes for real markets — staging checklist §11.12; (b) quarterly rate-refresh automation — designed, not built.
4. **Subscriptions first** (stream 2) — our own revenue, one Stripe object, **no payout-withholding surgery, no critical-path money-file changes.** Lowest-risk way to be genuinely compliant on something.
5. **Facilitated sales** (stream 1) — includes the §2b payout-withholding change. Critical-path, gated, per-file approval.
6. **Commission** (stream 4) — collect rather than absorb; hold pending CPA + litigation status.

⚠️ **Copy dependency:** `src/lib/vendor/tax-notice.ts:9,36` tells FT vendors *"Sales tax will be automatically applied to your listings."* **Currently false** — nothing applies tax. Owner decision 2026-08-01: **do not fix the copy; ship the functionality to make it true** (no live vendors yet). **Guardrail: fix the copy OR ship subscription tax before the first live FT vendor, whichever comes first.**

## 6. Questions for the Texas CPA / SALT attorney

Each question below records **what we currently assume**, **why it matters**, and **what changes based on the answer** — so a returned answer can be acted on without re-deriving the context. An email-ready version of this section was prepared 2026-08-02.

**Priority key:** 🔴 design-blocking (code gets built wrong or twice without it) · 🟡 affects reporting, not architecture.

### 🔴 Q1 — Sourcing: origin or destination?
Our orders are placed online in advance and picked up in person at a market or truck location. There is **no shipping anywhere in the platform**.
- *Our assumption:* the pickup location's jurisdiction governs, and because we're pickup-only that address is a small fixed set (§3.1).
- *Why it matters:* this determines which jurisdiction's rate applies per order and therefore the **withholding math on vendor payouts** (§2b).
- *If the answer differs:* the payout-withholding build (build-order step 5) has to be re-done. **Do not start step 5 before this is answered.**

### 🔴 Q2 — Community Chip In: part of the taxable sales price?
At checkout a buyer may voluntarily add a contribution to a designated cause. It is optional, separately stated, disclosed as **not tax-deductible**, and 100% is remitted to the beneficiary — the platform keeps none of it (mig 213).
- *Our assumption:* a voluntary separately-stated pass-through is not part of the sales price of the taxable item.
- *Why it matters:* **this is live code already on staging**, not a hypothetical.
- *If it IS taxable:* we must add it to the taxable base at checkout and to the item-level snapshot, and revisit the "100% goes to the org" copy.
- *Related:* Pub. 94-117's mandatory-gratuity rule (≤20% separately stated and distributed to staff = not taxable; >20% taxable) may be the closest analogue for our **tip** feature — please address tips as well.

### 🔴 Q3 — Event admission fees, before we design ticketing
Pub. 96-211: *"Admission fees are taxable. The event promoter must collect sales tax on admission fees."*
- *Status:* ticketing is **under consideration, not built**.
- *Why it matters:* if we would be the promoter (or the facilitator for a promoter), that is a **fifth taxable stream** with its own collection and reporting path.
- *We need the answer BEFORE design*, not after — retrofitting a tax stream into a payments flow is the expensive version.

### 🟡 Q4 — Does Rule 3.330(b)(5) reach our commission?
Effective 10/1/2025 the rule appears to tax marketplace commission as a data processing service.
- *Sub-question:* does it reach our cut of **booth/vendor-space rent**, where the underlying transaction is a nontaxable real-property license rather than a sale of taxable items?
- *Also:* current status of the **ITFA / rulemaking-authority challenges**.
- *Current posture:* build-order step 6 is **on hold** pending this answer. If taxable, the decision is to **collect rather than absorb**.

### 🟡 Q5 — Food-truck spaces: taxable parking or nontaxable vending space?
Rule 3.315(h) presumes parking-facility leases are taxable; (h)(1) carves out flea-market-style vending space.
- *What we've done:* re-characterized the product away from "parking" — user-facing copy renamed to **"vendor space"**, and FT vendors accept a `_platform_vendor_space` clause stating they are booking space to sell from during posted service hours, not a parking space, with no overnight use or storage.
- *Ask:* does that documentation satisfy the (h)(1) treatment, and **what else must the operator retain** in their records?

### 🟡 Q6 — Subscriptions: confirm 80/20 data-processing treatment
Please confirm the 80% taxable / 20% exempt data-processing treatment (§151.351, Rule 3.330, Pub. 96-259 01/2026) applies to **both** vendor subscription tiers **and** the consumer buyer membership.
- *Why it matters:* this is build-order step 4 — the next thing we intend to build. A confirmation lets us ship it; a correction changes what we configure in Stripe Tax.

## 7. Stale sources — do NOT rely on
- **Pub. 94-127** *Data Processing Services are Taxable* (03/2022) — never mentions the 20% exemption or SaaS; predates the April 2025 rule rewrite. **Use Pub. 96-259 (01/2026) + Rule 3.330.**
- **Pub. 94-117** *Restaurants* (03/2014) — doesn't address food trucks. Useful only for the mandatory-gratuity rule (≤20% separately stated and distributed to staff = not taxable; >20% taxable) — **relevant to our tip feature**.
- **Pub. 96-259 vs Rule 3.315 on parking-facility leases** — the publication omits facility leases; the rule includes them. **The rule controls.**

## Sources

**Texas — primary**
- Pub. 96-211 Fairs, Festivals, Markets and Shows: https://comptroller.texas.gov/taxes/publications/96-211.php
- Pub. 96-259 Taxable Services (01/2026): https://comptroller.texas.gov/taxes/publications/96-259.php
- Pub. 96-280 Grocery and Convenience Stores (03/2024): https://comptroller.texas.gov/taxes/publications/96-280.php
- Tax Policy News July 2021 (booth fees nontaxable): https://comptroller.texas.gov/taxes/tax-policy-news/2021-july.php
- Marketplace Providers and Sellers: https://comptroller.texas.gov/taxes/sales/marketplace-providers-sellers.php
- Fiscal Notes, Sept 2024 (two-layer marketplace tax): https://comptroller.texas.gov/economy/fiscal-notes/government/2024/data-process-ftd/
- Form 01-922 return instructions (List Supplement requirement): https://comptroller.texas.gov/forms/01-922.pdf
- Report & Pay FAQ (discounts): https://comptroller.texas.gov/taxes/sales/faq/report-pay.php
- Quarterly local rate files: https://comptroller.texas.gov/taxes/file-pay/edi/sales-tax-rates.php
- Rate Locator: https://gis.cpa.texas.gov/search/
- Webfile: https://security.app.cpa.state.tx.us/

**Statute / rules**
- §151.0242 marketplace providers: https://texas.public.law/statutes/tex._tax_code_section_151.0242
- §151.0035 data processing definition: https://codes.findlaw.com/tx/tax-code/tax-sect-151-0035/
- §151.0101 taxable services list: https://codes.findlaw.com/tx/tax-code/tax-sect-151-0101/
- §151.351 20% exemption: https://texas.public.law/statutes/tex._tax_code_section_151.351
- 34 TAC 3.330 data processing (eff. 4/2/2025): https://www.law.cornell.edu/regulations/texas/34-Tex-Admin-Code-SS-3.330
- 34 TAC 3.315 motor vehicle parking: https://www.law.cornell.edu/regulations/texas/34-Tex-Admin-Code-SS-3-315
- 34 TAC 3.293 food: https://www.law.cornell.edu/regulations/texas/34-Tex-Admin-Code-SS-3-293
- 34 TAC 3.286 filing frequency/discounts: https://www.law.cornell.edu/regulations/texas/34-Tex-Admin-Code-SS-3-286
- 34 TAC 3.334 local sourcing: https://www.law.cornell.edu/regulations/texas/34-Tex-Admin-Code-SS-3-334
- SST member states (TX is NOT one): https://www.streamlinedsalestax.org/Shared-Pages/State-Detail

**Stripe**
- Tax for marketplaces: https://docs.stripe.com/tax/tax-for-marketplaces
- Tax with Connect: https://docs.stripe.com/tax/connect
- Merchant of record: https://docs.stripe.com/connect/merchant-of-record
- Tax reports: https://docs.stripe.com/tax/reports
- Tax pricing: https://stripe.com/tax/pricing
- Registrations API: https://docs.stripe.com/api/tax/registrations

**Commentary (secondary)**
- Grant Thornton, TX data processing rule update (4/11/2025): https://www.grantthornton.com/insights/alerts/tax/2025/salt/p-t/tx-updates-data-processing-services-tax-rule-04-11
- McDermott / Inside SALT, "tax on 130% of marketplace sales": https://www.insidesalt.com/2024/09/texas-comptroller-proposes-rule-changes-cementing-tax-on-130-of-marketplace-sales/
- Bracewell, 89th Legislature tax update: https://www.bracewell.com/resources/texas-tax-update-key-changes-enacted-during-the-89th-legislature/
