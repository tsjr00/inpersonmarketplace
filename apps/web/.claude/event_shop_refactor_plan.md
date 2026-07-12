# Event Shop Page — Perceived-Slowness Refactor Plan

**File under analysis:** `apps/web/src/app/[vertical]/events/[token]/shop/page.tsx`
**Sibling API:** `apps/web/src/app/api/events/[token]/shop/route.ts`
**Created:** 2026-04-11 (Session 70)
**Problem statement:** Page takes 1.5–3 seconds of "shell visible but empty" perceived wait before content appears.

---

## 1. Current Architecture (Verified by Code Read)

The file is **1,312 lines**, a single `'use client'` component that owns:

### State (38+ useState hooks)
- **Event data** — `event`, `schedule`, `vendors`, `pickupDate`, `isFT`
- **Auth** — `isLoggedIn`, `checkingAuth`
- **Cart** — `quantities` (Record<listingId, number>), `addingToCart`, `cartMessage`
- **Access code** (company_paid / hybrid) — `requiresAccessCode`, `accessCodeInput`, `accessCodeVerified`, `verifyingCode`, `accessCodeError`
- **Company allowance** (hybrid) — `companyCap`, `companyAllowanceUsed`
- **Payment model** — `paymentModel` (`attendee_paid` / `company_paid` / `hybrid`)
- **Wave ordering** (company_paid) — `waves`, `userReservation`, `selectedWaveId`, `reservingWave`, `waveError`
- **Radio-select** (one-per-attendee mode) — `selectedListingId`, `selectedVendorId`
- **Order placement** — `placingOrder`, `orderResult`

### Effects
- **Line 148** — `useEffect` → `fetch('/api/auth/me')` — auth check
- **Line 162** — `useEffect` → `fetch('/api/events/${token}/shop')` — main data fetch (sets 6+ state fields)

### Handlers
- `handleReserveWave` (line 343) — reserves a time slot
- `handleCancelReservation` (line 395) — releases a reservation
- `handleConfirmOrder` (line 428) — places order for company-paid flow
- `addVendorToCart` — adds a vendor's selected items to the cart via `useCart.addToCart`

### External dependencies
- **`useCart()` context** (line 104) — client-side React context from `@/lib/hooks/useCart`, provided by `CartProvider` wrapped around the `[vertical]/` layout
- **Next.js `Image`** — vendor logos + listing images, routed through Next.js image proxy

### Load waterfall (measured in theory, ~1.5–3s)
1. Server responds with HTML shell (~100ms)
2. Browser downloads + parses JS bundle (~500–1000ms)
3. React hydration (~100–300ms)
4. Two `useEffect` fetches fire in parallel:
   - `/api/auth/me`
   - `/api/events/${token}/shop` (6+ DB queries: catering_requests, market_vendors, vendor_profiles, event_vendor_listings, listings+listing_images embedded, event_waves, sometimes cart)
5. React re-renders with data (~50ms)
6. Images start loading (parallel, ~200–500ms each via Next.js image proxy)

Content is visible after steps 1–5 complete.

---

## 2. Why It Was Built This Way (From Prior Docs)

### Before Session 66
The shop page lived at `/events/[token]/shop` — **outside** the `[vertical]/` layout. This meant:
- No access to `CartProvider` (which wraps `[vertical]/` layout)
- No access to `useCart()` hook
- The shop page managed its OWN local `quantities` state and called `/api/cart/items` directly
- After a successful add, it had no way to refresh the server cart, so it cleared its local state — which made the sticky cart bar disappear visually

These behaviors are documented in detail in `apps/web/.claude/event_shop_issues_trace.md`. Five UX bugs (1–5) all traced to "event shop is outside CartProvider."

### Session 66 Decision
`CLAUDE_CONTEXT.md` session 66 history entry records:

> **Moved event pages under `[vertical]` layout for CartProvider access — shop page rewritten to use `useCart()`. This was not reversible (URLs changed, backend refs updated).**

And:

> **Decision (2026-03-30):** Event pages under `[vertical]` layout. CartProvider required for server-synced cart state. `/events/[token]/*` had disconnected local state causing 5 UX bugs. Logged in `apps/web/.claude/decisions.md`.

So the file now lives at `/[vertical]/events/[token]/shop/page.tsx` — **inside** the `[vertical]/` layout — specifically to get `CartProvider` via that layout.

### Why `'use client'` at the top
The `useCart()` hook is a React context consumer. React context consumers must be client components. Any component that calls `useCart()` **must** be `'use client'`.

