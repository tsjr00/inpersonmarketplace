# AC-6: Public/Private Data Split for ISR — Implementation Plan

**Status:** PLAN ONLY — not approved for implementation yet
**Created:** 2026-03-16 (Session 59)
**User concern:** "concerned about messing up what we have but want the performance win for when we add lots more trucks & vendors soon"

---

## What This Does

Currently every page hit runs a serverless function (~500ms). With ISR, public data is cached at the CDN edge and served in ~50ms. User-specific data (cart, tier, favorites) loads client-side after the page appears.

## How It Works (Browse Page as Proof of Concept)

### Current Architecture
```
Browser → Vercel Function → createClient() [calls cookies()] → Supabase
                             ↳ forces dynamic rendering (no caching)
                             ↳ fetches EVERYTHING: listings + user tier + location + availability
```
Every request = full server render = ~500ms TTFB

### Proposed Architecture
```
Browser → CDN (cached HTML, ~50ms) → shows listings immediately
       → Client JS hydrates → small API call for user-specific data
                               (tier badge, premium pricing, cart state)
```

### Step-by-Step Changes for Browse Page

**Step 1: Create anonymous Supabase client** (new file, ~10 lines)
```typescript
// src/lib/supabase/anon.ts
import { createClient } from '@supabase/supabase-js'
export const anonSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
// No cookies() call → page stays ISR-eligible
```

**Step 2: Split the browse page into two parts**

Server component (ISR-cached, renders immediately):
- Listings query (public data — all published listings)
- Market data (public)
- Availability status (public)
- Location filtering (from URL params, not cookies)
- Uses `anonSupabase` instead of `createClient()`
- Exports `revalidate = 300` (5 min cache, actually works now)

Client component (hydrates after page appears):
- Auth check (is user logged in?)
- Buyer tier (premium badge, pricing overlay)
- Location from cookie (if no URL param)
- Cart indicator
- Small, fast — one API call for user-specific overlay data

**Step 3: The page structure**
```tsx
// page.tsx (server component, ISR-cached)
export const revalidate = 300 // Actually works because no cookies()

export default async function BrowsePage({ params, searchParams }) {
  const listings = await anonSupabase.from('listings')... // public data
  const availability = await anonSupabase.rpc('get_listings_accepting_status', ...) // public

  return (
    <div>
      <BrowseFilters /> {/* server-rendered filter UI */}
      <ListingGrid listings={listings} />
      <BuyerOverlay /> {/* client component — loads user-specific data after hydration */}
    </div>
  )
}
```

```tsx
// BuyerOverlay.tsx ('use client')
// Fetches: auth state, buyer tier, premium pricing, cart badge
// Shows: tier badges on listings, adjusted prices for premium, cart count
// Loads AFTER page is visible — user sees listings immediately
```

## What Users Experience

**Before (current):**
1. Click browse → white screen / skeleton for ~500ms → listings appear

**After (with ISR):**
1. Click browse → listings appear in ~50ms (from CDN) → tier badges/prices overlay ~200ms later

The page feels instant. The brief moment before tier badges appear is barely noticeable.

## Safety / Risk Analysis

**What CAN'T break:**
- Data accuracy — same Supabase queries, same RLS (anon role can already read published listings — non-logged-in users browse today)
- Auth — middleware still runs on every request (auth refresh, vertical validation)
- Cart/checkout — untouched, stays fully dynamic
- Vendor/admin pages — untouched, stay fully dynamic

**What COULD go wrong:**
- Stale data (listing sold out but CDN shows available) — mitigated by 5-min revalidation + client-side availability check at cart/checkout
- Premium pricing shows base price briefly before overlay — acceptable tradeoff
- Location filtering from cookie won't work in ISR (cookies aren't read) — fallback to URL params or show all listings then filter client-side

**Rollback plan:**
- Revert to `createClient()` in the page = back to dynamic rendering instantly
- No migration, no database changes, no infrastructure changes
- Pure TypeScript/React refactoring

## Implementation Order (if approved)

1. **Browse page only** as proof of concept (~4-6 hours)
   - Create `anon.ts`
   - Split browse page into server (public) + client (user-specific)
   - Test on staging
   - Measure TTFB before/after
2. If browse works well → **Listing detail page** (~3-4 hours)
3. Then → **Markets page** and **Vendors page** (~2-3 hours each)

Each page is independent. Can stop after any step.

## Prerequisites
- Verify RLS allows anon SELECT on published listings, active markets, approved vendors (almost certainly yes — browse works for non-logged-in users today)
- No migrations needed
- No new dependencies needed

## Metrics to Measure
- TTFB before/after (staging)
- Time to First Contentful Paint
- Cache HIT rate in Vercel analytics
- User-specific overlay load time
