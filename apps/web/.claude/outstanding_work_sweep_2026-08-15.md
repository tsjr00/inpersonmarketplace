# OUTSTANDING WORK SWEEP — 2026-08-15

Sources read this session: backlog.md (full, incl. all T-series tables), current_task.md history blocks, spot_fees_design_brief.md, memory session lines. Chunked by goal, prioritized. Statuses verified against the backlog's own ✅/⬜ marks; items marked ⚠VERIFY need a fresh look before work starts.

## CHUNK A — SHIP THE CURRENT BATCH (now, this week)
Goal: get the 19 staged commits + migs 228/229 to prod safely.
1. Owner staging tests (backlog top entry) → prod push in window → paste 228+229 → post-push smoke.
2. At/after the push: run REFRESH_SCHEMA.sql + regenerate snapshot structured tables (C5, stale since mig 124/park tables).
3. After owner verifies prod: vault update + manifest refresh (C6 — vault is ~100 verified commits behind; owner authorizes).
4. Mig 219 prod follow-ups are NOW actionable (219 reached prod 2026-08-13): delete the app-side sync stopgap in api/events/[token]/details and trim PRE_APPROVAL_ONLY_FIELDS (company_name stays).

## CHUNK B — EVENTS TRUST & CHANGE-SAFETY (highest-stakes unfinished cluster)
Goal: an organizer can change/cancel an event without silently hurting vendors or attendees. This cluster is why events "has never been consistent" (owner).
1. ⚠ **LIVE PROD ISSUE — check first:** the select page's go-live terms and OrganizerEventDetails amber warning PROMISE "unconfirmed pre-orders are refunded before the event" (select/page.tsx:484). That copy shipped 2026-08-08 and went to prod in the 08-12/13 deploy; **the re-confirmation mechanism does not exist**. Backlog's own gate said "must NOT reach prod ahead of the flow." Either build the flow or soften the copy — decide before more attendees see it.
2. **Re-confirmation flow** (spec owner-decided 2026-08-08, NOT built): awaiting-confirmation order state, token one-click confirm route, cutoff refund sweep cron, vendor prep confirmed-vs-awaiting split.
3. **Late-change protection, 6 layers** (approved 2026-08-08): only layer 3 (go-live acknowledgment) shipped. Remaining: 10-day floor + 10-13-day soft warning at intake, commitment copy, real counts in edit warning, 72h friction band, hard block w/ admin-held override (formula recorded in backlog).
4. **Notify accepted vendors on ANY change** (A-audit part 4 — mig 219 syncs the data; nobody is told).
5. **headcount + company_name editable by nobody** (A-audit remainder) — add to organizer editor pre-approval + admin post-approval.
6. **Cancel is a one-way door** (A-audit part 2): un-cancel looks repaired but market stays inactive. Owner decision (block / make reversible / warn).
7. **Backup vendors** (spec 2026-08-08, needs the guarantee % decision — "probably 50%, NOT FINAL") + fix promoted-backup notification (headcount 0 / empty address).
8. Organizer score system / intake warning (cheap first step); event dataflow follow-ups.

## CHUNK C — EVENT VENDOR FEES: FINISH THE FEATURE (revenue, mid-flight)
Goal: complete what V1 phases 1-3 started (verified working on staging 2026-08-14).
1. **Phase 4 — the paid gate** (paying gates selling): get_available_pickup_dates + registry event-sells-on-acceptance + tests, ONE careful session, mig with differential recipe.
2. **Phase 5 — refunds**: organizer-cancel auto-refund hook + admin payments-per-event view w/ manual refund action.
3. **Phase 6 — polish**: organizer earnings visibility, settlement line items, sharing audit.
4. Smaller flagged deferrals: fee line in the invitation EMAIL template; organizer early-open override; retroactive-fee-set notification design (vendor accepted before fee existed); fee-reduction terms clause + full organizer terms-list revisit (owner 2026-08-15).
5. Later: multi-day events phase 2 (per-day fees/waves/orders, separate transaction per day).

## CHUNK D — SALES TAX (owner-named; the next big build after events settle)
Goal: platform as marketplace facilitator — Stripe Tax calculates/collects, TaxCloud files. Readiness fully mapped in sales_tax_readiness.md; backlog :1419.
1. ⚠ Critical-path: withhold tax from vendor payouts (touches pricing.ts, checkout creators, payments/webhooks — all protected).
2. Enable automatic_tax on every Checkout Session creator; capture amount_tax; sales_tax_cents columns.
3. Product → tax-code classification (FM produce exempt vs FT prepared taxable).
4. Verify-before-build questions (TaxCloud↔Stripe reconciliation, Connect support, nexus per state, pricing) + CPA consult remainder.
5. Account setup (owner): Stripe tax registrations, TaxCloud profile. TX Comptroller registration DONE.
6. HB 2844 DSHS licensing stays deferred BEHIND this (its own plan file).

