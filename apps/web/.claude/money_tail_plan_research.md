# Money-path efficiency + money-tail — anchor verification + fix plans (2026-07-18)

Working file. Checklist; each section written immediately after verification.

- [x] Cluster 1 fulfill: VOR-8 / VOR-9 / VOR-13
- [x] Cluster 2 checkout/session: CHK-11 / CHK-12 / CHK-15 / CHK-7
- [x] Cluster 3 reject + resolve-issue: VOR-10
- [x] Cluster 4 expire-orders: CRN-16 / CRN-3 / CRN-10 / CRN-5 (+ CRN-14 in vendor-quality-checks)
- [x] Cluster 5 webhooks: CHK-1 remainder (webhooks.ts + checkout/success)

## Cluster 1 — fulfill/route.ts (PROTECTED) — ALL 3 VERIFIED

**VOR-13 (efficiency) CONFIRMED, lines drifted from ledger (226-271 → 262-311):**
Three independent sequential awaits before payout insert:
- getVendorFeeBalance — fulfill:266
- tip count `order_items` count — fulfill:288-291 (only when tip_amount>0)
- existingPayout select — fulfill:306-311
All read-only, no interdependency (feeDeductionCents needs balance+vendor_payout_cents from the already-fetched orderItem; tipShare needs count; existingPayout needs orderItem.id). → Promise.all of 3.

**VOR-9 (money) CONFIRMED at fulfill:389-391 (ledger said 336-348, drifted):**
After successful transfer that withheld feeDeductionCents, recordFeeCredit throw → `crumb.logic('Fee credit recording failed, continuing with payout')` ONLY. Nothing in error_logs → withheld amount never credited to ledger → balance unchanged → NEXT payout deducts the same fee again (vendor double-charged). Sibling swallow on the transfer-FAILURE path at :422-424 (same class: fee withheld-for-retry recorded nowhere on failure).
Fix: logError (TracedError w/ new cataloged ERR code) in both catch blocks, keep non-blocking (payout tracking must still update). Error-code catalog is shrink-only baseline → adding a code = allowlist add w/ reason (per money-structure Rule E protocol).

**VOR-8 (money race) CONFIRMED, read-compute-deduct spans fulfill:262-281 (read/compute) → :302 (payout math) → :382-388 (credit write after transfer):**
Two near-simultaneous fulfills (two items, same vendor): both read balanceCents, both compute deduction up to full balance, both withhold from payout + both recordFeeCredit → ledger over-credited (balance can go negative) and vendor under-paid twice for the same debt.
NOTE: existing 23505 guard on vendor_payouts (:341) does NOT protect this — it's per-order-item, the race is per-vendor across different items.
Fix design (see plan): atomic claim RPC — single SQL that computes balance from ledger FOR UPDATE / or inserts the credit row atomically returning granted amount, called BEFORE the transfer; payout amount uses granted. Needs migration + vendor-fees.ts changes. Must be pre-migration-safe? No — code+migration ship in same batch, but code path must tolerate RPC-missing (fallback to 0 deduction = safe direction: no deduction, fee stays on ledger for next fulfill).
TODO: read lib/payments/vendor-fees.ts + schema for vendor fee ledger table before drafting SQL.

