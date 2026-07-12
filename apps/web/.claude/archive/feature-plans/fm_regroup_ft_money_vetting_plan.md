# FM Regroup + FT Money Group + FT Vetting — Detailed Plan

**Created:** 2026-07-05. **Mode:** Report — NO code until user approves. **Target:** build after approval → staging-verify → include Parts 1–2 in tonight's (post-9 PM CT) FT-port prod push. Part 3 = design decision now, build later.

**Risk reframe (user):** the FM manager dashboard has **no live users** of this functionality → the FM regroup is presentation-only AND low-stakes (drop the "live surface" caution). Proceed deliberately, not fearfully.

## DECISIONS (user, 2026-07-05)
- **Part 1 (FM regroup): APPROVED — build.** Booth-trio placement still open (recommend keep-together in Operations).
- **Part 2 (FT money group): APPROVED — build.** Reuse `ManagerEarningsCard` (title/desc via `term()` → "Your spot revenue") + new `getParkManagerEarningsAggregates` over paid `park_spot_bookings` with `operator_keep_pct`. Card copy still says "weekly … rentals / activity below" (FM-shaped) — minor mismatch for FT (per-day, no transactions card); accept for now / refine if flagged in testing (don't edit shared card = would touch FM).
- **Part 3 (FT vetting): Direction B — book-then-vet** ("start here, increase requirements as we go"). Broken into: **B1** required doc-responsibility acknowledgment at booking (does NOT block booking if docs missing); **B2** auto-create pending `market_vendors` row on first booking (roster affiliation for vetting); **B3** required-doc upload UX + manager vetting + cancel-without-refund enforcement (ties to HB2844 doc-vault). **B = its own effort AFTER tonight.** Pending user approval of B1 wording (draft below) + confirm post-tonight.
  - **B1 draft acknowledgment:** *"I understand it is my responsibility to upload every document this park requires (licenses, permits, insurance), to keep them unexpired, and to make sure they are valid before my rented time begins. I understand this is a requirement of the park. If my documents are missing, expired, inaccurate, or not provided before my booking starts, the park operator may cancel my booking WITHOUT a refund and may decline my future bookings at this park."*
- **FT onboarding checklist** is hidden because the shared `OnboardingChecklist` tracks `market_booth_inventory` completion (FM booth tiers), which FT parks don't use — it would never complete (`dashboard/page.tsx:176-178`, P2.5). **Candidate (not tonight):** a park-shaped FT checklist (spots → paid mode → Stripe → agreements).
- **Tonight:** build Parts 1+2 → staging-verify → include in post-9 PM FT-port prod push. Part 3 designed, not built.

---

## Part 1 — FM dashboard grouping (BUILD)

**Approach:** mirror the FT move. Extract **`FmDashboardBody`**; change the page's else branch from the inline shared body to `<FmDashboardBody .../>`. Cards reused with **identical props** — zero logic change. This also **retires the dead FT conditionals** left in the shared body (cleanup item G) for free.

**Groups (6):**
| Group | FM cards | Collapsible? |
|---|---|---|
| ① What's on your plate | OnboardingChecklist (only when NOT onboardingComplete) · ManagerActionSummary | no |
| ② This week / operations | WeeklyBookingsCard · BoothOccupancyGrid · MarketAttendanceCard · MarketCancelDateCard | no |
| ③ Your vendors (**TabbedCard**) | Approved (roster) · Invite (link + browser) · Off-platform (placeholders) | tabs |
| ④ Park/market setup (**CollapsibleSection**) | Stripe · Booth inventory · Schedule · Seasons (Season + Settlement) · Agreement statements · Branding · Verification docs · Visibility | **collapsed when onboardingComplete** |
| ⑤ Money & insights | ManagerEarningsCard · MarketTransactionsCard · SurveyResults | no |
| ⑥ Communicate | Broadcast · Support | no |

**Conditionals preserved verbatim:** OnboardingChecklist (FM-only, first-run) shown in ① only pre-complete; `defaultCollapsed = onboardingComplete` on ④ (new managers see setup OPEN — the corrected per-vertical behavior); ManagerEarningsCard / WeeklyBookingsCard / Seasons stay FM-only; `visibilityStatus` gate; `InviteVendorBrowser` gated on onboardingComplete.

**Open sub-decision — the booth trio:** BoothInventory (config→④), BoothOccupancyGrid (current-week occupancy→② operations), BoothPlaceholders (off-platform vendors→③ vendors). Splitting is logical but separates three currently-adjacent cards. Alternative: keep the trio together in ② operations. **Need user pick.**

**Also:** update JumpNav FM chips to the 6 groups; keep `#vendors`, `#money`, `#booths`, `#schedule`, `#announce`, `#seasons`, `#surveys` anchors landing on the right group/card.

**Effort:** L. **Risk:** Low–Med (presentation-only, no live users). **Gates + staging matrix:** new manager (onboarding incomplete → setup open + checklist visible) · onboarding complete (setup collapsed) · market with/without seasons · no visibilityStatus · empty states. No migration.

---

## Part 2 — FT money group (BUILD)

**User:** FT needs a money group showing **spot-rental revenue** (the operator's cut), NOT food-sales revenue.

- **New `getParkManagerEarningsAggregates(marketId, tz, seasonStart, seasonEnd)`** — mirror `getManagerEarningsAggregates` but over `park_spot_bookings` (status `paid`/`completed`) using `calculateBoothRentalFees(price_cents, operator_keep_pct).managerReceivesCents`. Fetch `markets.operator_keep_pct` once; apply per row. Same 7d/30d/season/all-time windows (uses `paid_at`, falls back to `booking_date`).
- **Reuse `ManagerEarningsCard`** (it just renders a `ManagerEarningsAggregates` shape) fed FT aggregates — add a ⑤ "Money" group to `FtParkDashboardBody` with it. Label: "Spot rental revenue."
- **Do NOT** add `MarketTransactionsCard` (buyer food-sales order_items) — stays hidden for FT.

**Effort:** M. **Risk:** Low–Med — read-only aggregate, no money-path write; verify the numbers on staging against known paid bookings. No migration.

---

## Part 3 — FT vetting / approval (DESIGN DECISION now, BUILD later)

**Goal (user):** FT park trucks should be **vetted/approved by the park manager** before participating (compliance — permits/DSHS), and the manager needs the info to vet them. Make FT behave like FM here without breaking vertical differences.

**Verified current state:**
- **FM:** booking requires `market_vendors.approved=true` (`book/route.ts` → 403 "not approved") + `agreement_accepted`. Vendor self-joins/invited (→ `market_vendors` approved=false) → manager vets (View docs / compliance) → approves → can book.
- **FT:** **open** booking — `book-park-spot` has no approval check and does NOT create a `market_vendors` row. Park trucks are neither vetted nor on the roster.

**Options:**
- **A. Full FM parity — approval-gated booking (recommended direction).** Truck must be an approved `market_vendors` member before booking a spot / requesting a hold. Reuse FM's self-join + invite → `market_vendors(approved=false)`; add the same 403-if-not-approved gate to `book-park-spot` + `standing-reservation`; manager vets via the roster (compliance docs). *Pros:* compliance-aligned, reuses FM machinery, makes the FT roster meaningful (fixes the "roster shows different trucks than bookings" disconnect). *Cons:* removes drop-in booking; bigger build (join UX + gates + vetting surface); changes the model currently on staging.
- **B. Book-then-vet (soft).** Keep open booking but auto-create a pending `market_vendors` row on first booking; manager approves/flags after. *Pros:* low friction. *Cons:* weak compliance gate (truck already booked+paid); needs an unapproved-but-paid policy (refund? allow?).
- **C. Per-park toggle.** Manager sets "require approval to book" per park (open vs vetted). Most flexible, most work.

**Money-path note:** Option A = no fee-math change, just a pre-gate. Option B = needs a paid-but-unapproved policy (refund exposure).

**Recommendation:** **Direction A** — the compliant, FM-consistent model. But it's a **separate, larger effort** (join flow + gates + vetting UX + likely the auto-affiliate decision), NOT tonight. Pick the direction now; build as the next focused FT effort after a design-detail pass.

---

## Scope for TONIGHT (recommended)

- **Build (after approval):** Part 1 (FM regroup) + Part 2 (FT money group). Both presentation/read-only, low risk, no migration.
- **Design-decide now, build later:** Part 3 (FT vetting) — a model change with money implications; do not rush into tonight's push.
- **Prod push (post-9 PM CT):** FT-port work already staging-verified **+** Parts 1–2 (once built + staging-verified). Part 3 excluded.

## Decisions needed from user
1. Booth trio grouping — split (inventory→Setup, occupancy→Operations, placeholders→Vendors) vs keep-together in Operations?
2. FT vetting direction — A (approval-gated, recommended) / B (book-then-vet) / C (per-park toggle)?
3. Confirm tonight = Parts 1+2 built + pushed; Part 3 designed-not-built.
