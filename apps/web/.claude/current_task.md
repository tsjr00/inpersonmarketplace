# Current Task: Session 58 — i18n Phases 1 & 2

Started: 2026-03-15

## Status: Phase 1 COMMITTED + PUSHED. Phase 2 (Notifications) IMPLEMENTED, BUILD PASSES, READY TO COMMIT.

## Commits This Session
1. `f6d6717` — API route guard tests (14) + component render tests (68)
2. `43cf399` — i18n Phase 1: English/Spanish language toggle (25 files, 734 insertions)
3. `334a55a` — Build fix: split locale server code from client-safe index
4. `76a3be5` — Fix landing page i18n: translate hardcoded strings in LocationEntry + Footer
5. `9238bc1` — i18n: translate Header nav, Hero banner, and fix locale passthrough
6. `f343d9e` — i18n: translate 6 supporting pages (help, terms, signup, about, features, how-it-works)
7. `fb8ead9` — Fix i18n client components: add readable `locale_client` cookie
8. `c07e2d3` — Fix i18n: middleware syncs httpOnly locale cookie to client-readable cookie
9. `8572af3` — i18n: translate buyer dashboard, orders list, and order detail pages (9 files, 871 insertions)

## Branch State
- Main: 16 commits ahead of origin/main
- Staging: synced with main through commit `8572af3` (pushed this session)

## Phase 1 (Buyer Dashboard) — COMPLETE ✅

### What Was Done
- `src/lib/locale/messages/en.ts` — ~180 new keys (status.*, payment.*, timeline.*, pickup.*, dash.*, orders.*, order.*)
- `src/lib/locale/messages/es.ts` — ~180 matching Spanish translations (total keys now ~450)
- `src/components/buyer/OrderStatusSummary.tsx` — full i18n rewrite
- `src/components/buyer/OrderTimeline.tsx` — full i18n rewrite
- `src/components/buyer/PickupDetails.tsx` — full i18n rewrite
- `src/app/[vertical]/dashboard/page.tsx` — SERVER component, fully translated (~30 strings + all term() calls)
- `src/app/[vertical]/buyer/orders/page.tsx` — CLIENT component, fully translated (~40 strings)
- `src/app/[vertical]/buyer/orders/[id]/page.tsx` — CLIENT component, fully translated (~70 strings)

## Phase 2 (Notifications) — IMPLEMENTED, READY TO COMMIT

### User Decision
- User approved Option B: store locale in `notification_preferences` JSONB (no migration needed)
- Vendor-facing pages/notifications do NOT need translation
- Translation priority order: Notifications → Checkout → Browse → Settings → Login

### Architecture Plan

#### How Notifications Work (from research)
- All 46 notification types defined in `src/lib/notifications/types.ts`
- Each type has `title()` and `message()` template functions returning hardcoded English strings
- `sendNotification()` in `service.ts` dispatches to 4 channels: in_app, email, SMS, push
- Same title/message text used across all channels
- Email wrapped in HTML template via `formatEmailHtml()` in service.ts
- Auth emails separate in `auth-email-templates.ts` (5 types: signup, recovery, magiclink, email_change, invite)

#### Notification Type Registry Structure (types.ts)
```typescript
// Each notification type has this shape:
order_ready: {
  urgency: 'immediate',
  severity: 'info',
  audience: 'buyer',
  title: () => `Order Ready for Pickup`,           // ← hardcoded English
  message: (d) => `Your order #${d.orderNumber}...`, // ← hardcoded English
  actionUrl: (d) => `/${d.vertical}/buyer/orders`,
},
```

#### What Needs Translation

**12 Buyer Notification Types** (~24 title+message strings):
1. `order_placed` — "Order Placed" / "Your order #{orderNumber} has been placed..."
2. `order_confirmed` — "Order Confirmed" / "Your order #{orderNumber} from {vendorName} has been confirmed..."
3. `order_ready` — "Order Ready for Pickup" / "Your order #{orderNumber} from {vendorName} has been marked ready..."
4. `order_fulfilled` — "Pickup Confirmed" / "Your pickup of {itemTitle} from {vendorName}..."
5. `order_cancelled_by_vendor` — "Order Cancelled" / "{vendorName} has cancelled..."
6. `order_refunded` — "Refund Issued" / "A refund of {amount} has been issued..."
7. `order_expired` — "Order Expired" / "Your order #{orderNumber} has expired..."
8. `pickup_missed` — "Pickup Missed" / "Your order #{orderNumber} wasn't picked up..."
9. `stale_confirmed_buyer` — "Action Needed" / "Your order #{orderNumber} has been confirmed but not picked up..."
10. `market_box_skip` — "Week Skipped" / "Your {offeringName} subscription..."
11. `market_box_pickup_missed` — "Pickup Missed" / "Your {offeringName} market box..."
12. `issue_resolved` — "Issue Resolved" / "The issue you reported has been resolved..."

**5 Auth Email Templates** (~15 strings — subject + htmlBody + textBody):
- signup, recovery, magiclink, email_change, invite
- File: `src/lib/notifications/auth-email-templates.ts`

**Email Wrapper** (~5 strings):
- Footer text, support link, "do not reply" text, notification preferences link
- File: `src/lib/notifications/service.ts` (formatEmailHtml function)

**2 UI Components** (a few strings each):
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/DashboardNotifications.tsx`

