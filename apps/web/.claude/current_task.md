# Current Task: Session 58 — i18n Phase 1: Fix Deployment Error

Started: 2026-03-15

## Status: IN PROGRESS — Fixing Vercel build error (server/client split)

## The Problem
Vercel/Turbopack build failed because `src/lib/locale/index.ts` imports `cookies` from `next/headers` (server-only), but client components also import from this file (for types like `Locale`, constants like `SUPPORTED_LOCALES`, and functions like `getLocaleLabel`).

## Fix In Progress (PARTIALLY DONE)
Need to split `getLocale()` (which uses `next/headers`) into a separate server-only file.

### Step 1: DONE — Remove `cookies` import from index.ts
- `src/lib/locale/index.ts` — Already edited: removed `import { cookies }` and `getLocale()` function. Now only has shared constants/types/utils (client-safe).

### Step 2: TODO — Create server.ts with getLocale()
- Create `src/lib/locale/server.ts` with:
```typescript
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, DEFAULT_LOCALE, isValidLocale } from './index'
import type { Locale } from './index'

export async function getLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies()
    const value = cookieStore.get(LOCALE_COOKIE)?.value
    if (value && isValidLocale(value)) return value
  } catch {
    // Outside of server component context
  }
  return DEFAULT_LOCALE
}
```

### Step 3: TODO — Update imports in 4 server files
These files currently import `getLocale` from `@/lib/locale` and need to change to `@/lib/locale/server`:
1. `src/components/layout/HeaderWrapper.tsx` — `import { getLocale } from '@/lib/locale'` → `import { getLocale } from '@/lib/locale/server'`
2. `src/app/[vertical]/settings/page.tsx` — same change
3. `src/app/[vertical]/page.tsx` — same change
4. `src/app/api/locale/route.ts` — uses `SUPPORTED_LOCALES` and `LOCALE_COOKIE` from `@/lib/locale` (already client-safe, NO change needed)

### Step 4: TODO — Commit and push staging

## What Was Already Committed (commit `43cf399`)
The i18n Phase 1 feature is complete and committed. This is just a deployment fix for the server/client module boundary.

## Session 58 Full Context

### Commits This Session
1. `f6d6717` — API route guard tests (14) + component render tests (68). 1,190 tests all passing.
2. `43cf399` — i18n Phase 1: English/Spanish language toggle on landing + settings. 25 files, 734 insertions.

### i18n Phase 1 — What Was Built
- **Locale system**: Cookie-based (`locale` httpOnly cookie, 1-year TTL, default `en`)
- **No new npm packages**, no URL changes, no routing restructure
- **Extended `term()` and `getContent()`** with optional `locale` param — backward-compatible
- **Spanish configs**: `farmers-market.es.ts` + `food-trucks.es.ts` (~170 strings each)
- **LanguageSelector component**: compact (header) + full (settings/mobile)
- **Settings page**: New "Language" section between Notifications and Delete Account
- **Header**: LanguageSelector in desktop right side + mobile menu bottom
- **Vendor listing form**: Bilingual tip under description textarea
- **All 11 landing components** updated to accept and pass `locale` prop

### Files Created
- `src/lib/locale/index.ts` — shared constants, types, utils (client-safe)
- `src/lib/locale/client.ts` — getClientLocale(), setClientLocale()
- `src/lib/locale/server.ts` — TODO: create with getLocale() (server-only)
- `src/app/api/locale/route.ts` — POST to set locale cookie
- `src/lib/vertical/configs/farmers-market.es.ts` — Spanish FM config
- `src/lib/vertical/configs/food-trucks.es.ts` — Spanish FT config
- `src/components/shared/LanguageSelector.tsx` — EN/ES toggle

### Files Modified
- `src/lib/vertical/terminology.ts` — resolveConfig() + locale param on term(), getContent()
- `src/lib/vertical/configs/index.ts` — localizedConfigs registry
- `src/components/layout/HeaderWrapper.tsx` — passes locale to Header
- `src/components/layout/Header.tsx` — accepts locale, renders LanguageSelector
- `src/app/[vertical]/settings/page.tsx` — Language Preference section
- `src/app/[vertical]/page.tsx` — passes locale to all landing components
- `src/app/[vertical]/vendor/listings/ListingForm.tsx` — bilingual description hint
- All 11 landing components in `src/components/landing/` — locale prop

### Branch State
- Main: 9 commits ahead of origin/main
- Staging: synced with main (but build failed — needs this fix)
- All 1,190 tests passing locally

### Phase 2 (Future Session)
- Translate buyer-facing pages (browse, cart, checkout, orders, dashboard, auth)
- Create shared UI messages system (t() function for buttons, labels, errors)
- Status badge translations
- Phase 3: Email/notification translations
