# Current Task: Session 58 — i18n Phase 1: Supporting Pages Translation

Started: 2026-03-15

## Status: IN PROGRESS — Client component locale cookie bug being fixed

## Commits This Session
1. `f6d6717` — API route guard tests (14) + component render tests (68)
2. `43cf399` — i18n Phase 1: English/Spanish language toggle (25 files, 734 insertions)
3. `334a55a` — Build fix: split locale server code from client-safe index
4. `76a3be5` — Fix landing page i18n: translate hardcoded strings in LocationEntry + Footer
5. `9238bc1` — i18n: translate Header nav, Hero banner, and fix locale passthrough
6. `f343d9e` — i18n: translate 6 supporting pages (help, terms, signup, about, features, how-it-works)
7. `fb8ead9` — Fix i18n client components: add readable `locale_client` cookie

## Branch State
- Main: 14 commits ahead of origin/main
- Staging: synced with main through commit `fb8ead9`

## CRITICAL BUG — Client Components Not Translating

### Problem
User tested staging after commits 6+7 and reported:
- **Server components WORK**: features page fully translates, help page system text translates
- **Client components DO NOT translate**: signup, about, how-it-works, terms all still English
- Help articles from DB are English (expected — DB content)
- Legal docs on terms page are English (expected — from `src/lib/legal`)
- vendor-signup not translated yet (deferred)

### Root Cause
The `locale` cookie was set as **httpOnly** when the user originally toggled to Spanish.
- Server components read it via `next/headers` → works ✅
- Client components read via `document.cookie` → **httpOnly cookies are invisible to JS** → always returns 'en' ❌

### Fix Attempt 1 (commit `fb8ead9`)
Added a SECOND cookie `locale_client` (non-httpOnly) in `POST /api/locale`.
Changed `getClientLocale()` to read `locale_client` instead of `locale`.
**Problem**: Only works if user re-toggles language AFTER the fix is deployed. Users who set language BEFORE the fix still only have the httpOnly cookie — `locale_client` was never set for them.

### Fix Attempt 2 (IN PROGRESS — NOT YET COMMITTED)
Added middleware sync in `src/middleware.ts`:
- On every request, middleware reads the httpOnly `locale` cookie (server can see it)
- If `locale_client` cookie is missing or mismatched, middleware sets it on the response
- This auto-creates the readable cookie for ALL users on their next page load, no re-toggle needed

**Current state of middleware.ts**: Edit is IN PLACE in the file but NOT build-verified and NOT committed.
The middleware imports `LOCALE_COOKIE` and `isValidLocale` from `@/lib/locale`.
The sync block is at the end of the middleware function, before `return response`.

### What Needs to Happen Next
1. Build-verify the middleware change (`npx next build`)
2. Commit the middleware fix
3. Push to staging
4. User tests — on first page load, middleware should create `locale_client` cookie from existing httpOnly `locale` cookie
5. ALL client pages (signup, about, how-it-works, terms) should then translate

## What's Translated (Code Complete)

### Server Components (WORKING on staging)
- **features** (`/[vertical]/features/page.tsx`) — ~48 strings via t() + getContent(vertical, locale) + term(vertical, key, locale) + Footer gets locale prop
- **help** (`/[vertical]/help/page.tsx`) — ~10 system strings via t() (articles from DB stay English)

### Client Components (code is correct, blocked by cookie bug)
- **how-it-works** (`/[vertical]/how-it-works/page.tsx`) — ~68 strings via t() + term(locale)
- **about** (`/[vertical]/about/page.tsx`) — ~22 strings via t() + all term() calls pass locale
- **signup** (`/[vertical]/signup/page.tsx`) — ~15 strings via t()
- **terms** (`/[vertical]/terms/page.tsx`) — 1 string via t() (legal docs from src/lib/legal stay English)

### NOT Translated
- **vendor-signup** — 1015 lines, ~80-90 strings, deferred
- **Help articles** — content from `knowledge_articles` DB table (not translateable via code)
- **Legal documents** — from `src/lib/legal`, intentionally left English for now

## Architecture Notes

### Cookie System (current state after fix attempts)
- `locale` — httpOnly cookie, set by `POST /api/locale`. Read by server components via `getLocale()` (next/headers).
- `locale_client` — non-httpOnly cookie. Set by `POST /api/locale` AND synced by middleware. Read by client components via `getClientLocale()` (document.cookie).
- `getClientLocale()` in `src/lib/locale/client.ts` reads `locale_client` (not `locale`)
- `setClientLocale()` POSTs to `/api/locale` which sets BOTH cookies, then reloads page

### Translation Systems
- `term(vertical, key, locale)` / `getContent(vertical, locale)` — vertical-specific terminology + content blocks
- `t(key, locale, vars?)` — shared UI chrome from `src/lib/locale/messages/`
- en.ts and es.ts have ~200 keys each (hero, location, footer, header, help, terms, signup, about, features, hiw)

### Key Files
- `src/lib/locale/index.ts` — shared constants, LOCALE_COOKIE, isValidLocale
- `src/lib/locale/server.ts` — getLocale() (server only, reads next/headers)
- `src/lib/locale/client.ts` — getClientLocale() reads `locale_client` cookie, setClientLocale()
- `src/app/api/locale/route.ts` — POST sets both `locale` (httpOnly) and `locale_client` cookies
- `src/middleware.ts` — syncs `locale` → `locale_client` on every request (FIX IN PROGRESS)
- `src/lib/locale/messages/en.ts` — ~200 English message keys
- `src/lib/locale/messages/es.ts` — ~200 Spanish message keys
- `src/lib/locale/messages/index.ts` — t(key, locale, vars?) function

## Files Modified This Session (cumulative)
- All files from previous commits (see commits 1-5 above)
- `src/lib/locale/messages/en.ts` — expanded from ~58 to ~200 keys
- `src/lib/locale/messages/es.ts` — expanded from ~58 to ~200 keys
- `src/app/[vertical]/help/page.tsx` — added getLocale + t() calls
- `src/app/[vertical]/terms/page.tsx` — added getClientLocale + t() call
- `src/app/[vertical]/signup/page.tsx` — added getClientLocale + t() calls
- `src/app/[vertical]/about/page.tsx` — added getClientLocale + t() + locale on all term() calls
- `src/app/[vertical]/features/page.tsx` — added getLocale + t() + locale on getContent/term + Footer locale
- `src/app/[vertical]/how-it-works/page.tsx` — added getClientLocale + t() + locale on term() calls
- `src/app/api/locale/route.ts` — now sets both httpOnly and non-httpOnly cookies
- `src/lib/locale/client.ts` — reads `locale_client` instead of `locale`
- `src/middleware.ts` — locale cookie sync (UNCOMMITTED)

## Key Decisions
- Cookie-based i18n (NOT URL-based) — avoids restructuring [vertical] routing
- Vendor-generated content stays in original language (not translated)
- Legal documents (terms/privacy) stay English for now — translating legal text needs review
- Help articles from DB stay in DB language
- `t()` for UI chrome, `term()`/`getContent()` for vertical-specific content
- Two cookies: httpOnly for server, non-httpOnly for client — synced by middleware
