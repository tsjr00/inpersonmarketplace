# Current Task: Session 58 — i18n Phases 1-3

Started: 2026-03-15

## Status: Phase 2 COMMITTED. Feedback/Review cards COMPLETE (4/4 files, build passes). Ready to commit. Checkout Phase NOT STARTED.

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
10. `0b0f99c` — i18n Phase 2: translate buyer notifications, auth emails, and notification UI (10 files, 507 ins)

## Branch State
- Main: 17 commits ahead of origin/main
- Staging: synced with main through commit `0b0f99c` (pushed this session)

## Phase 1 (Buyer Dashboard) — COMPLETE ✅
Committed `8572af3`. 9 files, ~180 keys each in en.ts/es.ts.

## Phase 2 (Notifications) — COMPLETE ✅
Committed `0b0f99c`. User confirmed titles appear in Spanish on staging.

### What Was Done in Phase 2
- `src/app/api/locale/route.ts` — saves locale to `user_profiles.notification_preferences.locale` for authenticated users
- `src/lib/notifications/types.ts` — interface updated: `title(data, locale?)` and `message(data, locale?)`. All 12 buyer-facing types use `t()`. Import added.
- `src/lib/notifications/service.ts` — reads `notification_preferences.locale` from profile, passes to template functions + `sendEmail()` + `formatEmailHtml()`. Footer translated.
- `src/lib/notifications/auth-email-templates.ts` — all 5 templates accept `locale`, use `t()` for all strings
- `src/app/api/auth/send-email/route.ts` — looks up user locale from profile, passes to template + footer
- `src/components/notifications/NotificationBell.tsx` — all UI strings translated
- `src/components/notifications/DashboardNotifications.tsx` — all UI strings translated
- `src/lib/locale/messages/en.ts` — ~60 new keys (notif.*, email.*, auth_email.*, notif_ui.*)
- `src/lib/locale/messages/es.ts` — ~60 matching Spanish translations

## Feedback/Review Cards — COMPLETE ✅ (4/4 files, build passes, NOT committed yet)

### Files Modified (uncommitted)
1. ✅ `src/components/buyer/FeedbackCard.tsx` — 3 strings translated
2. ✅ `src/components/buyer/ReviewPromptCard.tsx` — ~7 strings translated
3. ✅ `src/components/buyer/RateOrderCard.tsx` — ~15 strings translated
4. ✅ `src/components/buyer/ShopperFeedbackForm.tsx` — ~30 strings translated (categories, notices, fields, placeholders, buttons, success screen)

### Translation Keys Added (uncommitted, in en.ts + es.ts)
- `feedback.*` — ~47 keys for feedback form + cards (incl. placeholder + label keys)
- `review.*` — ~18 keys for review/rating components

## Checkout Flow — NOT STARTED (Phase 3)

### Research Complete (from agent scan)
11 files identified, ~175 total strings to translate:

| File | Type | Strings |
|------|------|---------|
| `src/app/[vertical]/checkout/page.tsx` | Client | ~35 |
| `src/app/[vertical]/checkout/success/page.tsx` | Client | ~30 |
| `src/components/cart/AddToCartButton.tsx` | Client | ~25 |
| `src/components/cart/CartDrawer.tsx` | Client | ~12 |
| `src/app/[vertical]/checkout/TipSelector.tsx` | Client | ~8 |
| `src/app/[vertical]/checkout/PaymentMethodSelector.tsx` | Client | ~5 |
| `src/app/[vertical]/checkout/CheckoutListingItem.tsx` | Client | ~4 |
| `src/app/[vertical]/checkout/CheckoutMarketBoxItem.tsx` | Client | ~5 |
| `src/app/[vertical]/checkout/CrossSellSection.tsx` | Client | ~4 |
| `src/components/cart/CartButton.tsx` | Client | ~2 |
| `src/app/[vertical]/checkout/CheckoutPickupGroup.tsx` | Client | ~0 |

### Key Strings in Checkout (examples)
- "Shopping Cart", "Proceed to Checkout", "Your cart is empty"
- "Add to Cart", "Sold Out", "Maximum quantity reached"
- "Order Summary", "Subtotal", "Service Fee", "Tip", "Total"
- "Order Placed!", "Thank you for your purchase"
- "View My Orders", "Continue Shopping"

## i18n Architecture Notes (Unchanged)

### Key Pattern
- Server components: `import { getLocale } from '@/lib/locale/server'` → `const locale = await getLocale()`
- Client components: `import { getClientLocale } from '@/lib/locale/client'` → `const locale = getClientLocale()`
- Both: `import { t } from '@/lib/locale/messages'` → `t('key', locale)` or `t('key', locale, { var: value })`
- Vertical terms: `term(vertical, 'key', locale)` — locale parameter added to term() calls

### Cookie System
- `locale` — httpOnly cookie for server components
- `locale_client` — non-httpOnly cookie for client components (synced by middleware)

### Message Key Namespaces (current)
- `status.*`, `payment.*`, `timeline.*`, `pickup.*` — shared buyer components
- `dash.*` — dashboard page
- `orders.*` — orders list page
- `order.*` — order detail page
- `notif.*` — notification types (Phase 2, done)
- `auth_email.*` — auth email templates (Phase 2, done)
- `email.*` — email wrapper/footer (Phase 2, done)
- `notif_ui.*` — notification UI components (Phase 2, done)
- `feedback.*` — feedback form + card (in progress)
- `review.*` — review/rating components (in progress)

## User Decisions This Session
- Legal documents (terms page) stay English only for now
- Help articles (from DB) stay English only for now
- Vendor-facing pages and notifications do NOT need translation
- Translation priority: Notifications → Checkout → Browse → Settings → Login
- Notification locale storage: Option B (JSONB field in notification_preferences, no migration)

## Translation Phase Overview (user-approved order)
1. ~~Buyer Dashboard (Priority 1)~~ ✅ — committed `8572af3`
2. ~~Notifications~~ ✅ — committed `0b0f99c`
3. **Feedback/Review cards** — IN PROGRESS (3/4 files done, ShopperFeedbackForm remaining)
4. **Checkout Flow** — research done, not started
5. Browse & Discovery — not started
6. Settings & Profile — not started
7. Auth (Login) — not started

## Next Steps (when user says proceed)
1. Finish `ShopperFeedbackForm.tsx` i18n (~30 strings, keys already in en.ts/es.ts)
2. Build verify
3. Commit feedback/review i18n
4. Start Checkout Flow Phase (11 files, ~175 strings)
