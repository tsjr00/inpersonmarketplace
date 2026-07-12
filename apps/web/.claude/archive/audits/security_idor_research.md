# Security IDOR/Auth Scan — Research

## Auth patterns
- `requireAdmin()` (admin.ts) — redirects, MFA. `verifyAdminForApi()` returns {isAdmin,userId}. `verifyAdminScope()` vertical-scoped.
- `isMarketManager(supabase, marketId, user)` / `getMarketManagerState` (manager-auth.ts) — dual-key (manager_user_id OR manager_email), must be 'active'.
- `createServiceClient()` bypasses RLS — route's own check is only protection.

## Verified OK (auth + ownership present)
- vendor/orders/[id]/fulfill POST — auth + vendor_profile_id ownership check (L79). OK
- vendor/orders/[id]/reject POST — auth + ownership check (L85). OK

## Verified OK (batch 2)
- market-manager/[marketId]/vendor-approval PATCH — isMarketManager + .eq(market_id) on update. OK
- market-manager/[marketId]/vendors GET — isMarketManager. OK
- market-manager/[marketId]/weekly-rental/[rentalId] PATCH — isMarketManager + .eq(market_id) cross-spoof guard. OK
- market-manager/[marketId]/booth-inventory/[inventoryId] PATCH/DELETE — isMarketManager + row.market_id===marketId. OK
- market-manager/[marketId]/vendor-docs/[vendorProfileId] GET — 3 gates. OK
- buyer/orders/[id]/rate POST/GET — auth + order.buyer_user_id===user.id. OK
- buyer/orders/[id]/confirm POST — auth + order ownership. OK
- listings/[id] DELETE — auth + vendor ownership. OK
- subscriptions/verify GET — auth + userId===user.id. OK
- event-approved-vendors GET — intentional public, no sensitive data. OK
- buyer-interests POST — intentional public lead form. OK
- events/[token]/my-order GET — auth + orders.buyer_user_id===user.id. OK
- events/[token]/cancel POST — auth + organizer ownership. OK
- events/[token]/verify-code POST — public+rate-limited by design. OK

## Candidate findings
- events/[token]/select POST (L166) — NO auth, NO organizer ownership; token-only. Mutates event state. Token = company-slug + 6char base36(Date.now). MED-HIGH.

## Verified OK (batch 3)
- markets/[id]/schedules + [scheduleId] — hasAdminRole. OK
- markets/[id] PATCH/DELETE — hasAdminRole. OK
- markets/[id]/vendors/[vendorId] PATCH/DELETE — admin or own-application. OK
- vendor/markets/[id] PUT/DELETE — auth + market.vendor_profile_id===vendorProfile.id. OK
- vendor/markets/[id]/book POST — auth + vendor profile + inventory.market_id check. OK
- admin/users/[id] PATCH — hasAdminRole + self/admin guards. OK
- admin/vendors/[id]/fee-override PATCH — hasAdminRole. OK
- surveys/respond POST — vendor path auth+ownership, buyer path token. OK
- auth/send-email POST — Svix signature verify. OK
- webhooks/resend POST — Svix signature verify. OK
- events/[token]/select GET — read-only, public by design. OK
- events/[token]/waves GET, validate-order-cap GET — read-only, non-sensitive. OK
- events/[token]/order POST — auth + access code. OK
- events/[token]/verify-code POST — rate-limited public. OK