**This is the core architectural constraint**: the file has to be a client component because it calls `useCart()`. That's the whole reason the data fetches happen post-hydration via `useEffect`.

---

## 3. What's Safe to Move Server-Side vs. What Must Stay Client

| Concern | Server-safe? | Why |
|---|---|---|
| Event metadata (name, dates, address, token) | ✅ Yes | Doesn't change per-user. Single DB read. Server-fetchable. |
| Vendor list + descriptions + logos | ✅ Yes | Changes only when vendors are accepted to event. Server-fetchable. |
| Listings (titles, descriptions, prices, images) | ✅ Yes | Static per listing. Server-fetchable. |
| Payment model, wave_ordering flag, company_cap | ✅ Yes | Event config, not user state. Server-fetchable. |
| Is logged in? | ✅ Yes | Server knows via cookies. Pass as prop. |
| Is FT? | ✅ Yes | Derivable from event.vertical_id. |
| Wave availability (which waves are open/full) | ⚠️ Mixed | Server can fetch at request time, but client needs to refetch after reservation. Server render is correct for first paint. |
| Access code state (typed/verified) | ❌ Client only | User interaction state. |
| Wave reservation | ❌ Client only | Mutation, user interaction. |
| Cart (quantities, added state) | ❌ Client only | `useCart()` context — client only by definition. |
| Radio-select state (one-per-attendee) | ❌ Client only | User interaction state. |
| Order placement / result | ❌ Client only | Mutation. |

**The "read-only for first paint" data is all server-fetchable. The volatile interactive state is not.**

---

## 4. Refactor Plan (Option 2 — Server Wrapper + Client Core)

### Target architecture

```
[vertical]/events/[token]/shop/
├── page.tsx          ← SERVER component. Fetches event data server-side,
│                       passes it as initial props to ShopClient.
└── ShopClient.tsx    ← CLIENT component. Owns all useState, useCart(), useEffect
                        for interactive concerns. Receives initialData prop.
```

### Step-by-step

**Step 1: Extract the data fetch into a shared lib function.**

Path: `apps/web/src/lib/events/shop-data.ts` (new file)

Function: `getEventShopData(supabase, token)` — returns the same shape the API route returns.

The API route at `apps/web/src/app/api/events/[token]/shop/route.ts` imports this lib and calls it (thin wrapper, matches the Session 70 `vendors-with-listings` pattern at `src/lib/markets/vendors-with-listings.ts`).

**Result:** one function, two callers (server component + API route). Same pattern you already approved for the market detail page.

**Rollback at Step 1:** trivial. If something breaks, `git checkout` the lib file and route file. No runtime behavior changes yet.

---

**Step 2: Rename the existing `page.tsx` → `ShopClient.tsx`.**

No code changes inside the file. Just rename. The file stays `'use client'`, keeps all 38 useStates, keeps `useCart()`, keeps the useEffect fetches.

Update the new default export name from `EventShopPage` → `ShopClient`.

**Rollback at Step 2:** `git mv` back.

---

**Step 3: Create a new `page.tsx` as a server component.**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getEventShopData } from '@/lib/events/shop-data'
import { ShopClient } from './ShopClient'
import { notFound } from 'next/navigation'

