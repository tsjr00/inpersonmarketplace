# VIP Work Full Code Review — 2026-09-04 (post-compaction verification pass)

Owner request: session crossed auto-compaction mid-build; review ALL VIP work from today
(commits 3e3cdaa9 A1 → d09707d3 A2 → 826b7623 A3 → cec32fb5 B1 → d4778507 punch)
for correctness + cross-file conflicts. REPORT ONLY — no fixes without approval.

## Checklist — ALL COMPLETE (review done same session, 2026-09-04)
- [x] 1. offers.ts — full read ✓ (cosmetic notes only)
- [x] 2. offers-checkout.ts — full read ✓ (design notes, fails closed)
- [x] 3. migs 242+243 vs code ✓ (one stale comment in 243)
- [x] 4. checkout/session ✓ (net-storage correct; fees/tip/floor verified)
- [x] 5. preview + page mirror → **F1 rounding drift found**
- [x] 6. VipPerksCard ↔ API ↔ parsers ✓ field names match exactly → **F2 no tier check on PUT**
- [x] 7. evaluate.ts ✓ (dedup chain verified to service.ts:141 data persist + NOT-1)
- [x] 8. favorites ✓ service client throughout; cross-vertical VIP rows note
- [x] 9. A1 ✓ (classifier reuse, names-only)
- [x] 10. A2 ✓ (cap TOCTOU note; re-add re-notify doc ambiguity)
- [x] 11. A3 ✓ (one send site, dedup 20h, cron isolated)
- [x] 12. types.ts registry ✓ fallbacks; vendor-limits: FM tiers → free → VIP is FT-only in effect
- [x] 13. RLS/service-client discipline ✓ every reader of the two RLS-deny tables uses service client; all new routes auth'd + rate-limited; fulfill-route evaluation hook EXISTS (ping fires post-fulfill)
- [x] pricing.ts:123-131 re-verified: sum-then-round → qty-folded net identity claim holds

## FIXES APPLIED (owner: "yes, fix them both" 2026-09-04)
- **F1 FIXED**: checkout page now keeps discounts PER LISTING (vipDiscountsByListing) and computes the VIP-deal display as (per-item display sum − round(net_listing×1.065)) per listing — exact mirror of session:855-866 consolidation. Verified example: $10×2 −$1 → subtotal 2130, deal −106, net 2024 = Stripe line.
- **F2 FIXED**: api/vendor/offers PUT gates on getTierLimits(...).vipCustomers > 0 (ERR_VIP_TIER 403). resolveVendor now selects tier.
- Both pinned in the punch flow-integrity guard (vipCustomers in offers API; vipDiscountsByListing in page).
- Gates: tsc ✓ · vitest 2145/2145 ✓ · lint 0 errors. UNCOMMITTED.

### F2 — LOW: /api/vendor/offers PUT checks ownership but not tier
A free-tier vendor (incl. one downgraded with retained VIPs) can enable perks by
direct API call; UI hides the card at limit 0. Vendor-funded + VIP-gated at
checkout, so the only money at risk is the vendor's own choice. Optional
tightening: vipCustomers > 0 check in PUT.

## Findings

### F1 — CONFIRMED (arithmetic): checkout page total can differ from Stripe total by ~1¢ per discounted listing
- Stripe discounted line = `Math.round(listingNet × 1.065)` per listing (session/route.ts:864).
- Page mirror = Σ `round(unit×1.065)×qty` − `round(discountTOTAL×1.065)` (checkout/page.tsx displaySubtotal/vipDiscountDisplayCents).
- Example: $10.00×2, $1.00 discount → Stripe 2024¢ vs page 2023¢ (2130−107). Both +15¢ flat → 20.39 vs 20.38.
- Display-only (DB and Stripe are consistent w/ each other via their own paths); violates the "can never disagree" doc claim. Fix shape: page should mirror per-listing `round(net×1.065)` using the preview's per-listing discounts (endpoint already returns them).
- DB orders.total_cents = round(netSum×1.065)+flat (sum-then-round) vs Stripe per-item rounding — PRE-EXISTING platform-wide difference, not today's.

### N1 — notes (cosmetic/design, no action needed unless owner wants)
- offers.ts:16-19 header still says punch "arrives with the punch-card build" (it arrived, same file).
- offers.ts:176 comment "largest items first" — actually array order; still deterministic + conserving.
- mig 243:26 comment documents punch config as {visits, reward_pct} — real shape richer (reward_type/min_purchase_cents/reward_amount_cents). Comment-only.
- offers-checkout: engine fails CLOSED on query errors (no discount) — correct direction for money.
- punchState: a redeemed-then-REFUNDED order still moves the anchor (buyer loses the earned reward without getting value). Edge case, design note.
- punchState: equal-value tie punch vs threshold consumes the punch (punchDiscount >= threshold). Slightly anti-buyer on exact ties; deterministic.
- punchState counts NET subtotal_cents — a discounted order can dip below qualifying threshold. Conceptual nuance, thresholds are small ($5/$10).
- Redemption order can't punch itself (gt anchor, same-statement created_at). Consistent with reset semantics.

## Verified-clean items
- offers.ts parsers/bounds/math — full read, matches VipPerksCard save shapes + API bounds. 100%-waiver correct.
- allocateDiscount conserves exactly (floor+remainder, capped at slice).
- mig 242/243 columns == every code reference read so far. RLS-no-policies on both new tables → service-client-only readers required (checking each).
- session route: computeCartDiscounts(serviceClient ✓, list-price subtotals ✓); orderItems store net/list/discount/offer_id correctly (session:638-641); fees+payout on net (:626-643); smallOrderFee on net sum (:606) == page baseSubtotal net ✓; 50¢ floor after full total incl. tip/chipin (:710) ✓; tip caps on LISTING net subtotal (:724-726) — CHK-14 semantics preserved under discounts ✓.
