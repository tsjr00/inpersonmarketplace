# FT Park — Finish, Ship & Cross-Pollinate Plan

**Created:** 2026-07-05. **Mode:** Report (plan only — no code until per-item approval).
Catches the leftovers/deferred items from the FT park-manager port + this session's dashboard work, evaluates and prioritizes them, and sets an order of action.

## Where we are (verified)
- **FT port P0→P6 = complete on staging.** Only P0b/c (self-serve FT intake + branding) is deferred.
- **Dashboard consolidation Layer 1 = complete on staging** (week view, grouping, collapsible setup, styling, dead-code cleanup).
- **Prod = `426deff4`** — none of the FT-port work is live yet (~35 commits behind; migs 171→178 all Prod-PENDING).

---

## Items evaluated (effort S/M/L · risk · dependency)

### A. Vendor-facing agreement acceptance at park booking  — **COMPLIANCE, ship-blocker-ish**
- **What:** at `book-park-spot` (and the pay-occurrence + standing flows), fetch the market's opt-in selections, show them at checkout, record a `vendor_market_agreement_acceptances` row, and pass its id as `p_acceptance_id` (today: `book-park-spot/route.ts:156` = `null`).
- **Why:** P5 shipped the *manager-side* picker + FT catalog, but a truck booking a spot never accepts the operator's statements — the missing half of P5. Matters most for the HB2844/compliance thesis.
- **Ready:** `park_spot_bookings.agreement_acceptance_id` already exists (mig 172, unused). Likely reuses the per-market opt-in fetch used at vendor signup (verify exact helper at build).
- **Open sub-decision (auto-affiliate):** does booking also create/refresh a `market_vendors` relationship (so the truck appears on the roster + its docs are reachable), or is the acceptance stored standalone? **Recommend minimal first** — capture acceptance only; treat auto-affiliate as a separate product decision.
- **Effort:** M · **Risk:** Medium (booking flow, money-adjacent; `book-park-spot` is not a protected file but is the money entry) · **Dep:** none.

### B. Dashboard Layer 2 — tabbed "Your trucks" + attendance in the week view
- **What:** fold roster + recurring + invite into one tabbed card; surface check-in status inside the week view's expanded day.
- **Effort:** M–L · **Risk:** Low–Med (FT-only, additive) · **Dep:** Layer 1 (done). **Optional polish.**

### C. Chunk 4 — per-spot occupancy hint on Spot inventory
- **What:** show "booked: Tue, Sat" per spot, reading the SAME `park-week-schedule` helper (no drift).
- **Effort:** S–M · **Risk:** Low · **Dep:** `park-week-schedule.ts` (done). **Optional polish.**

### D. FM cross-pollination — apply the dashboard grouping + collapsible setup to FM
- **What:** FM's manager dashboard is the same (larger) flat card wall; the grouping + collapsible-setup pattern would help FM operators equally. Reuses `CollapsibleSection` (already built).
- **Guardrail (user):** presentation-only — **no deconstruction/decoupling of working FM logic.** Grouping changes card *order/wrapping*, never the cards' behavior.
- **Reality check:** the week/occupancy *concept* is NOT a clean FM win — FM is week-granular and already has `BoothOccupancyGrid` + `WeeklyBookingsCard`. The reusable win is the **layout pattern**, not the week data model.
- **Effort:** L · **Risk:** Med–High — FM is proven/vaulted; even presentation-only reordering risks scroll-anchor/conditional-gate regressions. Must be its own **evaluation → chunked build → staging-verify**, opt-in.
- **Approach:** mirror the FT move — extract an `FmDashboardBody` and branch, leaving card internals untouched. This ALSO absorbs item G for free.

### E. Other FT→FM efficiency wins
- Mostly already captured: the vendors-route query removal benefits both (shared route); the market-local-today helper is already shared. Most remaining FT code is FT-specific. **The main FM opportunity is presentational (D).** No separate action.

### F. FT-port PRODUCTION PUSH — the milestone
- Apply migs **171→178** to Prod in order, push range `426deff4..<tip>` to `origin/main`, verify Vercel build + smoke. User-gated, 9 PM–7 AM CT. Everything above is staging-only until this happens.
- **Effort:** M (mechanical) · **Risk:** Med (real users) · **Dep:** A decided + staging verified.

### G. Durability cleanup — dead FT conditionals in the shared dashboard body
- Since FT now branches to `FtParkDashboardBody`, the shared body's `isFoodTrucks` branches (This-week, spot-inventory, standing, FT hides) are dead — a two-places-handle-FT trap. **Folds into D for free** (an `FmDashboardBody` extraction replaces the shared body). If D isn't done, this is a small standalone cleanup (S, Low–Med risk).

### H. Seed-vendor `stripe_payouts_enabled` test hygiene — minor
- Seed scripts set the flag so testers stop hitting the false "set up Stripe" loop. Test-data only, not a prod risk. **Effort:** S · **Parked-ish.**

---

## Recommended order of action

**Spine (finish + ship):**
1. **A — agreement acceptance at booking** (close the last functional/compliance gap). Present design → approve → build → staging-verify.
2. **F — FT-port prod push** (after A verified + your go, in the push window).

**Optional polish (slot before or after F, your call — none block prod):**
3. **C — spot-inventory occupancy hint** (small, high-clarity).
4. **B — dashboard Layer 2** (bigger; do if the week view proves itself in use).

**Cross-pollination (opportunistic, careful, opt-in):**
5. **D (+G) — FM dashboard grouping** — start with an *evaluation* (map FM cards to groups, list the conditional/anchor risks), present, then decide whether to build. Reuse `CollapsibleSection`.

**Parked (noted, not scheduled):** FM/FT money-path reconciliation (backlog P3); P0b/c self-serve FT intake; HB2844 DSHS licensing (behind sales tax); sales-tax module (its own track); H (seed hygiene).

## Notes
- Each build item keeps its own approval gate; A and D touch sensitive surfaces (booking flow / vaulted FM layout) — present-before-changing applies.
- "Optional polish" items are genuinely optional — restraint is fine; shipping A + F is the real finish line.
