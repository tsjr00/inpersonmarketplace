# Current Task: Session 70 — Live Cleanup and Audit
Updated: 2026-04-11

## Goal
Identify conflicts, gaps, and bad code affecting live users. Set up
error/problem logging as an ongoing process. Fix recurring issues that
prior sessions claimed to fix but didn't.

## Status
In progress. Most Session 70 commits shipped to staging via merge
`22a31dfe`. None on origin/main (prod) yet.

## Shipped on local main (not prod)
- `5f3dc456` — shared `getVendorProfileForVertical` utility + unit tests
- `20f3cd26` / `418d8f7c` / `95f0944f` — ERR_VENDOR_001 multi-vertical sweep (30+ routes + clients)
- `8a145a4b` — 7 events routes adopt shared helper
- `7de82c40` — `getTraditionalMarketUsage` now queries `listing_markets` junction (was querying non-existent `listings.market_id`, silently returning 0 → tier cap was unenforced)
- `c35c4ba2` — per-tier traditional market cap: free=3 / pro=5 / boss=8. New `POST /api/vendor/listings/[listingId]/markets` endpoint. `market-stats` + `ListingForm` adopt new contract.
- `40284ecb` — Playwright `actionTimeout` 10s → 30s
- `1d695beb` — market detail page: extract vendors-with-listings to lib. **This was the real fix for the "market profile shows 0 vendors" bug.** Verified 2026-04-11 via live HTML response on staging: all 7 Amarillo vendors rendered, `x-vercel-cache: MISS`, function runs in `iad1`.
- `dfd01923` — Protocol 8 (Error Log Review at every kickoff) added
- Session 69 carryover: migration 114 (vendor fee discount) applied all 3 envs, verified in current code

## Uncommitted working tree
- `MarketSelector.tsx` — tooltip + tier-cap explainer box. User decision: "can it wait."

## Open findings from 2026-04-11 code review (nothing changed yet)
- 3 routes still use direct `vendor_profiles.single()` and will 500 for multi-vertical users without `?vertical=` param:
  - `src/app/api/vendor/cover-image/route.ts:21`
  - `src/app/api/vendor/stripe/onboard/route.ts:28`
  - `src/app/api/vendor/stripe/status/route.ts:26`
- Dead endpoint: `POST /api/analytics/vitals` returns 404 on every page load (Web Vitals client reporter)
- `/api/manifest` returns 14 KB Vercel SSO HTML on unauthenticated requests — breaks PWA manifest parser on staging before SSO cookie is set
- CSP blocks `vercel.live/_next-live/feedback/feedback.js` — noisy console, not fatal
- `CLAUDE_CONTEXT.md` last updated Session 66. No entries for 67/68/69/70. FM tier limits section is out of sync with unified free/pro/boss in `vendor-limits.ts`.
- Backlog entry "market_vendors stale in SCHEMA_SNAPSHOT.md" is itself stale — snapshot was rebuilt 2026-04-05.

## Disproved during review (do not re-investigate without new evidence)
Four hypotheses for "market profile shows 0 vendors" were raised and
disproved by admin SQL + staging HTML inspection:
1. `vendor_profiles.status='approved'` filter mismatch — all 7 vendors approved
2. RLS on `vendor_profiles` blocking reads — public SELECT allows approved+not-deleted
3. `vendor_profiles.deleted_at` set — all 7 null
4. Force-dynamic / edge-cache theory — `x-vercel-cache: MISS`, function runs dynamically

The `1d695beb` refactor alone fixed the bug. Earlier staged
`export const dynamic = 'force-dynamic'` on `page.tsx` was unnecessary
and has been discarded. The "0 → 7" transition most likely reflects
staging deploy propagation lag — unproven but no code change needed.

## Decisions log entries added
- 2026-04-10: Server components must not fetch their own API routes via HTTP (already in `decisions.md`)

## Autonomy mode
Report.

## Next step
User decision: prod push of 10 shipped commits? Or continue with open findings?
