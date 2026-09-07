# Sales Tax Review — 2026-09-07 (owner-ordered, REPORT ONLY)

Task: review tax code + plans; determine whether changes since the plan (last touched 8/4)
require plan changes; investigate Stripe's new multi-state tool (Stripe Tax stays the
interface). NO code changes.

## Checklist
- [x] Inventory docs + code
- [x] Read canonical plan `sales_tax_readiness.md` (2026-08-01 revision, Part II governs)
- [ ] Read lib/tax/{jurisdictions,taxcloud,tic-codes}.ts + tax-notice.ts
- [ ] Check migs 214/215 state + tax column writers (who writes orders.tax_* today?)
- [ ] Diff: changes since 8/4 vs plan (migs 216→246, bundles, discounts, VIP, cancel fees)
- [ ] Stripe new tool research (WebSearch)
- [ ] Business-model docs skim (cash tax analysis, revenue scenarios)
- [ ] Final report

## Findings (write as discovered)
### Canonical plan facts (from sales_tax_readiness.md)
- TX-only; marketplace facilitator (§151.0242, permit obtained, MONTHLY filing).
- DECIDED 8/1: Stripe Tax BASIC (50¢/txn API) + free Webfile manual filing. TaxCloud REJECTED
  (TX not SST). Complete ($90/mo) = later trigger: 2nd state · volume · reconciliation >2h.
- Four streams: 1 vendor sales (taxable SKU-level, is_taxable mig 081) · 2 subscriptions
  (80% base) · 3 booth/space rent (NOT taxable; amenity-bundling + vendor-space clauses
  shipped 8/1) · 4 commission (3.330(b)(5), CONTESTED, on hold).
- Storage-first DONE (migs 214/215, jurisdictions.ts 22 tests, admin entry card) but
  **wired to nothing — $0.00 collected on all streams**; real jurisdiction codes never
  entered (staging checklist §11.12-14 untested).
- Build order next: real codes → quarterly rate refresh (designed, unbuilt) → stream 2
  subscriptions → stream 1 facilitated sales (payout withholding §2b, critical-path, gated
  on CPA Q1 sourcing) → stream 4 hold.
- 🚨 Guardrail: tax-notice.ts:9,36 tells FT vendors tax "will be automatically applied" —
  FALSE; fix copy or ship subscription tax before first live FT vendor.
- CPA questions Q1-Q7 drafted 8/2 (Q1 sourcing + Q2 chip-in + Q3 admissions design-blocking).

### Code-state verification (2026-09-07)
- **Still $0.00 collected**: no `automatic_tax` anywhere in app code; nothing writes
  orders/order_items tax_* columns at checkout (only the admin jurisdictions route writes
  markets.tax_jurisdictions). Plan's RESUME block still accurate.
- **taxcloud.ts + tic-codes.ts = DEAD-PLAN artifacts** of the rejected pre-8/1 TaxCloud
  approach (env vars, TIC mapping, TODOs "after creating the account"). Never wired. Candidate
  for retirement when tax work resumes (avoid a future session building on the wrong plan).
- **tax-notice.ts guardrail STILL LIVE**: "Sales tax will be automatically applied to your
  listings" at :9 (FT) and the prepared-food branch — still false. With launch prep + beta,
  this is now the most urgent tax item in the codebase.
- jurisdictions.ts (computeItemTax/buildListSupplement/etc.) intact, 22 tests, unwired ✓.
- Admin entry card exists; real seven-digit codes still never entered (staging §11.12-14).

