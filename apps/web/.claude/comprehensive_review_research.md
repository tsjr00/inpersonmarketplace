# Comprehensive Code Review — Research (Session, 2026-06-26)

Goal: thorough understanding of app + systems; surface SIGNIFICANT gaps (financial harm, data loss,
oversell, auth bypass, broken core flows) — not small annoyances. Report mode, no code changes.

Rule: agents FIND; Claude READS + CITES path:line before presenting as fact. Unverified = labeled.

## Subsystem map (checklist)
- [ ] 1. Money path: cart → validate → checkout → success → external → webhooks → payouts → refunds
- [ ] 2. Inventory & booking races: atomic_decrement/restore, booth RPCs, season booking
- [ ] 3. Auth / authorization / RLS / SECURITY DEFINER / IDOR
- [ ] 4. Phase E season prepay end-to-end (active work) + settlement correctness
- [ ] 5. Multi-vertical isolation + pricing.ts + vendor-limits
- [ ] 6. Notifications & cron (idempotency, Vercel termination)

## Candidate findings (UNVERIFIED until Claude cites)
(filled in as agents report; Claude verifies before final report)

## Verified findings (path:line)

### Money path (agent ac30 + Claude verification)
Overall: well-defended. Deterministic idempotency keys, unique constraints, claim-first payout inserts, 23505 no-op handling, conditional UPDATEs for double-cancel. Agent's "HIGH/CRITICAL buyer-loses-money" framings are mostly OVERSTATED — corrected below.

- **Refund failures are LOGGED, not silent.** reject route refund-fail → `logError ERR_REFUND_001` (reject/route.ts:173-181 VERIFIED). success at-capacity refund-fail → `logError ERR_REFUND_001` (success/route.ts:262-269 VERIFIED); RPC-fail refund-fail → `ERR_CHECKOUT_011` (success/route.ts:245-252 VERIFIED). All reach error_logs → error-log review catches them. Real gap = **no automated refund retry** (unlike payouts). Severity: MEDIUM (managed, not silent).
- **Market-box payout transfer failure = observability gap.** market-box-payout.ts:134-140 VERIFIED: on transfer fail sets status='failed' + `console.error` ONLY (no logError) → NOT in error_logs. Visible only via vendor_payouts.status='failed'. This is vendor-underpayment/platform-holds-cash, NOT buyer loss. Need: confirm a cron retries failed MB payouts (await cron agent).
- TODO verify: checkout/session inventory sequential-decrement orphan (session/route.ts:773-798).

### Cron + notifications (agent a2d6) — well-defended
- `sendNotification` (service.ts:398) never throws, must await, vertical=4th param, 10s dedup. VERIFIED claim consistent w/ memory.
- Crons auth'd via CRON_SECRET timing-safe. expire-orders = 17 phases, claim-first / existing-check / constraint-dedup patterns. **Failed payouts retried by Phase 5** (answers MB-payout question). Notifications awaited or `after()`-deferred. No async-without-await leak (only 1 fire-and-forget w/ .catch at external:357, acceptable).
- Agent's MEDIUM items (Phase 4/5 payout) all reported mitigated (H-9/H-10/M-11 + fee-ledger unique). Not re-verified line-by-line; documented fixes. Not flagging as significant.

### ⭐ SIGNIFICANT — Phase E season payment-confirmation cluster (CONFIRMED by Claude reads)
Root: the season confirmation path has no safe handling of delayed/failed/missing Stripe webhooks, AND the existing cron actively cancels in-flight season bookings. Phase E is staging-only (NOT prod) → fixable before it ships.

**F1 [HIGH / Confirmed] expire-orders Phase 16 cancels paid/in-flight season children.**
- Phase 16 cohort (a) "orphans": `weekly_booth_rentals` UPDATE status→cancelled WHERE status='pending_payment' AND stripe_checkout_session_id IS NULL AND booked_at<30min. expire-orders/route.ts:2367-2373. NO group_id exclusion.
- Season children NEVER have stripe_checkout_session_id (it's written to booth_booking_groups only — book-season/route.ts:234-239; children get only stripe_payment_intent_id/paid_at on webhook flip at webhooks.ts:1390-1398).
- ⇒ any season child still pending_payment at the daily 12:00 UTC cron run (`0 12 * * *`), booked >30min prior, gets CANCELLED. Triggers: vendor finishes Stripe checkout next day; webhook delayed across the cron boundary; or child-flip failed (F2). Result: vendor CHARGED (destination charge already moved money to manager), booth weeks cancelled, slot freed for re-book, and a false "booth_rental_payment_failed_vendor" notification fires. Phase 16 = Phase C era (one-off rentals DO carry session id on the row); never updated for Phase E groups.

**F2 [MEDIUM / Confirmed] webhook child-flip failure → permanent group/children status divergence.**
- webhooks.ts:1374-1387 flips group→paid; 1390-1398 flips children→paid; 1400-1408 on child error logs (ERR_WEBHOOK_013) but does NOT return non-2xx. AND the idempotency guard 1366-1369 (`group.status==='paid' → return`) means a Stripe redelivery skips the whole handler → children never re-flipped. In-code comment 1401-1402 claims redelivery re-runs child update — that's incorrect (guard blocks it; and 2xx prevents redelivery anyway).
- Child status is source of truth (handoff gotcha) → paid-but-pending children misread by check-in eligibility, occupancy grid, etc. Also feeds F1 (stuck-pending → swept).

**F3 [MEDIUM / Confirmed] no reconciliation/backfill if season webhook never arrives.**
- If Stripe never delivers (endpoint down past retries), group stuck pending_payment, vendor charged, no safety net. No cron reconciles paid-Stripe-vs-pending-group for booth_booking_groups. (Same family as F1/F2.)

NON-issues ruled out: duplicate pending groups for same weeks PREVENTED by weekly_booth_rentals UNIQUE(vendor,market,week_start_date) (mig 139:83) → book_weekly_booth_atomic raises DUPLICATE, rolls back whole group. Inventory/booth/wave/market-box races ALL guarded (agent ad52: atomic RPCs + advisory locks + FOR UPDATE + unique constraints).

### Lesser items (worth knowing, not significant)
- `/api/markets` GET: vertical_id filter OPTIONAL (markets/route.ts:33) → call without param enumerates both verticals. Low harm (market listings ~public). Verify callers always pass it.
- Refunds have NO automated retry (payouts do, via Phase 5). reject/at-capacity refund failures ARE logged (ERR_REFUND_001/ERR_CHECKOUT_011) → manual recovery via error-log review. MEDIUM ops, by design.
- market-box payout transfer failure uses console.error not logError (market-box-payout.ts:135) → not in error_logs; visible via vendor_payouts.status='failed' + retried by cron Phase 5. LOW observability.
- Stripe line-item per-item rounding vs subtotal-aggregated (checkout/session) → ≤1-2¢ theoretical drift; pricing single-source otherwise solid.

### Auth / RLS / IDOR (agent afd0) — no confirmed bypass
- Helpers: auth/admin.ts requireAdmin/verifyAdminScope; markets/manager-auth.ts isMarketManager/getMarketManagerState. Pattern = getUser → RLS query → ownership check before service-client op.
- Spot-checked vendor/market-manager/admin/events routes: ownership/scope verified. Stripe + Resend webhooks verify signatures. booth-groups cancel checks profile.id===group.vendor_profile_id (afd0 claim).
- Open: agent didn't confirm newer SECURITY DEFINER fns revoked from anon, but mig 165 changelog says book_season_atomic REVOKEs PUBLIC+anon, GRANT service_role only. Trigger fns (handle_new_user) not directly callable = low risk.


