# Current Task: Session 58 — i18n Phase 1: Buyer Dashboard Translation (Priority 1)

Started: 2026-03-15

## Status: COMPLETE — All Priority 1 pages translated, build passes. Ready to commit.

## Commits This Session (prior context)
1. `f6d6717` — API route guard tests (14) + component render tests (68)
2. `43cf399` — i18n Phase 1: English/Spanish language toggle (25 files, 734 insertions)
3. `334a55a` — Build fix: split locale server code from client-safe index
4. `76a3be5` — Fix landing page i18n: translate hardcoded strings in LocationEntry + Footer
5. `9238bc1` — i18n: translate Header nav, Hero banner, and fix locale passthrough
6. `f343d9e` — i18n: translate 6 supporting pages (help, terms, signup, about, features, how-it-works)
7. `fb8ead9` — Fix i18n client components: add readable `locale_client` cookie
8. `c07e2d3` — Fix i18n: middleware syncs httpOnly locale cookie to client-readable cookie

## Branch State
- Main: 15 commits ahead of origin/main
- Staging: synced with main through commit `c07e2d3`

## What's Complete (This Batch — Priority 1 Buyer Dashboard)

### Message Files — DONE
- `src/lib/locale/messages/en.ts` — Added ~180 new keys (status.*, payment.*, timeline.*, pickup.*, dash.*, orders.*, order.*)
- `src/lib/locale/messages/es.ts` — Added matching ~180 Spanish translations
- Total keys now: ~450 (was ~270)

### Shared Components — ALL 3 DONE
- `src/components/buyer/OrderStatusSummary.tsx` — REWRITTEN with locale. Uses `getClientLocale()` + `t()` for all 8 status titles/messages + partial ready + last updated
- `src/components/buyer/OrderTimeline.tsx` — REWRITTEN with locale. Uses `getClientLocale()` + `t()` for all 5 timeline step labels + cancelled/expired messages + confirm receipt hint
- `src/components/buyer/PickupDetails.tsx` — REWRITTEN with locale. Uses `getClientLocale()` + `t()` for location header, pickup date, market hours, day names (Sun-Sat), contact label

### Dashboard Page — DONE
- `src/app/[vertical]/dashboard/page.tsx` — SERVER component, fully translated
- All ~30 strings + all `term()` calls have `locale` parameter

### Orders List Page — DONE
- `src/app/[vertical]/buyer/orders/page.tsx` — CLIENT component, fully translated
- ~40 strings: imports added, `getClientLocale()`, `formatPaymentMethodLabel()` accepts locale, `statusConfig` uses `t()`, all headers/filters/banners/section headers/empty states translated

### Order Detail Page — DONE
- `src/app/[vertical]/buyer/orders/[id]/page.tsx` — CLIENT component, fully translated
- ~70 strings: all dialog texts, banners, status labels, item details, fee labels, pickup hero section, cancellation info

## Architecture Notes

### Key Pattern
- Server components: `import { getLocale } from '@/lib/locale/server'` → `const locale = await getLocale()`
- Client components: `import { getClientLocale } from '@/lib/locale/client'` → `const locale = getClientLocale()`
- Both: `import { t } from '@/lib/locale/messages'` → `t('key', locale)` or `t('key', locale, { var: value })`
- Vertical terms: `term(vertical, 'key', locale)` — locale parameter added to term() calls

### Message Key Namespaces (added this batch)
- `status.*` — Shared order status titles/messages (used by OrderStatusSummary, orders list, order detail)
- `payment.*` — Payment method labels (Venmo, Cash App, PayPal, Cash)
- `timeline.*` — Order timeline step labels
- `pickup.*` — Pickup details labels + day names
- `dash.*` — Dashboard page strings
- `orders.*` — Orders list page strings
- `order.*` — Order detail page strings

### Cookie System (unchanged)
- `locale` — httpOnly cookie for server components
- `locale_client` — non-httpOnly cookie for client components (synced by middleware)

## User Decisions This Session
- Legal documents (terms page) stay English only for now
- Help articles (from DB) stay English only for now
- Priority 1 approved: dashboard + orders list + order detail + 3 shared components
- Priority 2 (checkout, subscriptions) and Priority 3 (settings, browse, feedback) deferred

## What Needs to Happen Next
1. ~~FINISH dashboard page~~ ✅
2. ~~Translate orders list page~~ ✅
3. ~~Translate order detail page~~ ✅
4. ~~Build verify~~ ✅ (passes clean)
5. **Commit** — all Priority 1 changes (awaiting user approval)
6. **Push to staging** — user tests

## Files Modified This Batch (uncommitted)
- `src/lib/locale/messages/en.ts` — ~180 new keys added
- `src/lib/locale/messages/es.ts` — ~180 new Spanish translations added
- `src/components/buyer/OrderStatusSummary.tsx` — full rewrite with i18n
- `src/components/buyer/OrderTimeline.tsx` — full rewrite with i18n
- `src/components/buyer/PickupDetails.tsx` — full rewrite with i18n
- `src/app/[vertical]/dashboard/page.tsx` — partially translated (imports + ~15 string replacements done)

## Gotchas
- `term()` function accepts optional `locale` parameter — must pass it: `term(vertical, 'key', locale)`
- Dashboard is a SERVER component (uses `getLocale()` + `await`), orders pages are CLIENT components (use `getClientLocale()`)
- `t()` function uses `replace()` not `replaceAll()` — only first occurrence of each variable replaced (fine for our use)
- Pluralization handled with separate keys (e.g., `dash.active_orders` vs `dash.active_order`, `orders.count` vs `orders.count_one`)
- `formatPaymentMethodLabel()` function in orders page returns hardcoded strings — needs to accept locale and use `t('payment.*', locale)`
- Status config objects in orders pages have hardcoded `label` strings — need to change to use `t('status.*', locale)`