#### Implementation Steps (Option B)

1. **Store locale preference in user profile**
   - When user calls `POST /api/locale` to toggle language, ALSO save locale to `user_profiles.notification_preferences.locale`
   - File: `src/app/api/locale/route.ts` — add Supabase update call
   - No migration needed — `notification_preferences` is JSONB

2. **Add ~50 notification translation keys to en.ts / es.ts**
   - Namespace: `notif.*` for notification types, `auth_email.*` for auth emails, `email.*` for wrapper
   - Keys use `{variable}` interpolation same as existing pattern

3. **Modify types.ts template functions**
   - `title()` and `message()` become `title(d, locale?)` and `message(d, locale?)`
   - Use `t('notif.order_ready_title', locale)` instead of hardcoded strings
   - Fallback to English if no locale (backwards compatible)

4. **Modify service.ts sendNotification()**
   - Read `notification_preferences.locale` from user profile (already fetched at line 452)
   - Pass locale to `config.title(templateData, locale)` and `config.message(templateData, locale)`
   - Pass locale to `formatEmailHtml()` for footer translation

5. **Translate auth-email-templates.ts**
   - Template functions accept locale parameter
   - Use `t()` for subject, body text

6. **Translate UI components**
   - NotificationBell.tsx — add `getClientLocale()` + `t()` for any UI labels
   - DashboardNotifications.tsx — same pattern

7. **Build verify + commit + push staging**

### Key Files for Phase 2
- `src/lib/notifications/types.ts` (648 lines) — notification type registry with title/message functions
- `src/lib/notifications/service.ts` (640 lines) — dispatch orchestrator + email HTML wrapper
- `src/lib/notifications/auth-email-templates.ts` (126 lines) — 5 auth email templates
- `src/lib/notifications/email-config.ts` (56 lines) — per-vertical email branding
- `src/components/notifications/NotificationBell.tsx` (~200 lines) — dropdown notification list
- `src/components/notifications/DashboardNotifications.tsx` (~100 lines) — unread notifications card
- `src/app/api/locale/route.ts` — locale toggle endpoint (needs to save to user profile)
- `src/lib/locale/messages/en.ts` — add ~50 new keys
- `src/lib/locale/messages/es.ts` — add ~50 Spanish translations

### Gotchas / Constraints
- `sendNotification()` already fetches user profile at line 452-459 — `notification_preferences` is available there
- Template functions use JS template literals with `${d.variable}` — need to convert to `t('key', locale, { variable: d.variable })`
- SMS has 160-char limit — Spanish translations may be longer, need to watch for truncation
- Auth emails are triggered by Supabase Auth — the locale must be determinable at that point
- `formatEmailHtml()` wraps ALL emails (both notification + auth) — footer text needs locale
- Per-vertical urgency overrides exist (FT higher urgency than FM) — these don't affect translation

## i18n Architecture Notes (Unchanged)

### Key Pattern
- Server components: `import { getLocale } from '@/lib/locale/server'` → `const locale = await getLocale()`
- Client components: `import { getClientLocale } from '@/lib/locale/client'` → `const locale = getClientLocale()`
- Both: `import { t } from '@/lib/locale/messages'` → `t('key', locale)` or `t('key', locale, { var: value })`
- Vertical terms: `term(vertical, 'key', locale)` — locale parameter added to term() calls

### Cookie System
- `locale` — httpOnly cookie for server components
- `locale_client` — non-httpOnly cookie for client components (synced by middleware)

### Message Key Namespaces
- `status.*`, `payment.*`, `timeline.*`, `pickup.*` — shared
- `dash.*` — dashboard page
- `orders.*` — orders list page
- `order.*` — order detail page
- `notif.*` — notification types (Phase 2, to be added)
- `auth_email.*` — auth email templates (Phase 2, to be added)
- `email.*` — email wrapper/footer (Phase 2, to be added)

## User Decisions This Session
- Legal documents (terms page) stay English only for now
- Help articles (from DB) stay English only for now
- Vendor-facing pages and notifications do NOT need translation
- Translation priority: Notifications → Checkout → Browse → Settings → Login
- Notification locale storage: Option B (JSONB field in notification_preferences, no migration)

## Translation Phase Overview (user-approved order)
1. ~~Buyer Dashboard (Priority 1)~~ ✅ — committed `8572af3`
2. **Notifications** — NEXT (approved, not started)
3. Checkout Flow — not started
4. Browse & Discovery — not started
5. Settings & Profile — not started
6. Auth (Login) — not started
