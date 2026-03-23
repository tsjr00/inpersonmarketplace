# Decision Log

Structured record of business and architecture decisions. Check here before asking "what did we decide about X?"

| Date | Category | Decision | Rationale | Reversible? | Session |
|------|----------|----------|-----------|-------------|---------|
| 2026-02-28 | Business | Vendor trial = 90 days, grace = 14 days | Industry standard, generous enough to prove value | Yes | 48 |
| 2026-02-28 | Business | Trial auto-grants Basic tier (FT) | Lowest paid tier gives real value without giving everything away | Yes | 48 |
| 2026-02-28 | Architecture | Market box payout at checkout, not per-pickup | Prepaid model — vendor should get paid when buyer pays | No (would require migration) | 48 |
| 2026-03-05 | Business | FM Premium = $25/mo (was $24.99) | Clean number, user requested | Yes | 50 |
| 2026-03-05 | Business | FT Pro = $25/mo (was $30), matches FM Premium | Unified pricing across verticals | Yes | 50 |
| 2026-03-05 | Business | FT annual pricing = same as FM annual | Consistency: Basic $81.50/yr, Pro $208.15/yr, Boss $481.50/yr | Yes | 50 |
| 2026-03-05 | Business | FM Premium annual stays $208.15/yr (not rounded to $210) | User chose to keep existing amount despite $25 monthly | Yes | 50 |
| 2026-02-22 | Architecture | Vendor quality checks = nightly cron (Phase 8) | Don't slow down real-time operations with quality scoring | Yes | 42 |
| 2026-02-20 | Financial | Tip % applied to displaySubtotal (per-item rounded) | Matches Stripe line items, avoids penny discrepancies | No | 40 |
| 2026-02-20 | Financial | Platform fee tip tracked in `tip_on_platform_fee_cents` | Vendor gets tip on food only, platform fee tip is separate | No | 40 |
| 2026-02-20 | UX | `ConfirmDialog` replaces all `window.confirm/prompt/alert` | Mobile browsers block native dialogs | No (72 instances replaced) | 40 |
| 2026-03-04 | Architecture | Upstash Redis for rate limiting (sliding window) | Shared across Vercel instances, free tier 10K cmds/day | Yes | 49 |
| 2026-03-04 | Architecture | Sentry via `SentryInit.tsx` client component | v10 doesn't auto-load `sentry.client.config.ts` via webpack | Yes | 49 |
| 2026-03-04 | Security | Password policy: min 9, upper+lower+number+special | Set in Supabase Auth for all 3 environments | Yes (Supabase dashboard) | 49 |
| 2026-03-04 | Architecture | `checkRateLimit()` is async (returns Promise) | Required for Upstash Redis, falls back to in-memory sync | No (181 call sites changed) | 49 |
| 2026-03-04 | Legal | 3-tier legal terms system (VIIIXV LLC d/b/a 815 Enterprises) | Proper legal structure for multi-vertical platform | Yes | 49 |
| 2026-02-22 | UX | Location persists via httpOnly cookie (30-day TTL) | User shouldn't re-enter zip every page visit | Yes | 44 |
| 2026-02-22 | UX | Browse page: 50 items/page with pagination | Performance + usability balance | Yes | 44 |
| 2026-02-28 | Infrastructure | Resend email: `updates@mail.[domain]` (not noreply@) | Better deliverability, clearer branding | Yes | 47 |
| 2026-02-28 | Infrastructure | Per-vertical email FROM domains | FM → farmersmarketing.app, FT → foodtruckn.app | Yes | 47 |
| 2026-03-20 | Financial | External payment fee flow: vendor fees deferred, not upfront | External orders set `vendor_payout_cents = subtotal` at checkout (vendor gets full amount). 3.5% vendor fee is recorded to `vendor_fee_ledger` LATER when vendor confirms payment received (non-cash: at confirm-external-payment; cash: at fulfill). Buyer pays 6.5% (no $0.15 flat fee). This differs from Stripe intentionally — no processing cost on external payments. See detailed flow doc below. | No — 5 files coordinate | 62 |
| 2026-03-20 | Financial | External payment refund policy: buyer handles directly with vendor | Platform does not process refunds for external payments. Buyer sees disclaimer at checkout and when reporting issues. Vendor manages refund directly via Venmo/CashApp/PayPal/cash. | No | 62 |

