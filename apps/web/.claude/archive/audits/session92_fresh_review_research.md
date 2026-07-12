# Session 92 — Fresh End-to-End Code & System Review

Started: 2026-06-11
Constraint: NO prior audit/session files read (user-directed pure analysis). Code is the only source.
Method: Explore agents locate candidates → Claude personally reads + verifies each → only verified findings presented (path:line cited).

## Scope checklist (component areas)

- [ ] A. Auth & authorization (middleware, admin/manager/vendor auth helpers, IDOR patterns in API routes)
- [ ] B. Payments critical path (cart → checkout → webhooks → payouts; pricing; refunds)
- [ ] C. Service-client usage & RLS reliance (routes using service client; ownership checks)
- [ ] D. Cron routes (auth gating, idempotency, partial-failure behavior)
- [ ] E. Vertical isolation (missing vertical_id filters)
- [ ] F. Client-side exposure (NEXT_PUBLIC usage, over-broad selects returned to client)
- [ ] G. Efficiency (N+1, sequential waterfalls, oversized payloads, missing caching)
- [ ] H. Input validation + rate limiting coverage
- [ ] I. Storage/uploads (bucket access, path traversal, signed URLs)
- [ ] J. Webhooks (signature verification, idempotency, event handling gaps)

## Verified findings (Claude-read, cited)

### F1 [CONFIRMED, MED — financial integrity] Phase 3.6 auto-confirm can double-bill vendor fees on retry
- Selection: expire-orders/route.ts:531-533 (`status='pending'`, `external_payment_confirmed_at IS NULL`) — failed orders re-picked every hourly run
- Fees inserted BEFORE status flip: :557-564 (per-item `recordExternalPaymentFee`) then :567-575 (order→paid)
- `recordExternalPaymentFee` = bare INSERT, no idempotency: vendor-fees.ts:130-138
- NO unique constraint on vendor_fee_ledger: mig 20260131_003:71-79 (only PK; indexes non-unique :89-90)
- Ledger drives real deductions from Stripe payouts (`calculateAutoDeductAmount`, vendor-fees.ts:186-196) → duplicate debit = vendor loses real money
- Fix shape: partial unique index (order_id, vendor_profile_id) WHERE type='debit' + ON CONFLICT DO NOTHING, or pre-check; also flip order: confirm first, then fees

### F2 [CONFIRMED, LOW-MED — financial, small $] Client-controlled tipPercentage unbounded → shifts platform tip slice to vendor + bad DB data
- checkout/session/route.ts:76 — `Math.max(0, Math.round(tipPercentage))`, NO upper cap (tipAmountCents IS capped 0..5000 at :75)
- :569-572 — huge pct ⇒ vendorTipCents = full validTipAmount, tipOnPlatformFeeCents = 0
- :748 — raw pct persisted to orders.tip_percentage
- fulfill/route.ts:246 — vendor tip = tip_amount − tip_on_platform_fee_cents ⇒ platform's tip-on-fee slice goes to vendor. Charged amount unaffected. Fix: cap pct (≤100) or recompute split server-side

### F3 [CONFIRMED, LOW-MED — ops gap] Failed auto-refund has no retry path
- webhooks.ts:236-246 — refund failure logs ERR_WEBHOOK_011 CRITICAL but handler swallows → 200 → Stripe never resends. Recovery = manual via error-log review (Protocol 8 covers it). Same shape at :250-257 (at-capacity refund)

### F4 [CONFIRMED, MED-HIGH — silent money loss, invisible to error review] Failed Stripe refunds bypass error_logs in BOTH refund paths
- `createRefund` throws on Stripe failure (payments.ts:244-258, no internal catch)
- Cron Phase 1: expire-orders/route.ts:229-236 — catch is `console.error('[REFUND_FAILED]...')` ONLY (no logError). Item already claimed cancelled at :171-182 → next run skips → no retry, no error_logs row
- Buyer cancel: cancel/route.ts:233-242 — same console-only catch, literal `// TODO: Send admin notification for failed refund`
- Net: buyer charged, item cancelled, refund never happened, and Protocol 8 error-log review CANNOT see it (only Vercel logs, which expire)
- Contrast: webhook MB path uses logError CRITICAL (webhooks.ts:241) — these two predate that pattern

### F5 [CONFIRMED, HIGH — silent under-refund] createRefund idempotency key collides for same-priced items on one order
- payments.ts:245 — `idempotencyKey = 'refund-' + paymentIntentId + '-' + (amount ?? 'full')`
- Same order = same payment intent. Two items with identical price → identical amount → IDENTICAL key. Stripe idempotency (24h window): second call returns the FIRST refund's cached response — no second refund is created, no error raised
- Affected callers (all per-item, all same-PI): buyer cancel cancel/route.ts:225; cron Phase 1 expire-orders:228 (two same-priced items expiring in the same run = guaranteed <24h apart); webhook MB refunds webhooks.ts:237+251 (two same-priced offerings)
- Buyer cancel even stamps BOTH items 'refunded' + stores the same refund.id (cancel/route.ts:226-232)
- Fix shape: include order_item id (or item-unique suffix) in the key — still deterministic, no Date.now()

