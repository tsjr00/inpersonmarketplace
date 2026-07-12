# Cost & Efficiency Anchors (aim the efficiency pass here)

For the "reduce API calls / query counts / token spend before re-release" goal. These are
**verified call-site inventories** (grep'd 2026-07-12) + the known cost patterns. Start from
these instead of hunting blind. File findings as `efficiency` / `token-cost` per the contract.

## Baselines to measure against (don't regress; look for wins beyond them)
- `.claude/PERFORMANCE_BASELINE.md` — per-page DB query counts + waterfall depth, **test-enforced** by `src/lib/__tests__/performance-baseline.test.ts`. Query count / sequential depth must not increase. Any efficiency change needs before/after here.
- Known heavy spot (already analyzed, deferred): **`get_listings_accepting_status`** runs once per listing via `LEFT JOIN LATERAL get_available_pickup_dates` on the browse page — the single slowest op at 50+ listings. Re-attack only with a measured set-based/cache win.
- Bundle: 153 chunks / ~5.4 MB, ceiling 200 chunks / 4.5 MB (PERF-R7).

## External API call sites (each is real $ / latency per call — check for redundancy + caching)

**Stripe SDK — 14 files** (`src/lib/stripe/{payments,webhooks,connect,reconcile,session-status,config}.ts`, `checkout/{session,success}`, `subscriptions/{checkout,verify}`, `vendor/fees/pay`, `vendor|buyer/tier/downgrade`, `vendor/subscription/downgrade-free`).
- Look for: multiple round-trips where one would do, re-fetching a Stripe object already in hand, `balance`/`accounts` lookups inside loops, missing idempotency keys (must be **deterministic** — never `Date.now()`), and redundant `retrieve` after `create`.

**Email (Resend) — 19 files.** Most go through the single pipe `src/lib/notifications/service.ts` (`sendNotification` = in-app row + email). Direct Resend sends also in: `market-manager/intake`, `event-requests`, `vendor/events/[marketId]/{respond,message,cancel}`, `events/[token]/{select,cancel}`, `admin/events/[id]`, `lib/events/complete-event.ts`, `lib/surveys/email.ts`, `cron/expire-orders`, `auth/send-email`, `vendor-leads`, `support`, `errors/report`, `image-moderation`, `webhooks/resend`.
- Look for: **fan-out loops calling `sendNotification` per recipient** where `sendNotificationBatch` exists — the fan-out sites (`complete-event`, `expire-orders`, event broadcasts, `surveys`) are the ones to check. One email per notification is a real cost at volume.

**Geocoding — 14 files**, central lib `src/lib/geocode.ts`. **VERIFIED** (`geocode.ts:14,49-96`): checks a static in-code `ZIP_LOOKUP` first (no call), then falls back to the **Census API and Nominatim — both FREE, no key**. So this is **not a billing cost** — at most a **latency** issue on a cache-miss ZIP (two sequential `fetch`es, each a 5s timeout). Possible latency win only: seed the (empty) `zip_codes` table or memoize per-ZIP. Low priority — do NOT file as API-spend.

**Moderation — VERIFIED (read both, don't re-investigate):**
- `src/lib/content-moderation.ts` (`isProfane`/`moderateText`, used by `checkFields`) = the **local `bad-words` npm library** (`content-moderation.ts:12`). **No external call, no token cost.** Not a cost anchor.
- `src/lib/image-moderation.ts` **does** call **Google Cloud Vision SafeSearch — one API call per image** (`image-moderation.ts:56-68`), **free ≤1,000 images/month**, fail-open if key missing/errors. Real **quota/$ anchor above 1k/mo** (image classification, not LLM tokens). Look for: the same image moderated more than once (re-upload / re-check on edit), or every resized variant checked instead of once per original.

## Supabase query cost — 77 `.rpc()` calls across 42 files
Hottest RPC sites (calls per file): `checkout/session` (5), `cart/items` (5), `cron/expire-orders` (5), `vendor/orders/[id]/fulfill` (4), `checkout/external` (3), `stripe/webhooks` (3), `cart/items/[id]`+`buyer/orders/[id]/confirm`+`book-season`+`markets/nearby`+`vendors/nearby`+`waves/reserve` (2 each). Plus non-RPC query volume everywhere.
- Look for: **N+1** (a query inside a `for`/`map` over rows), **sequential `await`** that could be `Promise.all`, `SELECT *` where a column list would do, and count/exists checks done as full fetches.
- Known N+1s: `cron/expire-orders` Phase 1 was batched (F6). **`cron/surveys` — CONFIRMED N+1** in `generateForMarketDay`: loops per vendor (`:389`) and per buyer (`:514`), each iteration firing a `count` query (`:429`,`:543`), a `user_profiles` email lookup (`:461`,`:568`), and a per-recipient `sendNotification` + `sendSurveyEmail` (no batching). `sendNotificationBatch` exists (`notifications/service.ts:618`); the per-recipient count + email lookups are the larger win. Check the other 3 crons for per-row queries.

## Rendering / caching cost
- ISR: browse is cached (`revalidate=300`). Check other high-traffic public pages (`markets`, `vendors`, `listing/[id]`) for cacheability without breaking the "server components don't self-fetch" rule.
- Per-request `auth.getUser()` round-trips (dashboard does auth guard + getUser sequentially — PERFORMANCE_BASELINE notes this). Look for pages doing auth work that could be deferred to a client overlay (the browse pattern).
- Client bundle: watch for heavy imports pulling into shared chunks; per-vertical code that ships to both.

## Suggested efficiency-pass method (token-cheap)
1. Pick a slice from `SYSTEM_MAP.md`. 2. Grep its files for `for (`/`.map(` wrapping an `await`, for `.rpc(`/`.from(` counts, and for the external-call sites above. 3. For each hit, read only enough to confirm the pattern + the fix. 4. File as `efficiency`/`token-cost` with a concrete **Cost note** (calls-now → calls-after). Don't propose a rewrite without a measured or countable saving.
