# Current Task: Session 58 — i18n Phase 1: Supporting Pages Translation

Started: 2026-03-15

## Status: IN PROGRESS — 6 of 7 supporting pages translated, build passes

## Commits This Session
1. `f6d6717` — API route guard tests (14) + component render tests (68)
2. `43cf399` — i18n Phase 1: English/Spanish language toggle (25 files, 734 insertions)
3. `334a55a` — Build fix: split locale server code from client-safe index
4. `76a3be5` — Fix landing page i18n: translate hardcoded strings in LocationEntry + Footer
5. `9238bc1` — i18n: translate Header nav, Hero banner, and fix locale passthrough

## Branch State
- Main: 12 commits ahead of origin/main
- Staging: synced with main (all commits pushed, user confirmed landing page working in Spanish)

## What's DONE (Landing Page + Header)
- Cookie-based locale system: `locale` httpOnly cookie, 1-year TTL, default `en`
- `src/lib/locale/` — index.ts (shared), server.ts (getLocale), client.ts (getClientLocale/setClientLocale)
- `src/app/api/locale/route.ts` — POST to set locale cookie
- Spanish configs: `farmers-market.es.ts` + `food-trucks.es.ts` (~170 strings each)
- `src/lib/vertical/terminology.ts` — `term()` and `getContent()` extended with optional `locale` param
- `src/lib/locale/messages/` — en.ts, es.ts, index.ts with `t(key, locale, vars?)` function
- LanguageSelector component (compact + full variants) on Header + Settings page
- All 11 landing components accept and pass `locale` prop
- Header: all `term()` calls pass `locale`, hardcoded strings use `t()` (Dashboard, Login, Sign Up, Settings, Logout, Admin Dashboard, Pending)
- Hero: passes `locale` to LocationEntry, FT stats banner translated
- LocationEntry: 8 strings translated via `t()`
- Footer: 19 strings translated via `t()` (section titles, links, taglines, copyright)
- Vendor listing form: bilingual tip under description textarea

## What's IN PROGRESS — Supporting Pages

User tested staging and confirmed landing page + header fully translates. Then listed 7 pages still English:
- ✅ features (`/[vertical]/features/page.tsx`) — SERVER, ~40 strings + getContent(locale) + term(locale)
- ✅ how-it-works (`/[vertical]/how-it-works/page.tsx`) — CLIENT, ~60 strings + term(locale)
- ✅ help (`/[vertical]/help/page.tsx`) — SERVER, ~10 strings via t()
- ✅ signup (`/[vertical]/signup/page.tsx`) — CLIENT, ~15 strings via t()
- ❌ vendor-signup (`/[vertical]/vendor-signup/page.tsx`) — DEFERRED (1015 lines, ~80-90 strings)
- ✅ about (`/[vertical]/about/page.tsx`) — CLIENT, ~22 strings via t() + term(locale)
- ✅ terms (`/[vertical]/terms/page.tsx`) — CLIENT, 1 string via t()

### Approach Decided
- Add ALL message keys to `src/lib/locale/messages/en.ts` and `es.ts` (namespaced by page prefix)
- Server components: import `getLocale` from `@/lib/locale/server`
- Client components: import `getClientLocale` from `@/lib/locale/client`
- Both use `t(key, locale, vars?)` from `@/lib/locale/messages`
- Strings with dynamic vertical terms use `{variable}` interpolation
- Some pages use `getContent(vertical)` / `term(vertical, key)` which ALSO need `locale` param added

### Current State of en.ts / es.ts
- Already have ~58 keys each (hero, location, footer, header sections)
- Need ~200+ more keys for the 7 supporting pages
- Files are at `src/lib/locale/messages/en.ts` and `es.ts`

### Page-by-page notes (from reading all files):

**help page** (SERVER component):
- Strings: "← Back to Dashboard", "← Browse", "Help & FAQ", subtitle, "Can't find...", "Contact Support", response time, setup guide title+desc
- Uses `createServiceClient` for knowledge articles — article content stays in DB language

**about page** (CLIENT, uses `useParams`):
- Has long prose paragraphs with embedded `term()` calls (no locale passed)
- `term()` calls: vendor_people, vendors, display_name, product_examples, products, markets, market, market_boxes, vendor, market_day, market_hours
- Section headings: Our Mission, What We Do, For {vendors}, Contact Us
- FM-only cottage food paragraph
- Contact section with support link

