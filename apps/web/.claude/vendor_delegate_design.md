# Vendor Delegates — design notes (2026-08-29, owner ask; NOT approved, NOT built)

Owner's brief: multi-truck outfits / multi-market vendors have employees who come and go. The account owner
does not want employees to hold ongoing access, but needs to hand the app to someone while unavailable.
No new layers inside the vendor category; a single "delegate" who can run the truck/booth day to day
(orders, pickup mode, statuses, cancellations, handoffs, inventory, menu items, listing↔market assignment)
but cannot touch the business side (profile, Stripe/payouts, documents, plan). Concern: what are the
limits on concurrent logins; owner-signs-in-then-"delegate mode" fails when the delegate is elsewhere
and the tablet dies.

## What the code does today (cited)
- Ownership = `vendor_profiles.user_id` — one auth user per profile per vertical. App side: 58 API routes
  resolve the actor through `lib/vendor/getVendorProfile.ts` (`getVendorProfileForVertical(supabase, user.id,
  vertical)`), but ~45 API files and 15 `[vertical]/vendor/*` pages still do a raw
  `.from('vendor_profiles').eq('user_id', user.id)`.
- DB side: RLS resolves "my vendor profiles" through ONE SQL helper —
  `user_vendor_profile_ids()` = `SELECT id FROM vendor_profiles WHERE user_id = auth.uid()`
  (`migrations/20260130_007_comprehensive_rls_cleanup.sql:251-259`, SECURITY DEFINER) — used by
  `listings_select` (mig 075:17-22), `markets_select`, market_vendors, vendor_verifications, vendor_payouts,
  event_vendor_fee_payments, vendor_quality_findings policies (16 references). The profile row itself is
  owner-only by construction: `vendor_profiles_update USING (user_id = auth.uid())` (mig 095:489-491).
- Roles: `user_profiles.role` enum buyer/vendor/admin/platform_admin/regional_admin (+ `roles[]`,
  `lib/auth/roles.ts` checks both). Vendor pages gate on "has a vendor_profiles row", not on the role.
- Dormant hook: `organizations` (id, legal_name, dba_name, owner_user_id, tax_id) +
  `vendor_profiles.organization_id` — referenced only by admin displays and `lib/db/vendors.ts`.
- Proven delegation pattern to copy: market managers — dual-key (`manager_email` pre-signup →
  `manager_user_id` on first authenticated load, `lib/markets/manager-auth.ts:12-17`), `manager_status`
  active/suspended, append-only `market_manager_history` with an at-most-one-active partial unique index
  (mig 154), `/access-suspended` + `/access-removed` landing pages.
- Notifications route to a USER id (`sendNotification(userId, …)`); push subscriptions are per user
  (`push_subscriptions.user_id`). A delegate with their own account gets their own bell/push for free.
- Sessions (Supabase Auth, external — High confidence from docs, not code): concurrent sessions per user are
  UNLIMITED by default; each device holds its own refresh token; `signOut({ scope: 'others' | 'global' })`
  can revoke other devices (the app only calls plain `signOut()` today). "Single session per user" and
  session time-box / inactivity timeouts are Pro-plan Auth settings (UNVERIFIED which plan this project is on).
  ⇒ Any "only N delegates active at once" rule is OURS to enforce; the auth layer won't do it.

## Options
A. **Owner's session + "delegate mode" toggle.** Rejected: fails the dead-tablet case (delegate has no
   credentials), no audit trail (every action looks like the owner), can't revoke one person, and a
   "mode" flag in the session is exactly the kind of client-side state that leaks.
B. **Delegate = their own account, linked to the owner's profile** (RECOMMENDED). New table
   `vendor_delegates (vendor_profile_id, delegate_user_id NULL until accepted, invited_email, status
   invited|active|suspended|revoked, invited_by, invited_at, accepted_at, revoked_at, revoked_by)`; partial
   unique = one live row per (profile, email). Owner invites by email from a "Team" card; the delegate signs
   up / logs in with their OWN email on ANY device; the owner suspends or revokes from the same card.