export default async function EventShopPage({
  params,
}: {
  params: Promise<{ vertical: string; token: string }>
}) {
  const { vertical, token } = await params
  const supabase = await createClient()

  const initialData = await getEventShopData(supabase, token)
  if (!initialData || initialData.reason === 'not_found') {
    notFound()
  }

  // Server knows auth state via cookies
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  return (
    <ShopClient
      vertical={vertical}
      token={token}
      initialData={initialData}
      isLoggedInInitial={isLoggedIn}
    />
  )
}
```

**Rollback at Step 3:** delete the new `page.tsx`, `git mv ShopClient.tsx page.tsx`, done. 5 minutes.

---

**Step 4: Update `ShopClient.tsx` to consume `initialData` prop.**

Changes inside the client component:

- Accept new props: `initialData`, `isLoggedInInitial` (+ vertical, token).
- Change `useState(null)` → `useState(initialData.event)` for event data fields.
- Similarly pre-populate `vendors`, `schedule`, `paymentModel`, `waveOrderingEnabled`, `waves`, `isFT`, etc. from `initialData`.
- `useState(isLoggedInInitial)` instead of false for auth state.
- **Keep** the `useEffect` at line 162 ONLY as a refresh path — guard it with a condition so it doesn't re-fetch on mount if `initialData` is present, or turn it into a manual-refetch function called after a mutation.
- **Keep** the `useEffect` at line 148 (`/api/auth/me`) — it's a redundant check now, but the overhead is minimal. Can also be deleted in Step 5.

**Rollback at Step 4:** the client component is now dependent on props. Rolling back means removing prop usage and re-adding the old fetch-on-mount behavior. 30 min of reverse-edit work. OR: just `git checkout -- ShopClient.tsx` and accept that the server component was a no-op wrapper for a render.

---

**Step 5: Remove the redundant `/api/auth/me` fetch.**

The server component already knows auth state. Delete the useEffect at line 148 and the auth state `useState` — replace with the prop.

**Rollback at Step 5:** restore the useEffect. Trivial.

---

**Step 6: Keep a client-side "refresh data" function for mutations.**

After the user reserves a wave, cancels a reservation, places an order, or verifies an access code, the page needs fresh data. Add a `refetchData()` function that calls `/api/events/[token]/shop` and updates state. Wire it into the existing mutation handlers (`handleReserveWave`, `handleCancelReservation`, `handleConfirmOrder`).

This ensures the post-mutation UI still shows correct wave availability, cart state, etc.

**Rollback at Step 6:** remove the refetch function, mutations no longer refresh data (minor UX regression but no crash).

---

### Expected Outcome

- **First paint:** full vendor grid with images visible as soon as HTML arrives from server (saves the ~1.5s hydrate+fetch waterfall)
- **Images:** start loading in browser during HTML parse, not after JS finishes
- **Hydration:** still happens, but doesn't block content visibility
- **Interactive behavior:** unchanged (cart, wave reservation, order placement, access code all work as today)
- **Perceived speed improvement:** 1–2 seconds

---

## 5. Rollback Options

### Full rollback
If any step introduces a bug we can't trace quickly:

```
git revert <refactor-commit-hash>
git push origin staging
```

Because the refactor is a single logical unit, reverting the whole commit restores the current client-only architecture. No data migrations, no schema changes, no breaking callers.

### Partial rollback per step
Each step is in isolation — step 1 is a pure lib extraction, step 2 is a pure rename, step 3 is an additive server wrapper, etc. If step 4 (consume props) breaks interactivity, we can:

- `git checkout -- apps/web/src/app/[vertical]/events/[token]/shop/ShopClient.tsx` to restore client-only fetch behavior
- Keep the server wrapper as a pass-through (it just renders ShopClient without passing data)
- The page still works, just without the speed improvement

### Canary rollback (optional, nice-to-have)
Wrap the entire refactor in a feature flag:

```tsx
const USE_SERVER_RENDERED_SHOP = process.env.NEXT_PUBLIC_SERVER_SHOP === 'true'