### F6 [CONFIRMED, MED — scale/efficiency] expire-orders cron N+1 inside 60s budget
- maxDuration=60: expire-orders/route.ts:52; batch limit(100): :152
- Per item: count query :160-163 + remaining-items query :202-206 + payments query :219-224, plus restoreInventory RPC, Stripe refund, 2 notifications — all sequential
- ~5-7 round-trips × 100 items per phase, and this is Phase 1 of ~8 phases in one invocation. Timeout risk at modest scale; prefetch/batch by order_id collapses the 3 queries to 3 total
- Same shape (1 count/vendor) surveys/route.ts:263-270 — minor by comparison (notification sends dominate)

### Discarded after verification
- D1: ".env.local committed to git" (agent 3) — FALSE. Untracked (`git ls-files` no match), ignored at apps/web/.gitignore:36, zero history across all refs
- D2: "market-box vendor payout skipped if success handler dies" (agent 2) — FALSE. Webhook runs MB processing on EVERY delivery outside the existingPayment guard (webhooks.ts:201-205) and calls processMarketBoxPayout even when subscription already_existed (:258-270)
- D3: "cron Phase 1 duplicate notifications on overlap" (agent 4) — overstated. Conditional UPDATE `.is('cancelled_at', null)` + zero-rows skip (expire-orders:171-194) claims the item before any notification; overlapping runs skip. Crash-between leaves UNDER-notify, not dup
- D4: "public schedule page leaks stripe fields via select('*')" (agent 5) — server component; only derived vendorName/profile_image_url used ([vendorId]/schedule/page.tsx:79-81). select('*') is trivial inefficiency only
- D5: "admin tables serialize PII to client" (agent 5) — admin-only pages rendering those exact fields in the table; by-design
- D6: vendor orders bulk sequential fetches (vendor/orders/page.tsx:318-343) — real but small (per-order item counts are tiny; fulfill triggers Stripe transfers where sequential is arguably safer). Not significant
- D7: /api/listings cross-vertical vendor_id probe — listings are public browse data; not significant
- D8: /api/submit categories array uncapped — minor hardening, not significant

## Checklist status: A-J all covered (agents swept; Claude verified every presented claim)
Positives (agent consensus, spot-verified): 4/4 cron routes CRON_SECRET timing-safe; Stripe+Svix webhook signature verification; storage buckets private w/ path-validated signed-URL endpoint; consistent auth-gate-before-service-client (~170 sites); NEXT_PUBLIC vars all public-by-design; RLS posture solid; .env.local properly gitignored.

## Candidates pending verification

(agent-reported, NOT yet presented to user)

- [ ] V1 (FINANCIAL): tipPercentage from client written to DB unvalidated — checkout/session/route.ts ~64-87, ~749
- [ ] V2 (FINANCIAL): market-box vendor-payout gap if success handler dies — checkout/success ~91-298 vs webhooks.ts ~205-277 (agent self-contradicts: code comment claims webhook backfills on every delivery)
- [ ] V3 (FINANCIAL): failed auto-refund has no retry queue — webhooks.ts ~236-246
- [ ] V4 (FINANCIAL): cron Phase 3.6 fee recorded then order-update could fail → double fee on retry — expire-orders ~556-607
- [ ] V5: cron notification duplication on overlapping runs (Phases 1/3.5/4 lack the Phase 4.5 dedup set) — expire-orders ~152-179 vs ~810-822
- [ ] V6 (SECURITY?): agent claims .env.local is IN GIT — verify with git ls-files (suspect false: gitignored)
- [ ] V7 (EFFICIENCY): expire-orders cron N+1 (3 queries per expired item) — ~157-272
- [ ] V8 (EFFICIENCY): surveys cron N+1 per-vendor/buyer count queries — ~262-271, ~377-385
- [ ] V9 (EFFICIENCY): vendor orders page bulk actions = sequential per-item fetches — vendor/orders/page.tsx ~318-341
- [ ] V10: public vendor schedule page select('*') — does stripe_account_id reach client? — [vertical]/vendor/[vendorId]/schedule/page.tsx ~69
- [ ] V11: /api/listings vendor_id param cross-vertical leak — listings/route.ts ~14-71
- [ ] V12: /api/submit categories array unbounded — submit/route.ts ~149-154
- [ ] V13: admin tables serialize PII to client components — admin/users page ~69-86, VendorsTableClient (likely by-design if displayed; verify)

Agent consensus GOOD: cron auth (4/4 CRON_SECRET timing-safe), webhook signatures (Stripe + Svix), storage buckets private + signed-URL path validation, service-client auth-gate pattern consistent (~170 sites), NEXT_PUBLIC vars all safe, RLS posture solid.

## Discarded candidates (verified not-an-issue)

(documented to avoid re-investigation)
