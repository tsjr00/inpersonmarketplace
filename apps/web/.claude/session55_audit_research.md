# Session 55 — Comprehensive Systems Audit Research

Started: 2026-03-14
Status: COMPLETE — Final report written to `session55_audit_report.md`

## Audit Methodology
- 7 parallel research agents exploring major system areas
- Cross-referenced against business rules document (8 domains, 189 rules)
- Cross-referenced against backlog, decisions log, schema snapshot
- Following Incremental Research Protocol — findings written per component
- Independent verification of known gaps against current code

## Agent Status
- [ ] Agent 1: Payment & Checkout Flow
- [ ] Agent 2: Order Lifecycle & Inventory
- [ ] Agent 3: Vendor Onboarding & Tiers
- [ ] Agent 4: Availability & Scheduling
- [ ] Agent 5: Security & API Routes
- [ ] Agent 6: Multi-Vertical & Cron
- [ ] Agent 7: Notifications & Browse

## Known Gap Status Verification (Business Rules Doc vs Current Code)

### ✅ RESOLVED (Doc says gap, but code now fixed)
1. **`atomic_decrement_inventory` overselling** — FIXED by migration 078. Now RAISE EXCEPTION on insufficient stock. Backlog is stale.
2. **Fulfill route payout failure handling** — FIXED with H-1 FIX in fulfill/route.ts:283-319. Item stays 'fulfilled', failed payout recorded for Phase 5 retry. Backlog is stale.
3. **Listing publication gate client-only** (VJ GAP 1) — FIXED by migration 078 C-2. `enforce_listing_tier_limit` trigger now calls `can_vendor_publish()` before allowing publish.
4. **No auto-miss for market box pickups** (SL GAP 4) — FIXED with Phase 4.7 in cron. Per-vertical grace: FT=2hr, FM=48hr.
5. **No email unsubscribe link** (NI GAP 1) — FIXED. List-Unsubscribe header + List-Unsubscribe-Post + visible footer link.

### ⚠️ STILL OPEN — Critical Issues
6. **COI gate CONFLICTS with business rule VJ-R1** — CRITICAL NEW FINDING.
   - Business rule VJ-R1 (user confirmed Session 49): "COI is OPTIONAL — not a required gate for publishing"
   - BOTH code paths require `coi_status === 'approved'`:
     - API route: `onboarding/status/route.ts:219`
     - DB function: `can_vendor_publish()` lines 146-148 (migration 012)
     - DB trigger: `enforce_listing_tier_limit` (migration 078) calls `can_vendor_publish()`
   - **Impact**: NO vendor can publish listings without approved COI, contradicting the confirmed business rule
   - **Severity**: BLOCKER for vendor onboarding. Any new vendor without COI approval = no published listings.

7. **No auto-pause of excess listings on Stripe subscription cancel** (VJ GAP 2) — Still open. Trial grace expiry (SL-R17/cron Phase 10) handles trial→free downgrade, but if a paying vendor cancels Stripe subscription, their excess listings remain published.

8. **`/api/subscriptions/verify` uses service client without auth** (AC GAP 1) — Still open. Session_id is only guard.

9. **Stripe webhook notifications not deduplicated** (NI GAP 3) — Still open. payout_processed, payout_failed, order_refunded can duplicate.

10. **Missing Stripe chargeback handler** (IR GAP 3) — Still open. `charge.dispute.created` not handled.

11. **No health check endpoint** (IR GAP 4) — Still open.

12. **Webhook out-of-order handling** (IR GAP 5) — Still open. payment_intent.succeeded before checkout.session.completed.

13. **FT no-show timing not implemented** (OL-R19) — User decided Session 54 (1hr after pickup time), code still uses date-only.

14. **Cash order lifecycle undefined** (OL-Q7) — Still needs documentation/decision.

15. **Cross-vertical shared identity** (VI-Q1) — Still shared Supabase auth project. No implementation of separation.

16. **`payout_failed` misused for tier expiration** (NI GAP 2) — Still open.

17. **No buyer cancellation for market box subs** (SL GAP 3) — Still open, needs user decision (SL-Q2).

### OPEN USER DECISIONS NEEDED (🔵❓)
- SL-Q2: Buyer market box cancellation policy
- AC-Q1: Auth on /api/subscriptions/verify
- AC-Q2: createVerifiedServiceClient adoption
- NI-Q3: subscription_expired notification type
- NI-Q4: Critical urgency bypass tier gating
- IR-Q1: Health check endpoint
- IR-Q3: Chargeback webhook handling
- IR-Q4: External cron monitoring
- OL-Q7: Cash order full lifecycle

### Backlog Staleness
- `atomic_decrement_inventory` overselling — listed as P2 unfixed, but migration 078 fixed it
- Fulfill route payout separation — listed as P2 unfixed, but H-1 FIX already applied

## NEW FINDINGS — Session 55 Discovery

### CRITICAL
**C-1: COI Gate Blocks All Publishing (Code vs Business Rule Conflict)**
- See #6 above. This is the highest-priority finding.
- Fix requires updating `can_vendor_publish()` DB function to remove COI check OR make it conditional.
- Also requires updating API route `onboarding/status/route.ts:219` to match.

(Additional findings from agents will be added below)

## Findings from Agent Research
All 7 agents completed. Findings consolidated into `session55_audit_report.md`.

**Agent summaries:**
- Agent 1 (Payment): Cancellation fee split bug, market box payout race, flat fee rounding
- Agent 2 (Orders): Concurrent cancellation race, inventory-before-refund, payout record atomicity
- Agent 3 (Vendor): COI gate conflict confirmed, FM category gap, market/location limits app-only
- Agent 4 (Availability): No checkout re-validation, dual system disagreement, hardcoded timezone
- Agent 5 (Security): 157 routes all secured, timing attack minor, createVerifiedServiceClient unused
- Agent 6 (Multi-Vertical): Quality checks not filtered by vertical, data retention global
- Agent 7 (Notifications): Missing buyer order_confirmed, search log unused, email logo domain