## CHUNK E — SECURITY / DATA RESIDUE
1. **G-4**: approved vendors' email/phone/legal_name anonymously readable via profile_data JSONB (RLS can't mask keys). Owner picks: (a) migrate keys to locked columns, or (b) public view + tighten base policy.
2. **Mig 225** (FM events sell without acceptance — T-39): written, applied NOWHERE; parked because zero live FM events. Apply only with its header recipe + the borrowed-event verification.
3. **Mig 153**: lock ~28 trigger/utility SECURITY DEFINER functions (enumerate by query, never by hand — Session 88 lesson).
4. Company-paid events package (deferred by owner 2026-07-14; RPC has phantom columns — dormant, nothing leaks; build as ONE project when scheduled; TENTATIVE 6.5% fee decision recorded).

## CHUNK F — BUG/TEST STRAGGLERS (rolling small batches)
Open T-series & friends, grouped by surface:
- Vendor UX: T-81 (photo needs saved listing — draft-first or deferred upload), T-25 (event-ready indicator on listings), T-15 (menu-minimum link), T-04 (verify acceptance persisted — likely closed by T-03 fix).
- Buyer UX: T-37 ($0.00 for logged-out = reads FREE), T-38 (silent add-to-cart fail logged out), T-16 (Keep Shopping under Pay Now on mobile), T-40 💰 (receipt omits Chip In line — display only), T-45 (share prompt during handoff), T-46 (review aggregate delay — verify), T-47 (en-US dates in Spanish notifications).
- Organizer UX: T-11 (confirm-1-of-3 warning), T-12 (in-app accept notification — T-59 may have closed; verify), T-13 (prominence), T-43 (organizer+admin see pre-orders happening — owner agreed 2026-08-11), T-17 (approved event invisible to organizer — deadlock class; verify vs 08-08 fixes).
- Vendor-order flow: T-44 (early "ready" warning).
- Admin: T-77 (rematch page jump), T-78 (events card not clickable), admin notifications go to wrong vertical + truncated, events-module C (platform admin missing UI) + D (hand-rolled admin gate — grep for more) + E (event-ratings load fail — runtime check) + B (scoring math review/docs).
- Copy batch (one pass): T-18/19/20/21/22/23/24, T-26 (logo squish — find the change), T-76 (parks disclaimer display rule).
- Answer-by-reading: T-27/28/29/30.
- Retests owed: T-74 (open/closed pills post-mig-224), T-64 count hypothesis.
- FM landing sideways scroll: delete nowrap at VendorPitch.tsx:58 (diagnosed, measured, zero-risk; owner sees two-line headline).
- Flaky rate-limit commit gate (blocks clean commits at random).

## CHUNK G — INFRASTRUCTURE / PROCESS DEBT
1. Guard #3 — name the "reactivation" change class (last of the 3 owner-approved guards; #1 telemetry + #2 paired-surfaces built).
2. Deep-coverage return pass: ~48 manager/park routes full-read + booking-atomic/season RPC SQL bodies (logic_testing_round_research.md matrix).
3. VOR-11: status-transitions.test.ts asserts a spec production ignores — wire in or demote (parked "leave as is for now" 2026-07-18; revisit).
4. C3: burn down KNOWN_UNCATALOGED error codes.
5. FT pickup capacity steps 6-7: day-of "short-staffed" override (needs mig 217) + listing cross-reference line.
6. Visual-consistency rollout slices (easiest-first list from 2026-08-08); flow-integrity absence assertions match comments (test quality).
7. Agreement-version question POSSIBLY absorbed: 2026-08-v3 bumped today with fee reframe; the 2026-07-18 "re-acceptance?" decision for existing vendors technically still open.

## CHUNK H — PRODUCT/GROWTH DESIGN SESSIONS (owner-led, schedule deliberately)
1. Public events page redesign: wire the HALF-BUILT service-level fork (hardcoded self_service at EventRequestForm:215 — behavior change downstream!), path/payment question tagging, T-55/T-56 fold in, visual notes.
2. Vendor decision-data differentiator (T-32) + host type (T-31) + certainty scores (T-51) — needs matching review first.
3. Independent market managers: rent-capture fields, dimensions→density calculator on OperatorProjectionTool, onboarding decision, legal-line copy.
4. Brand positioning rollout ("neighbor-to-neighbor commerce").
5. Vendor product categories; RM/growth feature set; park-operator public signup; "What's Open" events+private pickups (decisions settled, one visibility column, no default); property-broker concept (Phase 0).

## SUGGESTED CHUNK PRIORITY
A (ship) → B1 (prod copy check — cheap, live) → C (finish fees while context is warm) → B2-8 (events trust; biggest product blocker) → D (sales tax) → E → F rolling alongside everything → G opportunistic → H scheduled design sessions.
