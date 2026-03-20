# Session 62 — Independent Codebase Audit Research

Working file. Findings written per-area as they are discovered.

---

## Area 1: Auth System — COMPLETE

### Findings:
1. **Duplicate `UserRole` type definition** — Defined in both `src/lib/auth/roles.ts:9` and `src/lib/auth/admin.ts:5`. These could drift. Should be a single export.
2. **`roles.ts` includes `platform_admin` but DB `is_platform_admin()` checks `role='admin'`** — The DB function and JS code use different logic for admin detection. DB function `is_platform_admin()` checks `role = 'admin'` (from migration 078 fix), but JS `isPlatformAdmin()` checks for `'platform_admin'`. If the DB and code disagree on what makes someone an admin, API routes using `verifyAdminForApi()` (JS) vs RLS policies using `is_platform_admin()` (SQL) could authorize differently.
3. **Login page lazy profile creation** — `login/page.tsx:80` calls `ensure_user_profile` RPC. Need to verify this RPC exists and handles the case where profile already exists (upsert vs insert).
4. **`canUseTraditionalMarket` returns misleading limit message** — `vendor-limits.ts:453` says "Your current plan allows 3 locations" but the free tier limit is `traditionalMarkets: 3`. This is correct for free, but the message is hardcoded — if limits change, message won't update.

## Area 2: Pricing & Financial Flows — COMPLETE

### Findings:
5. **CRITICAL: External payment fees differ from Stripe fees** — `external/route.ts` charges buyer 6.5% only (no $0.15 flat fee). Stripe orders charge 6.5% + $0.15. Same item costs different amounts depending on payment method. Violates pricing.ts single-source-of-truth.
6. **CRITICAL: External orders don't deduct vendor fees** — `external/route.ts:276` sets `vendor_payout_cents: itemSubtotal` (full amount). Vendor gets 100% on external orders vs ~93% on Stripe orders. Platform absorbs all fees.
7. **CRITICAL: External payment vendor fees never recorded in ledger** — `recordExternalPaymentFee()` exists in `vendor-fees.ts` but is never called from the external checkout route. Fee balance never accumulates.
8. **External fee structure (3.5%) defined outside pricing.ts** — `vendor-fees.ts:15` defines `SELLER_FEE_PERCENT = 3.5` separate from pricing.ts's 6.5%. No business rule documented for why external is different.
9. **Market box payout silently skipped if price is zero** — `checkout/success.ts:548` returns silently if `basePriceCents <= 0`. No error logged.
10. **Tip split ambiguity** — `session/route.ts:541-547` caps vendor tip at `subtotalCents * tipPercentage / 100`. If buyer tips a flat amount larger than that cap, platform keeps the difference. No documented business rule for this behavior.

## Area 3: Order Lifecycle — COMPLETE

### Findings:
11. **CRITICAL: Resolve-issue refund missing buyer fees** — `resolve-issue/route.ts:138,163` refunds only `subtotal_cents`, not the buyer's actual paid amount (subtotal + 6.5% + prorated flat fee). Buyer loses fees on refund.
12. **CRITICAL: Inconsistent refund calculations across 4 paths** — reject (correct), buyer-cancel (correct), resolve-issue (wrong — subtotal only), cron-expire (correct). Three different methods for the same operation.
13. **Double-payout protection inconsistency** — All routes check `.neq('status', 'failed')` but a failed payout + retry creates a window for duplicate inserts. DB constraint is the real safety net.
14. **External payment refund has no tracking** — When vendor refunds a cash/venmo order via resolve-issue, there's no mechanism to verify vendor actually sent the money back.
15. **Order expiration doesn't notify vendor** — Cron `expire-orders` Phase 1 only notifies buyer when vendor failed to confirm. Vendor doesn't know the order disappeared.
16. **Buyer cancel RLS workaround** — `buyer/orders/[id]/cancel:44` fetches 50 orders as workaround for broken `order_items_select` RLS policy. If buyer has >50 orders, cancel will 404 on older items.
17. **Resolve-issue restores inventory even after fulfillment** — `resolve-issue:146-149` calls restoreInventory without checking if item was already picked up by buyer.

## Area 4: Notifications & Cron — COMPLETE

### Findings:
18. **20+ vendor notification titles hardcoded in English** — `types.ts:325-642` vendor notifications use string literals while buyer notifications use `t()` translation function. Breaks i18n for vendors.
19. **Market box missed pickup doesn't process refund** — `expire-orders:968-1005` marks pickup as missed but doesn't refund buyer or process vendor payout. Regular order no-shows DO trigger refunds.
20. **Timezone issue in Phase 4.7 cron** — `expire-orders:919-921` uses `new Date().setHours(h-2)` which on UTC Vercel can produce wrong date when crossing midnight.
21. **Stale notification dedup uses unreliable data key** — `expire-orders:805` builds dedup set from `n.data?.orderItemId` which could be undefined if notification data is corrupted.
22. **Date formatting uses server timezone** — `expire-orders:995` uses `toLocaleDateString()` which formats in UTC on Vercel, potentially showing wrong day to users.

## Area 5: Vendor Onboarding & Events — COMPLETE