C. **Organizations (owner + members).** The dormant table fits, but it is a multi-profile construct with
   its own onboarding, tax identity and RLS surface — heavier than the ask. Defer; B can migrate into C
   later (a delegate row is an org membership with a narrower scope).

## How B stays cheap and safe
1. **DB — one function change covers RLS.** `user_vendor_profile_ids()` gains a second arm:
   `UNION SELECT vendor_profile_id FROM vendor_delegates WHERE delegate_user_id = auth.uid() AND status = 'active'`.
   Every policy already routed through the helper honors delegates with zero policy edits.
   `vendor_profiles_update` stays owner-only (it never used the helper). Add `is_vendor_owner(profile_id)`
   for the few owner-only policies we may want later. Revocation is immediate — the helper reads status
   live on every statement; no need to kill the delegate's Supabase session.
2. **App — one resolver, one sweep.** `getVendorProfileForVertical` learns delegates and returns
   `{ profile, actor: 'owner' | 'delegate' }`. The 45 raw API lookups + 15 raw page lookups move to the
   helper (mechanical; a flow-integrity guard then forbids new raw `.eq('user_id', user.id)` lookups on
   vendor_profiles outside the helper). This is the bulk of the work and it is the same edit 60 times.
3. **Gating = a short OWNER-ONLY allowlist, not per-feature permissions.** `lib/vendor/owner-only.ts`
   names the pages/routes a delegate cannot use; everything else is open. Draft list:
   - pages: `/vendor/edit` (business profile, documents, certifications, readiness), `/vendor/dashboard/stripe`,
     `/vendor/dashboard/upgrade`, the Team/delegates card itself, account deletion
   - API: `api/vendor/{profile, profile-image, cover-image, stripe, subscription, tier, home-market,
     onboarding, referrals, fees (payment methods)}` and delegate management
   - OPEN to delegates: orders (confirm/ready/fulfill/reject/cancel), pickup mode, check-ins, listings
     create/edit/publish/inventory/images, listing↔market assignment, market-boxes, schedules, events
     (respond/prep/message/standby/cancel), bookings pages (read), analytics/insights (read), surveys
   Enforcement in two places only: the `/[vertical]/vendor` layout (server) redirects a delegate off
   owner-only pages, and a `requireVendorActor(request, { ownerOnly })` wrapper in the owner-only API
   routes. UI: delegates see a persistent "Working as a delegate for {business}" banner; owner-only cards
   are hidden, not disabled.
4. **Money-out actions** (pay an event fee, book a park spot / booth week, upgrade plan) default to
   OWNER-ONLY — they charge the owner's card/Connect. Can be opened per action later if wanted.
5. **Caps.** `vendor-limits.ts` gets `maxActiveDelegates` per tier (e.g. free 1 · paid 3). Concurrent
   logins are not capped (no security value; real cost in lockouts). Suspend = keep the row, block access
   (seasonal staff); revoke = end it (history kept).
6. **Notifications (phase 2).** Operational types (new order, pickup reminders, event day) fan out to
   active delegates; account/money types never do. Vendor-audience templates already take a user id, so
   the fan-out is a loop in `sendNotification`'s caller for a whitelisted set of types.
7. **Audit (phase 2).** `acted_by_user_id` on order_items status writes + a delegates history table
   (copy `market_manager_history`). Until then the delegates table itself records who had access when.
8. **FM wording.** Same mechanism; copy says "helper" / "staff member" instead of delegate where it faces
   vendors ("Add a helper who can run your booth").

## Security review points
- No new role enum value; delegates are ordinary accounts with a link row — no RLS churn on user_profiles.
- Acceptance requires the delegate's login email to match the invite (manager dual-key) — no invite-link
  forwarding.
- A delegate can never read `vendor_profiles.stripe_*`, `tax_id`, documents, or payout tables beyond what
  the open surfaces render (vendor_payouts policy also goes through the helper → decide: exclude payouts
  from the delegate arm via `is_vendor_owner` — recommended).
- Owner revoke is one click; effective on the delegate's next request; optional "sign out their devices"
  is NOT possible for another user via the client SDK (admin API only) — not needed given live checks.