| 2026-03-20 | Financial | Stripe refund fee absorption: platform absorbs Stripe processing fee on refunds | When a refund is issued via Stripe, Stripe keeps their processing fee (~2.9% + $0.30). Platform absorbs this cost — buyer gets full refund of what they paid. May revisit if refund volume becomes significant. | Yes | 62 |
| 2026-03-20 | Financial | Refund amount = full buyer-paid amount (subtotal + 6.5% + prorated $0.15) | All refund paths (reject, cancel, resolve-issue, cron-expire) must refund what the buyer actually paid, not just the base subtotal. Per-item: `subtotal + round(subtotal * 6.5%) + floor($0.15 / totalItemsInOrder)`. | No | 62 |
| 2026-03-21 | Infrastructure | Per-vertical Stripe products for vendor subscriptions | Each vertical has its own Stripe products (separate branding on receipts/statements). FM: prod_U5sVZr6rwkfgHr (Pro), prod_U5sXaUbbjuw4c0 (Boss). FT: prod_U5sAqiVY7EzueR (Pro), prod_U5sNbxPjwJLfbp (Boss). Buyer Premium: prod_U5sZyHKKnvsA0p (shared). Future verticals will have their own products with potentially different pricing. | No | 62 |
| 2026-03-20 | Financial | Market box missed pickup = no refund | Buyer makes a 4-week (or 8-week) prepaid commitment. Missed pickups are the buyer's responsibility. No refund, no credit. This differs from regular orders where no-shows trigger refunds. | No | 62 |
| 2026-03-20 | Business | Trial tier = 'free' for all verticals | When admin approves a new vendor, trial grants 'free' tier (90 days, 14-day grace). Previously set legacy names ('basic' for FT, 'standard' for FM) which didn't match the unified Free/Pro/Boss system. | No | 62 |
| 2026-03-20 | Business | FT fulfilled items do not restore inventory on refund | When a food truck order item is refunded after fulfillment (buyer picked up food), inventory is NOT restored — cooked food cannot be resold. FM fulfilled items DO restore inventory (produce/goods can potentially be resold). Non-fulfilled items always restore regardless of vertical. | No | 62 |
| 2026-03-23 | Business | Catering pre-order minimum = 10 items per vendor | Catering orders (advance_order_days > 0) require minimum 10 items per vendor. Separate from private event orders. Both require event-approved vendor status. | No | 63 |
| 2026-03-23 | Business | Catering advance notice tiers by size | 10-29 items: 1 day ahead. 30-49 items: 2 days ahead. 50+ items: 3 days ahead. More notice preferred. All require prepayment. | No | 63 |
| 2026-03-23 | Financial | Event per-truck fee = $75 | Charged per truck to event organizer. Due with 50% deposit when agreement is signed/uploaded. Separate from transaction fees. | No | 63 |
| 2026-03-23 | Financial | Event transaction fees = normal platform fees | Event orders use standard 6.5% buyer + 6.5% vendor fee structure. No separate event percentage — the 13% total already exceeds the 10% target. | No | 63 |
| 2026-03-23 | Business | Event approval gates advance ordering AND events | Intentional coupling: event-approved status is a quality gate ensuring vendors have systems/staff for multi-day advance orders. Also feeds the event pipeline ($75/truck + transaction fees). Incentivizes vendors to get event-ready. | No | 63 |

### External Payment Fee Flow — Protected Architecture (Session 62)

**DO NOT modify any of these files without understanding the full flow first.**

**Flow:**
1. **Checkout** (`api/checkout/external/route.ts`): Creates order with `vendor_payout_cents = subtotal` (full amount). Buyer charged `subtotal + 6.5%`. No vendor fee recorded yet — vendor hasn't received payment.
2. **Vendor confirms payment** (`api/vendor/orders/[id]/confirm-external-payment/route.ts:106-123`): For non-cash methods (Venmo/CashApp/PayPal), calls `recordExternalPaymentFee()` which writes 3.5% vendor fee to `vendor_fee_ledger`. Cash orders skip this — deferred to fulfill.
3. **Vendor fulfills** (`api/vendor/orders/[id]/fulfill/route.ts:153`): For cash orders, `recordExternalPaymentFee()` is called here.
4. **Fee accumulates** in `vendor_fee_balance` view. When balance >= $50 or oldest entry > 40 days, vendor must pay.
5. **Auto-deduction** (`vendor-fees.ts:186-196`): Platform can auto-deduct up to 50% of Stripe payouts to recover external payment fees.

**Key files:**
- `src/lib/payments/vendor-fees.ts` — Fee calculation functions + ledger operations
- `src/app/api/checkout/external/route.ts` — External order creation
- `src/app/api/vendor/orders/[id]/confirm-external-payment/route.ts` — Fee recording for non-cash
- `src/app/api/vendor/orders/[id]/fulfill/route.ts` — Fee recording for cash
- `src/lib/pricing.ts` — Stripe fee constants (6.5% + $0.15)

**Why fees differ:** No Stripe processing cost on external payments, so platform charges less (3.5% seller vs 6.5% Stripe). Buyer fee is same 6.5% but no $0.15 flat fee (no processing to cover).