### Drift since the plan (8/4) — what changed and whether the plan holds
| Change since | Tax impact | Plan verdict |
|---|---|---|
| Mig 243 discounts: order_items.subtotal_cents stored NET | Tax reads net by construction | ✅ STRENGTHENS plan (deliberate, decisions.md 9/4) |
| Mig 242 VIP + vendor_offers | same net design | ✅ compatible |
| **Mig 244 bundles** | (a) checkout charges ONE Stripe line for the whole bundle → Stripe Tax per-line tax codes can't see mixed SKU taxability inside (exempt tomatoes + taxable salsa in one line). (b) MARGIN = market's curation revenue — new taxable-stream question (bundled-transaction doctrine: single charge for taxable+exempt may drag the whole charge taxable). (c) items expand at live prices per item internally ✓ storage-compatible | ⚠ PLAN GAP — new CPA question + checkout-line design decision needed before stream 1 |
| Event money (migs 228-235, built 8/16 AFTER plan) | event vendor fees (organizer↔vendor participation fees) unclassified; company-paid orders = stream 1 sale to a company; chip-ins already Q2; admissions still unbuilt (Q3 ✓) | ⚠ PLAN GAP — classify event vendor fees |
| Market-box subscriptions (pre-plan but NEVER in the plan's four streams) | recurring FOOD sales (stream 1-ish, prepaid), not SaaS | ⚠ PLAN GAP — add to stream map + CPA list |
| Cancellation/refund paths multiplied (bundle cancel, cancel-date cascade, no-show pays, reject) | when tax ships, EVERY refund path must reverse tax at original rate; plan §2b affected-file list is now incomplete (margin-payout.ts, cancel-bundle, cancel-date-cascade.ts, event fee routes) | ⚠ UPDATE §2b file list; principle unchanged |
| Buyer-side platform fees (6.5% + flat + small-order) — embedded per-item in Stripe lines | never listed among the four streams; facilitator charges to buyer may join the taxable sales price; tip separate (Q2 rider) | ⚠ ADD CPA question (not new code, new realization) |
| Migs 236-241, 245-246 (invites, surveys, host_status, browse pill, bundle ack) | none | ✅ no impact |

### Stripe's new tool (researched 2026-09-07, sources in chat report)
- **Sessions 2026 (GA): automated US tax filing inside the Stripe Dashboard, powered by
  TaxJar** (Stripe-owned since 2021) — file, track status, view details; all 46 sales-tax
  states. Setup: install TaxJar app from Dashboard → provide state tax ID + assigned
  frequency → TaxJar reviews (~2wks) → auto-files monthly, ACH-debits the bank account,
  applies timely-filing discounts. Monthly pre-filing review email; pause by the 6th.
- **Requires Tax COMPLETE** ($90/mo tier 1; plan noted 200 txn/mo cap + ~$1,520/yr at
  monthly cadence). NOT available on Basic. Registrations: Stripe can also register with
  states on our behalf + monitors nexus thresholds ("Needs attention").
- **Only files transactions where Stripe Tax automatic_tax calculated the tax** — a filing
  pipeline with nothing to file until our streams actually flow through Stripe Tax.
- Other partners exist (Taxually global, Marosa EU, HOST US/CA à-la-carte ~$55/return).
- Sessions 2026 Connect roadmap (2027 previews): app-fee tax separation; platform assumes
  tax liability on connected-account invoices — not needed for our model (liability=self
  already supported).
- **Open question before ever relying on it: does TaxJar file the TEXAS MARKETPLACE
  PROVIDER long form (01-114) + List Supplement (01-116) per-jurisdiction detail?** Not
  stated in docs — ask Stripe/TaxJar sales at trigger time.
- **VERDICT: plan §4 decision UNCHANGED for today** (TX-only, low volume: Basic + free
  Webfile still wins; we also keep the 1.75% timely+prepay discounts ourselves — TaxJar
  applies timely discounts but Complete costs $1.5k+/yr). **What CHANGES: the §4 trigger
  payoff.** At the second state / volume trigger, the answer is now "flip to Complete +
  in-Dashboard TaxJar filing + Stripe registrations" — the TaxCloud/Avalara-class
  re-evaluation the plan deferred is DEAD; Stripe completes the stack. §3.1's "revisit when
  we register in a second state" resolves to: turn on Stripe registrations + filing.

### Bottom line for the report
Plan STRUCTURALLY HOLDS (model, vendor choice, build order, storage design all intact —
mig 243's net-price design actively strengthens it). Required plan UPDATES before build
resumes: (1) bundles: single-Stripe-line vs per-item tax codes design + margin taxability
(CPA Q8, incl. cause share of margin); (2) event vendor fees classification (Q9);
(3) market-box subscriptions added to the stream map (Q10); (4) buyer-side platform fees
in the taxable base (Q11); (5) §2b affected-file list extended (margin-payout, cancel-bundle,
cancel-date-cascade, event fee routes — every refund path reverses tax at original rate);
(6) retire taxcloud.ts/tic-codes.ts when work resumes. URGENT regardless: tax-notice.ts
false copy — now the nearest edge with launch prep underway. CPA Q1 (sourcing) still gates
stream 1.

- [x] All checklist items complete 2026-09-07.

### Phase 0 execution log
- 2026-09-07: §11.12 PASS (entry, decimal auto-convert, 8.25% cap, code validation, persistence)
- 2026-09-07: §11.13 PASS (address change → amber Re-verify banner, data kept)
- §11.14 DEFERRED — no vertical-admin-only account exists yet; finish later.
- Owner note: staging addresses partly estimates → III.4 addendum (confirm before prod).
