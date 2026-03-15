# Current Task: Session 58 — i18n Phase 1: Language Toggle + Landing Page Spanish

Started: 2026-03-15

## Status: COMPLETE — Ready to commit

## Goal
Add English/Spanish language toggle to landing page and settings. Cookie-based locale system that extends existing `term()` + `getContent()` architecture. No URL changes, no new dependencies.

## Key Decisions Made
- Cookie-based approach (NOT next-intl URL routing) — avoids restructuring all routes
- Extend existing `term(vertical, key)` → `term(vertical, key, locale?)` — backward-compatible
- Locale stored in `locale` httpOnly cookie, default `en`, 1-year TTL
- Language selector on: header (all pages) + settings page (full variant)
- Vendor-generated content stays as-written (not translated)
- Bilingual hint added under listing description field
- Phase 1 scope: infrastructure + landing page + header + settings + description hint

## What's Been Completed
- [x] Created locale utilities (`src/lib/locale/index.ts`, `client.ts`)
- [x] Created `POST /api/locale` route (sets httpOnly cookie)
- [x] Created Spanish config files (`farmers-market.es.ts`, `food-trucks.es.ts`)
- [x] Extended `term()` and `getContent()` with locale parameter (backward-compatible)
- [x] Updated configs/index.ts with `localizedConfigs` registry
- [x] Created LanguageSelector component (compact + full variants)
- [x] Added LanguageSelector to Header (desktop + mobile menu)
- [x] Added LanguageSelector to settings page
- [x] Passed locale through HeaderWrapper → Header
- [x] Passed locale through landing page → all 11 landing components
- [x] Added bilingual hint under listing description textarea
- [x] All 1,190 tests passing
- [x] ESLint clean on new files

## Files Created
- `src/lib/locale/index.ts` — getLocale(), SUPPORTED_LOCALES, Locale type
- `src/lib/locale/client.ts` — getClientLocale(), setClientLocale()
- `src/app/api/locale/route.ts` — POST to set locale cookie
- `src/lib/vertical/configs/farmers-market.es.ts` — Spanish FM config (~170 strings)
- `src/lib/vertical/configs/food-trucks.es.ts` — Spanish FT config (~170 strings)
- `src/components/shared/LanguageSelector.tsx` — EN/ES toggle (compact + full variants)

## Files Modified
- `src/lib/vertical/terminology.ts` — added locale param to term(), getContent(), resolveConfig()
- `src/lib/vertical/configs/index.ts` — added localizedConfigs registry
- `src/components/layout/HeaderWrapper.tsx` — passes locale to Header
- `src/components/layout/Header.tsx` — accepts locale prop, renders LanguageSelector
- `src/app/[vertical]/settings/page.tsx` — added Language Preference section
- `src/app/[vertical]/page.tsx` — passes locale to all landing components
- `src/app/[vertical]/vendor/listings/ListingForm.tsx` — bilingual description hint
- All 11 landing components — accept locale prop, pass to term()/getContent()

## What Remains for Phase 2 (future session)
- [ ] Translate buyer-facing pages (browse, cart, checkout, orders, dashboard, auth)
- [ ] Create shared UI messages system (t() function for buttons, labels, errors)
- [ ] Status badge translations (order statuses, vendor statuses)
- [ ] Phase 3: Email/notification template translations