## Sizing
Phase 1 (table + helper + resolver + sweep + owner-only guard + Team card invite/accept/suspend/revoke +
banner + tests + docs): ~2 sessions. Phase 2 (notification fan-out, audit column, tier caps UI): ~1 session.

## Owner decisions needed
1. Money-out actions owner-only by default (fee payment, spot/booth booking, upgrade)? [recommended yes]
2. Can a delegate ACCEPT an event invitation (a commitment) — yes/no?
3. Delegate cap per tier?
4. Delegates receive operational push/in-app notifications (phase 2)?
5. Payouts page: owner-only (recommended) or visible to delegates?

## Owner decisions (2026-08-29) — design is now final pending scheduling
1. Money-out = owner-only. 2. Event invitations: owner-only accept (delegates: prep / message / pickup / standby view only — standby join is also a commitment → owner-only). 3. Caps: free 1 · pro 3 · boss 5 (FT names; FM tiers map by rank). 4. Payouts page owner-only (exclude vendor_payouts from the delegate arm — `is_vendor_owner`). 5. Public term "Team member" (both verticals); "delegate" internal only.
Additions to the owner-only list from these: `api/vendor/events/[marketId]/respond` (accept/decline), `standby` (join), `vendor-fee` pay, `markets/[id]/book*`, `standing-reservation`, `booth-groups/*`, `park-occurrences/*/pay`, `subscription`, `tier`, `stripe`, payouts page + `api/vendor/payouts`.

---
# FINAL IMPLEMENTATION PLAN (sweep done 2026-08-29; ready to schedule — nothing built)

## 0. Decisions locked (owner 2026-08-29)
Money-out = owner-only · event invitation accept/decline = owner-only · **standby bench join = owner decision** (owner-only) · caps free 1 / pro 3 / boss 5 · payouts page owner-only · public term **"Team member"** (both verticals).

## 1. Sweep results — every place that decides "who is the vendor"
Generated 2026-08-29 (awk over `from('vendor_profiles')` + `eq('user_id', user.id|userId)` within 8 lines; helper callers by grep). Scratch list: `scratchpad/raw_vendor_lookups.txt`.