**terms page** (CLIENT, uses `useParams`):
- Just 1 hardcoded string: "These terms were last reviewed in March 2026..."
- Legal docs from `src/lib/legal` — translating legal docs is a SEPARATE concern (Phase 3+)

**signup page** (CLIENT, uses `use(params)`):
- Form labels: Full Name, Email, Password, Confirm Password
- Buttons: Sign Up, Creating account...
- Validation: password mismatch, length, complexity
- States: Loading..., Account Created!, redirect message
- Nav: Home, Already have an account? Login
- Show/Hide password titles

**features page** (SERVER component):
- Uses `getContent(vertical)` for some strings (hero_subtitle, shopper descriptions, vendor descriptions)
- BUT `getContent(vertical)` call has NO locale — needs `getContent(vertical, locale)`
- Also uses `term(vertical, key)` without locale — needs `term(vertical, key, locale)`
- ~40 hardcoded strings: section titles, feature card titles+descriptions, CTA buttons
- FT vs FM conditional text in several places
- Footer component rendered at bottom — already translated

**how-it-works page** (CLIENT, uses `useParams`):
- Heavy prose: step lists, info cards with detailed instructions
- Uses `term()` without locale in ~10 places — needs locale added
- ~60 hardcoded strings across sections: For Buyers, For Vendors, Pickup Guide, Cancellations
- Sub-components: SectionHeader, StepList, InfoCard, PickupStepList (all inline, receive strings as props)
- JSON-LD structured data has hardcoded English (SEO — lower priority)

**vendor-signup** — NOT YET READ. 1015 lines, ~80-90 strings. Deferred to later batch.

## Architecture Notes
- Two translation systems working together:
  - `term(vertical, key, locale)` / `getContent(vertical, locale)` — vertical-specific terminology + content blocks
  - `t(key, locale, vars?)` — shared UI chrome (buttons, labels, page-specific text)
- Client components use `getClientLocale()` from `@/lib/locale/client` (reads document.cookie, SSR-safe)
- Server components use `getLocale()` from `@/lib/locale/server` (reads next/headers cookie)
- Legal documents (terms page) stay in English for now — translating legal text needs review

## Files Modified This Session
- `src/lib/locale/index.ts` — shared constants (CREATED)
- `src/lib/locale/server.ts` — getLocale() server-only (CREATED)
- `src/lib/locale/client.ts` — getClientLocale/setClientLocale (CREATED)
- `src/app/api/locale/route.ts` — POST endpoint (CREATED)
- `src/lib/locale/messages/en.ts` — English UI messages, 58 keys (CREATED)
- `src/lib/locale/messages/es.ts` — Spanish UI messages, 58 keys (CREATED)
- `src/lib/locale/messages/index.ts` — t() function (CREATED)
- `src/lib/vertical/configs/farmers-market.es.ts` — Spanish FM config (CREATED)
- `src/lib/vertical/configs/food-trucks.es.ts` — Spanish FT config (CREATED)
- `src/components/shared/LanguageSelector.tsx` — EN/ES toggle (CREATED)
- `src/lib/vertical/terminology.ts` — resolveConfig() + locale param
- `src/lib/vertical/configs/index.ts` — localizedConfigs registry
- `src/components/layout/HeaderWrapper.tsx` — passes locale to Header
- `src/components/layout/Header.tsx` — locale on all term() calls + t() for hardcoded strings
- `src/components/landing/Hero.tsx` — locale to LocationEntry + t() for FT banner
- `src/components/landing/LocationEntry.tsx` — 8 strings via t()
- `src/components/landing/Footer.tsx` — 19 strings via t()
- `src/app/[vertical]/settings/page.tsx` — Language Preference section
- `src/app/[vertical]/page.tsx` — passes locale to all landing components
- `src/app/[vertical]/vendor/listings/ListingForm.tsx` — bilingual description hint
- All 11 landing components — locale prop added

## Next Steps (for continuation)
1. Add ~200 message keys to en.ts and es.ts for all supporting pages
2. Update each page to use t() and pass locale to term()/getContent()
3. Priority order: help → terms → signup → about → features → how-it-works → vendor-signup
4. Commit + push staging after each batch or all together
5. User tests on staging

## Key Decisions
- Cookie-based i18n (NOT URL-based) — avoids restructuring [vertical] routing
- Vendor-generated content stays in original language (not translated)
- Legal documents (terms/privacy) stay English for now
- `t()` for UI chrome, `term()`/`getContent()` for vertical-specific content
- Supporting pages are a significant effort (~200 strings) but user explicitly requested them