**vendor-fees.ts read (whole file):** balance = `vendor_fee_balance` (view/table, select at vendor-fees:84-88, fallback 0 on error); recordFeeCredit = plain insert vendor_fee_ledger type='credit' (:172-180); recordExternalPaymentFee has 23505 idempotency via partial unique idx on order_item_id (mig 155) but recordFeeCredit has NO idempotency/order_item tie. calculateAutoDeductAmount caps at 50% payout (:195-205).
**DESIGN CONCLUSION (folds VOR-8+9+13):** claim-first RPC `claim_vendor_fee_deduction(p_vendor_profile_id, p_max_deduct_cents, p_order_id, p_order_item_id)` — advisory xact lock on vendor id → compute balance → insert credit LEAST(balance, cap) w/ order_item_id idempotency → return granted_cents. Called ONCE before payout insert, replaces getVendorFeeBalance+calculateAutoDeductAmount+BOTH post-transfer recordFeeCredit blocks (fulfill:380-392, :412-425 disappear → VOR-9's swallow structurally gone; failure paths already treat fee-as-deducted, consistent). RPC error → granted=0 + logError (safe: fee stays on ledger). Dev path :465-473 uses same claim. Semantics match current transfer-failure path (credit recorded even when transfer pending retry — Phase 5 retries payout with deduction withheld).
NOTE: mirrors MGR-1 claim-first (mig pattern in 20260716_193 area); check RPC naming conventions at draft time. Schema gate: Read SCHEMA_SNAPSHOT vendor_fee_ledger + vendor_fee_balance sections immediately before drafting migration SQL.

## Cluster 2 — checkout/session/route.ts (PROTECTED) — ALL 4 VERIFIED (lines drifted)

**CHK-11 CONFIRMED at session:466-473 (ledger said 438-445):** `listings.map(l => supabase.rpc('is_listing_accepting_orders', {p_listing_id}))` — N RPCs. Batched `get_listings_accepting_status` exists + used in cart/validate (VERIFY signature at fix time — grep cart/validate). Fix: one batched call; keep per-listing detail only to build the error message for failing listing(s). Result shape mapping: cutoffResults consumed just below (need ~:480-520 read at fix time for consumer shape).

**CHK-12 CONFIRMED:** second `listings` select id,quantity at session:477-479 duplicates the parallel-batch select :261-278 (which lacks `quantity`). Fix: add `quantity` to :266 select, build inventoryMap from `listings`, drop :477-479 query.

**CHK-15 CONFIRMED:** pricing.ts:134 `vendorPercentFeeCents` = std FEES.vendorFeePercent; :139 platformFeeCents = buyer% + buyerFlat + vendor%(std) + vendorFlat. session:594 `platformFeeCents = orderPricing.platformFeeCents + smallOrderFeeCents` → orders.platform_fee_cents (:782). Per-item :567-569 honors vendorFeeOverrides. → order row overstates for discounted vendors. MB WRINKLE: pricingItems includes MB items (:536-549) but orderItems does not — Σ per-item fees over orderItems alone drops the MB percent portion. Fix: order-level percent portion = Σ orderItems.platform_fee_cents (override-aware) + MB percent at std (MB payout path has no override handling — matches actual money movement; note in code comment); keep + buyerFlat + vendorFlat + smallOrderFee. CONSISTENCY: ADM-2 platform-revenue helper doesn't consume orders.platform_fee_cents (uses total−payout−tipShare identity) → no report interaction.

**CHK-7 CONFIRMED, two halves:**
(a) Decrement-fail mid-loop: session:811-831 throws ERR_INVENTORY_001 mid-loop AFTER Stripe session created (:729) + order inserted (:773) + earlier items decremented. Order sits pending 10 min; cleanup then restoreOrderInventory restores ALL non-cancelled items (inventory.ts:57-77) incl. never-decremented ones → phantom stock. Fix: track decremented [{listingId,qty}] in loop; on failure: expire session (try/catch CHK-18 pattern) → guarded cancel items+order → restore ONLY tracked → rethrow.
(b) Cleanup restore-before-cancel: session:146 restore precedes :147-159 guarded cancel; concurrent cleanup (two checkouts, or checkout+cron) double-restores (restoreOrderInventory has no claim; guard is on the LATER update). Fix: reorder — guarded order_items cancel FIRST w/ .select('listing_id,quantity,status'), restore only returned rows (respect shouldRestoreInventory). SHARED HELPER with CRN-5 (expire-orders Phases 2/3): `cancelOrderItemsAndRestoreGuarded(...)` in lib/inventory.ts.

## Cluster 3 — reject + resolve-issue (reject = PROTECTED) — VOR-10 VERIFIED

**reject/route.ts:** order join :63 selects status/session-id/tip/subtotal — NO payment_method, NO payment_model. Refund block :157-162 `.single()` on succeeded payments (0 rows → error, ignored, payment=null); :164 `if (payment?.stripe_payment_intent_id)` silently skips refund. Item already cancelled + refund_amount_cents recorded (:129) + inventory restored (:151) → buyer never refunded, nothing logged. No stripe/company-paid gating at all.
**resolve-issue/route.ts:** gates `payment_method==='stripe'` :176 but `.single()` :183 + silent skip :185. Select :52 has payment_method, NOT payment_model. (Note: 2nd payments read :282-287 already uses maybeSingle.)
**Fix:** both routes — add payment_method+payment_model to order join; `.maybeSingle()`; when shouldCallStripeRefund (payment_method==='stripe' && payment_model!=='company_paid') and no succeeded row → logError (ERR_REFUND class) while keeping cancel; skip refund silently ONLY for external/company_paid.

## Cluster 4 — expire-orders (money-sensitive cron) + vendor-quality-checks — ALL VERIFIED

**CRN-3 CONFIRMED expire-orders:100-129:** gate counts exactly 6 work types (order_items active, orders pending, payouts failed/pending_stripe_setup, trialing vendors, standing holds, pending standing occurrences); workCount===0 → whole run returns (:121-128). Phases 8/9/11-15.5/16/17/18/19/20 work never counted. Fix (low-risk option): make workCount===0 skip ONLY Phases 1-7 (the phases the counts cover); tail phases always run (cheap when idle). Avoids adding count queries for date-based phases (9 retention, 20 season-end) that can't be counted cheaply.

**CRN-10 CONFIRMED :60 `maxDuration = 60`.** Fix: raise to 300 (Vercel Pro) + elapsed-time guard between phases (start timestamp; before each phase if elapsed > SOFT_BUDGET_MS (~270s) → logError naming last-completed phase + return partial summary). Check :1130-1133/:2740 comments at build time.

**CRN-5 CONFIRMED, Phases 2+3 restore-before-cancel:**
- Phase 2: restoreOrderInventory :376 BEFORE items cancel :379-388; order flip :392-396 guarded eq status pending (CRN-2).
- Phase 3: restore :460 BEFORE cancel :463-472; order flip :475-478 UNGUARDED (no .eq status pending — Phase 2 has it; include guard in fix; external-confirm mid-run race).
Fix: shared helper (with CHK-7b) `cancelOrderItemsAndRestoreGuarded(serviceClient, orderId, verticalId, cancelFields)` in lib/inventory.ts: (1) guarded order_items update .is('cancelled_at',null).select('listing_id,quantity,status'); (2) restore ONLY returned rows filtered by shouldRestoreInventory + grouped by listing (reuse restoreInventory per listing); (3) caller flips order guarded. Crash between cancel+restore = inventory NOT restored (conservative direction, no oversell; opposite of today's phantom-stock direction). Session-expire ordering (Phase 2 :365-373) unchanged.

**CRN-16 CONFIRMED, two parts (anchors drifted):**
- Phase 19 :3051-3053 fetches ENTIRE booth_credits table (no filter), groups+sums in JS :3061-3084. Fix: migration adds SQL aggregate (view or RPC `get_booth_credit_expiry_state()`) returning per (vendor_profile_id, market_id): balance_cents, has_live_grant, nearest_live_grant_expiry — mirrors JS semantics :3073-3084 exactly (grant rows = amount>0 AND source NOT IN (redeemed,expired); NULL expiry = live). JS keeps the decision logic on the small result set. Pre-migration-safe: RPC error → logError + skip phase (credits expire a day late, harmless). ALSO batch the warnings-loop N+1 (:3107-3108 per-warning vendor_profiles + markets selects → 2 .in() queries).
- Phase 16 notify loop :2852-2886: per-row `auth.admin.getUserById` :2868 (ledger said :2645, drifted). vendor_profiles already batch-loaded :2836. Fix: one user_profiles select('user_id,email').in(user_ids) → map → pass userEmail (EVT-16 pattern; user_profiles.email verified at notifications/service.ts:699-702). No auth admin calls. (sendNotificationBatch NOT usable — payload per-recipient: weekDate/marketName vary.)

**CRN-14 CONFIRMED vendor-quality-checks:93-96 vs :141-149:** supersede ALL active :93-96 runs BEFORE checks (:105-111 Promise.all — one check throws → outer catch, findings already wiped) and BEFORE insert; insert failure :145-146 console.error + CONTINUES → step 6 still notifies vendors about findings that don't exist. Fix: (1) move supersede AFTER successful insert — `.update({status:'superseded'}).eq('status','active').neq('batch_id', batchId)`; (2) gate steps 5→6: insert error → logError + skip notify + mark scan log failed; (3) if supersede fails post-insert → duplicates visible (benign) — logError. NOTE: this cron ≠ ADM-5's admin quality-scan route (that one is fixed + vertical-scoped); check at build time whether this cron ALSO needs the ADM-5 vertical scoping or is intentionally platform-wide (it's the daily cron — platform-wide is correct; supersede-by-batch_id exclusion handles it).

## Cluster 5 — CHK-1 remainder (webhooks.ts + checkout/success — BOTH PROTECTED) — VERIFIED

**Unguarded paid-flips CONFIRMED:** webhooks.ts:173-176 `update({status:'paid'}).eq('id',orderId)` unconditional; checkout/success:75-78 same. Reachable: webhook resend/late delivery after cron/cleanup cancelled the order (session-expire fixes make it rare, not impossible — expire-throw races, replays), stale-tab success hit.
**Refund pattern to mirror:** webhooks:277/:292 `createRefund(paymentIntentId, idempotencyKeyRef, amountCents)` + logError CRITICAL catch (ERR_WEBHOOK_011 style). handleChargeRefunded :1096-1106 does refunded bookkeeping when charge.refunded arrives (status flip cancelled→refunded handled there — do NOT hand-flip).
**Design (3-way branch, both files):**
1. Read order status first (webhook: add `status` to existing order select :187-191 + move before flip; success: add `status` to select :59-63).
2. pending → guarded flip `.update({status:'paid'}).eq('id',orderId).eq('status','pending')`.
3. paid/completed → skip flip, CONTINUE idempotent backfill (payment insert, fee capture, MB processing) — load-bearing resend path unchanged.
4. cancelled/refunded → NO flip. Still insert payments row idempotently (money moved — record it). Then full-amount auto-refund `createRefund(paymentIntentId, `${orderId}-dead-order`, session.amount_total)` + logError (new cataloged ERR_WEBHOOK code) + notify buyer (order_refunded template, COMM-6 channels) + SKIP MB processing. Success route same branch: refund + throw traced ERR_CHECKOUT (buyer sees "order expired — payment refunded"); webhook remains authoritative (idempotency key shared so double-refund impossible).
**Test interactions:** money-structure Rule A guarded-flips allowlist likely lists both bare paid-flips → entries REMOVED (sanctioned shrink direction). New ERR codes → Rule E catalog additions. R8 (webhooks sole paid-writer for park bookings) untouched.

## Batch/approval structure (proposed)
1. Batch F (fulfill): VOR-8+9+13 + mig 197 claim RPC. Files: fulfill/route.ts (PROTECTED), vendor-fees.ts, migration. Pre-mig-safe: RPC error → deduction 0 + logError.
2. Batch C (checkout/session): CHK-11+12+15 + CHK-7a+7b + lib/inventory.ts guarded helper. File: checkout/session (PROTECTED), lib/inventory.ts.
3. Batch R (reject/resolve-issue): VOR-10. Files: reject (PROTECTED), resolve-issue.
4. Batch X (crons): CRN-3+10+5(uses helper)+16 + mig 198 booth-credit aggregate + CRN-14. Files: expire-orders, vendor-quality-checks, migration.
5. Batch W (webhooks): CHK-1 remainder. Files: webhooks.ts (PROTECTED), checkout/success (PROTECTED).
Each: build → tsc/vitest → STOP commit ask → STOP push ask. Schema gate runs at SQL-draft time (SCHEMA_SNAPSHOT read for vendor_fee_ledger/vendor_fee_balance, booth_credits immediately before composing).
Deferred/not planned: CRN-11 (recommend leave open/wontfix — daily+lazy now), NOT-5, PRK-13. VOR-11 + PRK-10 = user decisions, not planned here.