### 1a. Raw lookups that must move to the resolver (45 sites)
**Vendor pages (16)** — `app/[vertical]/vendor/`: analytics:95 · bookings:111 · dashboard:48,:54 · edit:39 · events/[marketId]:281 · insights:171 · listings/[listingId]/edit:29 · listings/[listingId]:34 · listings/new:32 · listings:207 · park-bookings:85 · survey/[surveyId]:30 · surveys:34 · upcoming:31 · plus `app/[vertical]/dashboard/page.tsx:85` (shopper dashboard's vendor section) and `app/[vertical]/settings/page.tsx:46`.
**Vendor API routes (8)** — `api/vendor/events/[marketId]/{cancel:73, message:65, respond:87, route:61}` · `api/vendor/markets/[id]/{prep:29, respond:116}` · `api/surveys/respond:74` · `api/vendor-documents/signed-url:67`.
**Infra (4)** — `lib/auth/vertical-gate.ts:51` (vendor fallback for vertical access) · `lib/dashboard/nav-destinations.ts:65` (vendor nav) · `components/layout/HeaderWrapper.tsx:34` (header vendor links) · `lib/events/reusable-payout-accounts.ts:41` (owner-only anyway).
**Leave as-is (owner identity is the point):** `api/auth/callback:73`, `api/user/delete-account:57,:84`, `vendor-signup:211`, `lib/stripe/webhooks.ts` x6 (Stripe → owner), `api/admin/*` (admin acting on a vendor), `lib/vendor/getVendorProfile.ts:48` (the resolver itself).

### 1b. Helper callers (58 API routes) — inherit delegate support automatically once the resolver changes
Every `api/vendor/**` route not in 1a plus `api/listings/[id]`, `api/subscriptions/checkout`.

### 1c. RLS — one function, 57 policies
`user_vendor_profile_ids()` is referenced by policies on: listings (5), listing_images (5), listing_markets (5), fulfillments (5), market_box_offerings (7), market_box_subscriptions (1), markets (6), order_items (2), orders (2), order_ratings (1), transactions (3), vendor_feedback (2), **vendor_payouts (1 — EXCLUDE)**, vendor_quality_findings (1), vendor_referral_credits (1 — exclude, money), vendor_verifications (4 — exclude, documents), vendor_market_schedules (5), event_vendor_fee_payments (1 — read ok), market_vendors (1). `vendor_profiles_update` is `user_id = auth.uid()` — owner-only already.
Plan: the helper gains the delegate arm; the three owner-only tables (vendor_payouts, vendor_referral_credits, vendor_verifications) switch their policies to a new `owner_vendor_profile_ids()` (= today's body) in the same migration. Everything else honors delegates untouched.

## 2. Surface classification (final)
**OWNER-ONLY pages:** `vendor/edit` (profile, docs, certifications, readiness, multi-truck flag) · `vendor/dashboard/stripe/**` · `vendor/dashboard/upgrade` · `vendor/referrals` · `vendor/prohibited-items` (the acknowledgment is the owner's) · `vendor/bookings`, `vendor/park-bookings` (carry pay/cancel actions → owner-only v1) · `settings` (account) · the Team card.
**OWNER-ONLY API:** `api/vendor/{profile, profile/certifications/**, profile-image, cover-image, event-readiness, onboarding/**, stripe/**, subscription/**, tier/**, home-market, referrals, fees, fees/pay, tutorial}` · `api/vendor/events/[marketId]/{respond, standby, pay, cancel}` (respond/standby/withdraw are commitments; pay is money) · `api/vendor/markets/[id]/{book, book-season, book-park-spot, standing-reservation, join, respond}` · `api/vendor/booth-groups/**` · `api/vendor/park-occurrences/**` · `api/vendor-documents/signed-url` · `api/subscriptions/**` · `api/user/delete-account` · delegate management routes.
**OPEN to Team members (everything else), notably:** `vendor/dashboard` (trimmed), `vendor/orders`, `vendor/pickup`, `vendor/upcoming`, `vendor/listings/**` (create/edit/publish/images/markets), `vendor/market-boxes/**`, `vendor/markets` + `markets/[id]/prep` (schedules; NOT join/respond/book), `vendor/events/[marketId]` (view, prep, message the organizer), `vendor/analytics`, `vendor/insights`, `vendor/reviews`, `vendor/quality`, `vendor/location-log`, `vendor/surveys/**`; API: `api/vendor/{orders/**, checkins/**, listings/**, market-boxes/**, markets (GET), markets/[id]/schedules, markets/[id]/prep, market-stats, analytics/**, location-insights, reviews, quality-findings, favorites, feedback, events/[marketId] (GET), events/[marketId]/{prep, message}}`, `api/listings/[id]` (PUT/DELETE own listing).
**Dashboard cards hidden for Team members:** Business Profile · Legal Agreements · My Booth Bookings / My Park Bookings · Referral · Fee balance / Payment methods · Promote/upgrade. Shown: Pickup Mode, My Orders, My Upcoming Pickups, Manage Locations, My Listings, My Market Boxes, My Vendor Events, Analytics & Insights, My Reviews, surveys tile, Preview your public profile.

## 3. Build spec
**Mig 239 `vendor_delegates`** — `id, vendor_profile_id FK vendor_profiles CASCADE, delegate_user_id UUID NULL FK auth.users SET NULL, invited_email TEXT NOT NULL (LOWER-indexed), status TEXT CHECK (invited|active|suspended|revoked) DEFAULT invited, invited_by UUID, invited_at, accepted_at, suspended_at, revoked_at, revoked_by, created_at`. Partial UNIQUE `(vendor_profile_id, LOWER(invited_email)) WHERE status IN ('invited','active','suspended')`. RLS: owner SELECT/INSERT/UPDATE via `vendor_profile_id IN (SELECT owner_vendor_profile_ids())`; delegate SELECT own row. Functions: `owner_vendor_profile_ids()` (today's body) · `user_vendor_profile_ids()` = owner UNION `SELECT vendor_profile_id FROM vendor_delegates WHERE delegate_user_id = auth.uid() AND status = 'active'` · policy swaps on vendor_payouts / vendor_referral_credits / vendor_verifications. Paste-and-go, inert (empty table). Snapshot + REFRESH.
**Resolver** — `getVendorProfileForVertical` returns `{ profile, actor: 'owner' | 'delegate', delegateId? }`: owner rows first; if none, active delegate rows joined to vendor_profiles (service client for the join, then the same vertical disambiguation). New `requireVendorActor(supabase, { userId, vertical, ownerOnly })` that returns the resolution or a 403 `ERR_OWNER_ONLY` for delegates. Sweep the 45 raw sites (1a) to the resolver; flow-integrity guard: no `from('vendor_profiles')…eq('user_id'` outside the 1a "leave as-is" allowlist.
**Gating** — `lib/vendor/owner-only.ts` exports `OWNER_ONLY_PAGES` (path prefixes) + `OWNER_ONLY_ROUTES`; new `app/[vertical]/vendor/layout.tsx` (server) resolves the actor once, redirects Team members off owner-only pages to `/vendor/dashboard?owner_only=1` (dashboard shows a one-line "that page is for the account owner" notice), and renders the persistent banner "Working as a Team member for {business}"; owner-only API routes call `requireVendorActor(..., { ownerOnly: true })` — a flow-integrity test asserts every route in OWNER_ONLY_ROUTES contains the call.
**Team card** — dashboard card "Team members" (owner only): list (name/email/status), "Invite a Team member" (email; cap by tier from `vendor-limits.ts` `maxTeamMembers` free 1 / pro 3 / boss 5; FM tiers by rank), Suspend / Resume / Remove. Routes `api/vendor/team` (GET/POST), `api/vendor/team/[id]` (PATCH status). Accept flow: dual-key — on any authenticated vendor-area load, `vendor_delegates` rows with `invited_email = LOWER(user.email)` and `delegate_user_id IS NULL` get claimed (`delegate_user_id = auth.uid(), status active, accepted_at`) — mirrors `manager-auth.ts:12-17`. Invite email (standard branded) + in-app `team_member_invited` if the invitee already has an account; `team_member_joined` to the owner. Tripwire +2.
**Vertical gate / nav / header** — the three infra sites in 1a use the resolver so a Team member gets vendor navigation and vertical access.
**Copy** — "Team member" everywhere user-facing (both verticals); "delegate" only in code/DB.
**Phase 2** — operational notification fan-out (order_* types, pickup reminders, event-day) to active delegates via one helper `vendorRecipients(vendorProfileId)` adopted by the 47 send sites over time (start with orders + pickup); `acted_by_user_id` on order_items status writes; `vendor_delegate_history` (copy mig 154 shape).

## 4. Tests (spec = the decisions above)
Unit: resolver (owner wins; delegate only when active; suspended/revoked → none; multi-vertical disambiguation unchanged). Flow-integrity: every OWNER_ONLY_ROUTES file calls `requireVendorActor(ownerOnly)`; no raw vendor lookups outside the allowlist; the newest definer of `user_vendor_profile_ids` contains the delegate arm AND the three owner-only tables reference `owner_vendor_profile_ids`. Money-authorization harness: a delegate hitting fee pay / booking / respond → 403 before any Stripe call. Cap enforced at invite (tier), never at login.

## 5. Sizing / order
Session A: mig 239 + resolver + `requireVendorActor` + owner-only lists + layout/banner + sweep (45 sites) + guards. Session B: Team card + invite/accept/suspend/remove + notifications + copy + docs + staging test list. Session C (phase 2): fan-out + audit + history.
Risks: the sweep touches the vendor dashboard and listing pages (check `vault-manifest.md` before Session A — location-search files are not in scope); `getVendorProfileForVertical` is imported by the fulfill/reject routes (critical path) — the resolver change must keep the return shape (adds `actor`), so those files need no edits and no per-file approval.