if (USE_SERVER_RENDERED_SHOP) {
  // new path
} else {
  // old path (return <ShopClient /> without props)
}
```

Ship it off by default. Flip the env var on staging. Test. If OK, flip on prod. If broken on staging, flip off, no rollback needed.

**Cost:** one env var + one conditional wrapper. Small.
**Benefit:** production-safe rollout with no revert.

---

## 6. Testing Plan

### Pre-refactor baseline measurement
Before touching code, record current perceived load time on staging:

1. Open `/farmers_market/events/fake-test-jbmefl/shop` in an incognito window
2. Open DevTools → Network tab → Disable cache
3. Reload and measure:
   - **First Contentful Paint (FCP)** — from Performance tab
   - **Largest Contentful Paint (LCP)** — from Performance tab
   - **Total page weight** — Network tab sum
4. Record numbers in this doc or a scratch file

### Post-refactor comparison
Same measurements after each step. Look for:

- FCP should drop (server-rendered content shows sooner)
- LCP should drop (images start loading earlier)
- Total page weight should be similar or slightly less (no duplicate auth/shop API calls)

### Functional regression checks
- Load event shop, see vendor cards + images immediately
- Add items to cart, see `✓ N in cart` indicator (the fix from earlier in Session 70)
- Leave and return to shop page, verify cart state persists
- Reserve a wave (company-paid flow), verify UI updates
- Cancel reservation, verify wave becomes available again
- Submit an order (company-paid flow), verify success message
- Enter access code (hybrid flow), verify allowance banner appears
- Test with invalid event token → expect graceful not-found UI
- Test logged out → expect auth gating to work

### Playwright smoke coverage
Add tests in `e2e/smoke.spec.ts`:

- `/farmers_market/events/invalid-token/shop` → status < 500 (already added in Session 70)
- `/food_trucks/events/invalid-token/shop` → status < 500 (already added in Session 70)
- Optional: `/farmers_market/events/fake-test-jbmefl/shop` → h1 or listing card visible within 2s (hard-coded token test — only runs against staging data)

---

## 7. What NOT to Touch

Do NOT modify in this refactor:

- `apps/web/src/app/api/events/[token]/shop/route.ts` — the API route stays. The server component calls the SAME lib function the route uses, so both paths serve the same data.
- `apps/web/src/lib/hooks/useCart.ts` — cart state management stays exactly as is.
- `apps/web/src/app/[vertical]/layout.tsx` — `CartProvider` stays.
- `apps/web/src/app/api/cart/items/route.ts` — CRITICAL PATH FILE. Do not touch. Per `.claude/rules/critical-path-files.md`.
- Stripe or checkout routes. Unrelated to this refactor.
- Database schema. Zero migrations needed.
- `ShopClient.tsx`'s mutation handlers — keep all the existing logic, just change where initial data comes from.

---

## 8. Deferred / Out of Scope

- **Streaming with `Suspense`** — further speed improvement but adds complexity. Defer.
- **Route-level ISR / caching** — the shop data is user-auth-dependent (price gating) and inventory-volatile. Caching would introduce staleness bugs. Skip.
- **Image preload hints** — minor impact. Add later if the refactor doesn't get perceived speed all the way there.
- **Splitting the 1,312-line file into multiple components** — helpful for maintainability but orthogonal to perceived speed. Separate refactor.
- **Replacing useCart with a store (Zustand, etc.)** — would break other pages. Not doing.

---

## 9. Effort & Risk Estimate

| Step | Effort | Risk | Rollback complexity |
|---|---|---|---|
| 1. Extract lib function | 30 min | Very low | Trivial (`git checkout`) |
| 2. Rename page.tsx → ShopClient.tsx | 5 min | Very low | Trivial |
| 3. Create new server page.tsx | 30 min | Low | Delete file + rename back |
| 4. Consume initialData prop | 60–90 min | Medium | 30 min of reverse-edit OR `git checkout` |
| 5. Remove redundant auth fetch | 10 min | Very low | Trivial |
| 6. Add refetchData for mutations | 30 min | Medium | Remove function |
| **Total** | **~3 hours** | **Medium** | **One revert commit** |

---

## 10. Sequence of Commits (Recommended)

Split into 3 commits for clean rollback:

1. **Commit A** — `refactor: extract event shop data fetch to shared lib` — Steps 1 only. Both the API route and (future) server component call it. No runtime behavior change. Safe to ship alone.

2. **Commit B** — `refactor: event shop — server wrapper + client core split` — Steps 2-4. This is the big one. All behavior changes happen here.

3. **Commit C** — `refactor: event shop — drop redundant auth fetch + add mutation refetch` — Steps 5-6. Polish and correctness.

If Commit B causes problems, `git revert <B>` restores the pre-refactor client-only architecture, and Commit A is still valid (both the route and the old client component can call the lib).

---

## 11. Prerequisites Before Starting

- [ ] This plan reviewed and approved
- [ ] Baseline load-time measurements taken on staging (Step 6 of testing plan)
- [ ] Staging is clean and matches local main (verified via `git log origin/staging --oneline -5`)
- [ ] No other active work on the event shop path
- [ ] Vault snapshot confirmed — `apps/web/.claude/vault-manifest.md` does NOT currently list the event shop page in vaulted systems; if it does before starting, diff vault first per `.claude/rules/vault-protocol.md`

---

## 12. Done Criteria

- [ ] `apps/web/src/lib/events/shop-data.ts` exists and is called by both the API route and the new server component
- [ ] `apps/web/src/app/[vertical]/events/[token]/shop/page.tsx` is a server component (no `'use client'`)
- [ ] `apps/web/src/app/[vertical]/events/[token]/shop/ShopClient.tsx` exists and handles interactivity
- [ ] ShopClient receives `initialData` as a prop and does not fetch it on mount
- [ ] `npx tsc --noEmit` passes
- [ ] All 49 Playwright smoke tests pass on pre-push
- [ ] Vendor descriptions, images, cart indicator, and wave reservation UI behave identically to today
- [ ] Staging load time (FCP) measurably faster than the pre-refactor baseline
- [ ] No bugs reported after 24 hours on staging before considering prod push
