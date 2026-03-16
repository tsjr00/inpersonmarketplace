# Current Task: Session 58 — i18n Phases 1-3

Started: 2026-03-15

## Status: Checkout Phase COMPLETE — all 11 files translated, build passes. Ready to commit.

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
11. `75df741` — i18n: translate feedback/review cards and shopper feedback form (4 files, ~55 strings)

## Branch State
- Main: 18 commits ahead of origin/main
- Staging: synced with main through commit `75df741` (feedback cards pushed to staging, user confirmed working)

## Phase 1 (Buyer Dashboard) — COMPLETE ✅
Committed `8572af3`. 9 files, ~180 keys each in en.ts/es.ts.

## Phase 2 (Notifications) — COMPLETE ✅
Committed `0b0f99c`. User confirmed titles appear in Spanish on staging.

## Feedback/Review Cards — COMPLETE ✅
Committed `75df741`. User confirmed "feedback is in spanish now."

## Checkout Flow — COMPLETE (all 11 files translated, NOT committed yet)

### Translation Keys — DONE (all added to en.ts + es.ts)
All ~150 checkout translation keys added to both en.ts and es.ts under these namespaces:
- `cart.*` — ~25 keys (cart drawer, button, shared cart strings)
- `checkout.*` — ~35 keys (checkout page, validation, notices, summary)
- `tip.*` — ~5 keys (tip selector)
- `payment.*` — ~4 keys (payment method selector)
- `atc.*` — ~20 keys (add to cart button)
- `cross.*` — ~3 keys (cross-sell section)
- `success.*` — ~35 keys (checkout success page)
- `day.*` — 7 keys (day names for market box subscriptions)

### Files DONE (translated by agents, uncommitted)
1. ✅ `src/components/cart/CartDrawer.tsx` — ~17 strings (cart header, empty state, notices, totals, buttons, pickup labels)
2. ✅ `src/components/cart/CartButton.tsx` — 1 string ("Cart" button label)
3. ✅ `src/app/[vertical]/checkout/TipSelector.tsx` — 5 strings (tip labels, descriptions)
4. ✅ `src/app/[vertical]/checkout/PaymentMethodSelector.tsx` — 4 strings (payment method UI)
5. ✅ `src/app/[vertical]/checkout/CrossSellSection.tsx` — 3 strings (cross-sell header, vendor label, view button)
6. ✅ `src/app/[vertical]/checkout/CheckoutListingItem.tsx` — ~10 strings (sold out, qty, each, remove, pickup — both grouped/standalone modes)
7. ✅ `src/app/[vertical]/checkout/CheckoutMarketBoxItem.tsx` — ~6 strings (subscription label, pickup, day names, remove)

8. ✅ `src/components/cart/AddToCartButton.tsx` — ~15 strings (toast, button states, pickup labels)
9. ✅ `src/app/[vertical]/checkout/success/page.tsx` — ~33 strings (success banner, items, pickups, actions)
10. ✅ `src/app/[vertical]/checkout/page.tsx` — ~35 strings (header, summary, notices, security)
11. ✅ `src/app/[vertical]/checkout/CheckoutPickupGroup.tsx` — 0 translatable strings (only uses dynamic data)

### i18n Approach (clarification for user)
We are NOT duplicating code. Each component file stays as-is structurally. We only replace hardcoded English text with `t('key', locale)` function calls that look up the correct translation at runtime based on the user's language cookie. The translation strings live in two files:
- `src/lib/locale/messages/en.ts` — English strings
- `src/lib/locale/messages/es.ts` — Spanish strings

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
- `notif.*` — notification types
- `auth_email.*` — auth email templates
- `email.*` — email wrapper/footer
- `notif_ui.*` — notification UI components
- `feedback.*` — feedback form + card
- `review.*` — review/rating components
- `cart.*`, `checkout.*`, `tip.*`, `atc.*`, `cross.*`, `success.*`, `day.*` — checkout flow (in progress)

## User Decisions This Session
- Legal documents (terms page) stay English only for now
- Help articles (from DB) stay English only for now
- Vendor-facing pages and notifications do NOT need translation
- Translation priority: Notifications → Checkout → Browse → Settings → Login
- Notification locale storage: Option B (JSONB field in notification_preferences, no migration)

## Translation Phase Overview (user-approved order)
1. ~~Buyer Dashboard~~ ✅ — committed `8572af3`
2. ~~Notifications~~ ✅ — committed `0b0f99c`
3. ~~Feedback/Review cards~~ ✅ — committed `75df741`
4. **Checkout Flow** ✅ — committed (see commit list above)
5. Browse & Discovery — not started
6. Settings & Profile — not started
7. Auth (Login) — not started

## Next Steps (when user says proceed)
1. Commit all checkout flow i18n
2. Push to staging for user verification
3. Continue to Phase 5: Browse & Discovery