### Findings:
23. **No event_approved check when admin invites vendors** — `admin/events/[id]/invite/route.ts:101` selects vendors by ID without filtering `event_approved=true`. Admin can invite vendors who aren't event-ready.
24. **FT doc type validation is loose** — `category-documents/route.ts:66` checks `docType !== category` but doesn't validate against `FOOD_TRUCK_DOC_TYPES` list. A fabricated permit type would pass if both params match.
25. **JSONB race condition on document upload** — Category docs, COI, and business docs all use read→modify→write pattern on JSONB without row locking. Concurrent uploads could lose a document.
26. **Event requests accept past dates** — `event-requests/route.ts` validates headcount range (10-5000) but doesn't validate `event_date >= today`. Past-date events can be created.
27. **Event market created before any vendors invited** — `admin/events/route.ts:210-230` creates market immediately on event approval. Buyer could access empty event URL before vendors accept.
28. **External buyer fee constant undocumented** — `settlement/route.ts:280` uses `EXTERNAL_BUYER_FEE_FIXED_CENTS` — not defined in pricing.ts and no business rule documented.

## Area 6: Market Box / Chef Box Subscriptions — COMPLETE

### Findings:
29. **No proactive pickup reminder notifications** — Buyer gets notified when vendor marks ready, but no "your pickup is tomorrow" reminder. No subscription completion notification either.
30. **Market box offering deactivation race** — Vendor can deactivate offering between buyer starting checkout and webhook completing. RPC `subscribe_to_market_box_if_capacity` may not re-check `active` flag.
31. **Market box missed pickup doesn't trigger refund** — (Duplicate of #19) Confirmed: `expire-orders:968-1005` marks missed but no financial processing unlike regular orders.

## Area 7: Browse, Location, Cart & Inventory — COMPLETE

### Findings:
32. **Cart validation endpoints missing vertical scope** — GET `/api/cart/validate` queries cart_items without vertical filter. POST accepts listing IDs without validating vertical match. Cross-vertical cart could pass validation.
33. **Market box add-to-cart doesn't validate vertical** — `cart/items/route.ts:299-327` doesn't check `offering.vertical_id == request.vertical`. FM cart could receive FT market box offering.
34. **Cart remove endpoint is a stub** — `cart/remove/route.ts:5-18` returns `{ success: true }` without actually removing anything. Removal happens via DELETE `cart/items/[id]` instead. Dead code.
35. **Silent geocode failure on browse** — If `?zip=` geocoding fails, browse silently falls back to cookie location. User thinks they're viewing listings for entered ZIP but sees previous location results.
36. **Radius changes are ephemeral** — PATCH `/api/buyer/location` updates cookie only, not user profile. Radius resets on new session/device.

## Area 8: Existing Test Coverage — COMPLETE

### Findings:
37. **Event system has ZERO test coverage** — No tests for invites, RSVPs, settlement, cancellation, capacity. Entire feature is untested.
38. **Refund calculation has ZERO test coverage** — 3 different refund paths (reject, cancel, resolve-issue) with different amounts, none tested. No business rule specifying each path's refund percentage.
39. **Tip splitting logic untested** — No test for how tip is split between vendor and platform. No business rule documented.
40. **Cart cross-vertical isolation untested** — No test preventing FM items + FT items in same cart.
41. **Market box payout lifecycle untested** — Subscription lifecycle integration tests exist but have many `.todo()` placeholders. No test for skip-refund, cancellation-refund, or missed-pickup handling.
42. **Concurrent order race conditions untested** — No test for two buyers trying to buy last item simultaneously.
43. **14 business rule categories with zero coverage** — Including: refund amounts, tip allocation, event lifecycle, market box inventory/skip, trial grace period, subscription auto-renewal, admin-only endpoints.

## Area 9: API Route Security — COMPLETE

### Findings:
44. **API security is strong overall** — 15-route sample shows 100% auth on protected routes, 100% error tracing, 98% rate limiting.
45. **`/api/trucks/where-today` missing rate limit** — Public read-only endpoint with no rate limiting. Low risk but should be added.
46. **Public form routes (vendor-leads, support) use service client without auth** — Intentional for public forms but not documented with inline comments.

## Area 10: Code-DB Alignment & Opportunities — COMPLETE

### Findings:
47. **CRITICAL: Admin vendor approval sets legacy tier names** — `admin/vendors/[id]/approve/route.ts:85` sets `tier = 'basic'` (FT) or `'standard'` (FM) instead of `'free'`. Every newly approved vendor gets a legacy tier name that doesn't match the unified Free/Pro/Boss system.
48. **Admin vendor table uses legacy tier filters** — `VendorsTableClient.tsx:223-225` dropdown offers Standard/Premium/Featured — names that no longer exist in DB. Filtering by these returns zero results.
49. **Admin vendor tier badge colors reference legacy names** — `VendorsTableClient.tsx:352-356` colors based on 'premium'/'featured' — Pro/Boss vendors show grey fallback colors.
50. **Migration 085 not in migration log** — `ensure_user_profile` RPC used by login page (lazy profile creation) is in migration 085, but this migration is NOT in MIGRATION_LOG.md. Status of application to all environments is unclear.
51. **Login page calls unverified RPC** — `login/page.tsx:80` calls `ensure_user_profile` which may not exist if migration 085 wasn't applied. Would silently fail on login for users without profiles.

### High-Value Opportunities:
52. **Buyer interest data collected but never surfaced** — `buyer_interests` table captures demand signals (zip codes where buyers search with zero results). No admin dashboard to view this data. Geographic intelligence for vendor recruitment is sitting unused.
53. **Vendor quality findings generated but invisible** — Nightly cron generates quality findings (ghost listings, low stock, schedule conflicts) but no vendor dashboard component displays them. Write-only data with zero actionability.
54. **Trial system lacks vendor-facing awareness** — No dashboard banner showing "Day X of 90" or urgency on upgrade page. Vendor discovers trial expired only when their listings get auto-unpublished.
55. **Vendor leads have no management UI** — Leads captured via form but admin must manage via email + manual DB updates. No CRM-like interface for lead status tracking, follow-up, or demo scheduling.

---

