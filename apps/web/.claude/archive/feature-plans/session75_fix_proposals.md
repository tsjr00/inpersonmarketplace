# Session 75 — Fix Proposals

**Status:** Report mode. NO edits made. Each proposal awaits user approval.
**Companion to:** `session75_codebase_audit.md`
**Convention:** Each proposal lists file, lines, before/after, blast radius, critical-path flag, test impact, rollback. Critical-path files (per `.claude/rules/critical-path-files.md`) require **per-file approval** even within an approved batch.

---

# Recommended ship order

Risk-weighted, with non-critical-path fixes shipping first to land low-risk wins:

1. **P1-6** — lint fix (1 file, 1 line, no behavior change)
2. **P1-8** — schema snapshot regen (doc-only; user runs REFRESH_SCHEMA.sql)
3. **P0-1** — event my-order route (non-critical-path file)
4. **P1-3** — vendor notification template enrichment (non-critical-path)
5. **P1-2** — chargeback dedup (CRITICAL-PATH `webhooks.ts`)
6. **P0-2** — Phase 5 cron source_transaction (CRITICAL-PATH `expire-orders/route.ts`)
7. **P1-1** — cart market box cross-event isolation (CRITICAL-PATH `cart/items/route.ts`)
8. **P1-5** — market box refund underpay (CRITICAL-PATH `webhooks.ts`)
9. **P1-7** — listing publish server-side gate (new API route + client refactor)
10. **P0-3** — event cancel auto-refund (CRITICAL-PATH `webhooks.ts` / payments — biggest fix; design call needed)

After P1-6 + P1-8 ship → re-run vitest. After each critical-path fix ships → Tier 1 smoke test on staging before pushing to prod.

---

# P1-6: Fix `set-state-in-effect` lint error in OrganizerEventDetails

**File:** `src/components/events/OrganizerEventDetails.tsx`
**Lines:** 109-111
**Critical-path:** No
**Blast radius:** This component only. UX unchanged.

## Before
```tsx
useEffect(() => {
  if (expanded && !details) loadDetails()
}, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps
```

## After (option A — minimal, fixes the rule)
```tsx
useEffect(() => {
  if (expanded && !details) {
    queueMicrotask(() => { void loadDetails() })
  }
}, [expanded, details])
```

`queueMicrotask` defers the state-mutating call out of the render-effect synchronous path; `details` added to deps closes the exhaustive-deps gap (the `!details` guard prevents re-fetch loops).

## After (option B — cleaner, safer)
```tsx
useEffect(() => {
  if (!expanded || details) return
  let cancelled = false
  ;(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventToken}/details`)
      if (!cancelled && res.ok) {
        const data = await res.json()
        setDetails(data.event)
      }
    } catch { /* silent */ }
    if (!cancelled) setLoading(false)
  })()
  return () => { cancelled = true }
}, [expanded, details, eventToken])
```

Inlines `loadDetails` and adds an unmount-cancellation flag. ~12 lines instead of 1 but eliminates the rule entirely and prevents a state-update-after-unmount warning.

**Recommendation:** Option A for speed; Option B if we want to land it correctly once.

## Risk + rollback
- Risk: Negligible. Component is read-only / loads details on demand.
- Test: existing tests don't touch this component; manual test = expand a "My Events" card, confirm details load.
- Rollback: revert single commit.

---

# P1-8: Regenerate SCHEMA_SNAPSHOT.md to remove 4 phantom `orders` columns

**File:** `supabase/SCHEMA_SNAPSHOT.md`
**Lines:** 740-743 (the 4 phantom rows) — but really requires full regeneration of all structured tables.
**Critical-path:** No (doc-only)
**Blast radius:** Documentation. Source of truth shifts; future SQL queries safer.

## Steps (user-driven)
1. **User opens Supabase SQL Editor for live staging** (or prod — they should match).
2. **User runs `supabase/REFRESH_SCHEMA.sql`** (mostly `information_schema` queries; safe SELECTs only).
3. **User pastes results back into chat.**
4. **Claude rebuilds** the structured tables (Tables, Columns, Foreign Keys, Indexes, Functions, Triggers, RLS) in `SCHEMA_SNAPSHOT.md` — replacing the rebuilt-2026-04-05 sections.
5. **Claude greps `src/` for each phantom column name** to confirm zero active references:
   ```
   Grep "\borders\.market_id\b|\borders\.vendor_payout_cents\b|\borders\.buyer_fee_cents\b|\borders\.service_fee_cents\b" — expect zero hits
   Grep "from\(.orders.\)[\s\S]{0,400}\.eq\(.market_id." (multiline) — expect zero hits except in COMMENTS
   ```
6. **Add changelog entry** dated today: "Regenerated structured tables — removed 4 phantom columns from `orders` (market_id, vendor_payout_cents, buyer_fee_cents, service_fee_cents) that were incorrectly added during 2026-04-05 rebuild."

## Risk + rollback
- Risk: Zero (markdown file).
- Rollback: `git checkout HEAD~1 -- supabase/SCHEMA_SNAPSHOT.md`.

## Why this matters
P0-1 (event my-order) is a direct downstream consequence of this stale snapshot. Until it's regenerated, the next session's first SQL touch could ship the same bug class.

---

# P0-1: Fix event my-order route — resolve order via `order_items.market_id`

**File:** `src/app/api/events/[token]/my-order/route.ts`
**Lines:** 42-55 (replace the order-by-market query block)
**Critical-path:** No
**Blast radius:** This route only.

## Before
```ts
// Get user's order for this event market
const { data: order } = await serviceClient
  .from('orders')
  .select('id, order_number, status, payment_model, event_wave_reservation_id, created_at')
  .eq('market_id', event.market_id)
  .eq('user_id', user.id)
  .not('status', 'eq', 'cancelled')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()

if (!order) {
  return NextResponse.json({ error: 'No order found for this event' }, { status: 404 })
}
```

## After
```ts
// Resolve user's order for this event via order_items.market_id (orders.market_id
// does not exist; the link from event/market to orders is per-item).
// Same pattern as events/[token]/cancel/route.ts:120-133.
const { data: itemRows } = await serviceClient
  .from('order_items')
  .select('order_id')
  .eq('market_id', event.market_id)

const orderIds = [...new Set((itemRows || []).map(r => r.order_id as string))]

const { data: order } = orderIds.length > 0
  ? await serviceClient
      .from('orders')
      .select('id, order_number, status, payment_model, event_wave_reservation_id, created_at')
      .in('id', orderIds)
      .eq('buyer_user_id', user.id)
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  : { data: null }

if (!order) {
  return NextResponse.json({ error: 'No order found for this event' }, { status: 404 })
}
```

**Note:** I also corrected `user_id` → `buyer_user_id` in the second `.eq()` filter. The current code at line 47 uses `.eq('user_id', user.id)` but `orders` has `buyer_user_id` (per the column list at `checkout/success/route.ts:60`). The current bug masks this — the real column name needs to be `buyer_user_id`.

## Risk + rollback
- Risk: Low. Same pattern is already in production at `events/[token]/cancel/route.ts:120-133`.
- Test: Manual — buyer pays for an event order, opens `/[vertical]/events/[token]/my-order`, sees pick-ticket. Add a `flow-integrity.test.ts` assertion that this route exists and returns the buyer's order.
- Rollback: revert single commit.

## Why this is P0
Live bug. Every buyer who pays for an event order and opens the pick-ticket page sees a 404. There's no workaround.

---

# P1-3: Enrich `payout_processed` template with subscription context

**Files:**
1. `src/lib/notifications/types.ts` — extend templateData type and template strings (lines 566-573)
2. `src/lib/stripe/market-box-payout.ts:139-143` — pass new fields
3. `src/messages/en.json` + `src/messages/es.json` — add new title key if creating a separate type

**Critical-path:** No
**Blast radius:** Notification text only.

## Recommended approach: extend `payout_processed`, don't add a new type

Adding `new_market_box_subscription` doubles notification volume on every market box checkout (vendor sees both "new sub!" and "you got paid"). Better to enrich the existing payout notification with subscription details when present.

## Before
**`market-box-payout.ts:139-143`:**
```ts
if (vendor.user_id) {
  await sendNotification(vendor.user_id, 'payout_processed', {
    amountCents: vendorPayoutCents,
  }, { vertical: vendor.vertical_id })
}
```

**`notifications/types.ts:566-573`:**
```ts
payout_processed: {
  urgency: 'info',
  severity: 'info',
  audience: 'vendor',
  title: (_d, locale) => t('notif.payout_processed_title', locale),
  message: (d) => `A payout${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} has been sent to your account.`,
  actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/orders`,
},
```

## After
**`market-box-payout.ts:139-143`:** Pass offering + buyer context. Need to fetch offering name + buyer profile name first; current helper has the IDs but not the names. Refactor:

```ts
// Look up offering name + buyer name for richer notification (best-effort; falls back to generic)
const [{ data: offeringRow }, { data: subRow }] = await Promise.all([
  serviceClient.from('market_box_offerings').select('name').eq('id', offeringId).single(),
  serviceClient.from('market_box_subscriptions').select('buyer_user_id').eq('id', subscriptionId).single(),
])
let buyerName: string | undefined
if (subRow?.buyer_user_id) {
  const { data: buyerProfile } = await serviceClient
    .from('user_profiles').select('display_name')
    .eq('user_id', subRow.buyer_user_id).single()
  buyerName = buyerProfile?.display_name || undefined
}

if (vendor.user_id) {
  await sendNotification(vendor.user_id, 'payout_processed', {
    amountCents: vendorPayoutCents,
    sourceType: 'market_box_subscription',  // NEW
    offeringName: offeringRow?.name || undefined,  // NEW
    buyerName,  // NEW
    subscriptionId,  // NEW — for actionUrl deep link
  }, { vertical: vendor.vertical_id })
}
```

**`notifications/types.ts:566-573`:** Branch message + actionUrl on `sourceType`:
```ts
payout_processed: {
  urgency: 'info',
  severity: 'info',
  audience: 'vendor',
  title: (_d, locale) => t('notif.payout_processed_title', locale),
  message: (d) => {
    const amount = d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''
    if (d.sourceType === 'market_box_subscription' && d.offeringName) {
      const who = d.buyerName ? ` from ${d.buyerName}` : ''
      return `New subscription to "${d.offeringName}"${who} — payout${amount} sent.`
    }
    return `A payout${amount} has been sent to your account.`
  },
  actionUrl: (d) => {
    if (d.sourceType === 'market_box_subscription' && d.subscriptionId) {
      return `/${d.vertical || 'farmers_market'}/vendor/market-boxes`
    }
    return `/${d.vertical || 'farmers_market'}/vendor/orders`
  },
},
```

## Risk + rollback
- Risk: Low. Extra fields in templateData are additive — existing call sites unaffected. Best-effort lookups inside `processMarketBoxPayout` should swallow errors so a failed lookup doesn't break the payout flow.
- Test: existing notification tests should still pass. Add a unit test for the new branched message.
- Rollback: revert single commit; old templateData ignored.

---

# P1-2: Add `wasNotificationSent` dedup to chargeback handler

**File:** `src/lib/stripe/webhooks.ts`
**Lines:** 1078-1088
**Critical-path:** YES (`webhooks.ts`) — needs explicit per-file approval.
**Blast radius:** Admin notifications only. Removes duplicates on Stripe webhook retries.

## Before
```ts
if (admins && admins.length > 0) {
  await Promise.all(
    admins.map((admin) =>
      sendNotification(admin.user_id, 'charge_dispute_created', {
        orderNumber,
        disputeAmountCents: disputeAmount,
        disputeReason,
      }, { vertical })
    )
  )
}
```

## After
```ts
if (admins && admins.length > 0) {
  await Promise.all(
    admins.map(async (admin) => {
      const alreadySent = await wasNotificationSent(supabase, admin.user_id, 'charge_dispute_created', dispute.id)
      if (alreadySent) return
      await sendNotification(admin.user_id, 'charge_dispute_created', {
        orderNumber,
        disputeAmountCents: disputeAmount,
        disputeReason,
      }, { vertical })
    })
  )
}
```

`wasNotificationSent` is already imported in this file (used at line 1022 in `handleChargeRefunded`). Same dedup window default of 24 hours.

## Risk + rollback
- Risk: Low. Helper is well-trodden.
- Test: existing webhook tests cover handler invocation. Add test that simulating two consecutive `charge.dispute.created` events with the same `dispute.id` produces only one notification.
- Rollback: revert single commit. Worst case is duplicate admin notifications resume.

---

# P0-2: Add `source_transaction` to Phase 5 cron payout retry

**File:** `src/app/api/cron/expire-orders/route.ts`
**Lines:** 1088-1094
**Critical-path:** YES (`expire-orders/route.ts` is functionally critical even though not on the explicit list — it handles money). Treat as critical-path.
**Blast radius:** Stripe payout retry path only.

## Before
```ts
try {
  const transfer = await transferToVendor({
    amount: payout.amount_cents,
    destination: vendorProfile.stripe_account_id,
    orderId: orderItem.order_id,
    orderItemId: payout.order_item_id,
  })
```

## After
```ts
try {
  // Look up charge ID for source_transaction — same pattern as fulfill route
  // (apps/web/src/app/api/vendor/orders/[id]/fulfill/route.ts:312-324).
  // Without this, Stripe attempts the transfer against platform balance which
  // can fail with balance_insufficient if funds haven't settled.
  let chargeId: string | undefined
  const { data: payment } = await supabase
    .from('payments')
    .select('stripe_payment_intent_id')
    .eq('order_id', orderItem.order_id)
    .eq('status', 'succeeded')
    .maybeSingle()

  if (payment?.stripe_payment_intent_id) {
    chargeId = (await getChargeIdFromPaymentIntent(payment.stripe_payment_intent_id)) || undefined
  }

  const transfer = await transferToVendor({
    amount: payout.amount_cents,
    destination: vendorProfile.stripe_account_id,
    orderId: orderItem.order_id,
    orderItemId: payout.order_item_id,
    sourceTransaction: chargeId,
  })
```

**Import addition needed at top of file:** `import { transferToVendor, getChargeIdFromPaymentIntent } from '@/lib/stripe/payments'` (only `transferToVendor` is currently imported — verify before editing).

## Risk + rollback
- Risk: Low. Mirrors a working production pattern (fulfill route shipped 2026-04-24 in `121b3d5e`).
- Test: integration test that creates a `failed` payout with a known charge id and confirms the retry attempt includes `source_transaction`. Failing transfer test should still mark `failed` and bump `updated_at`.
- Rollback: revert single commit. Behavior reverts to current (transfers may stick in `processing` for unsettled funds).

## Why this is P0
The $16.01 stuck-payout incident from Session 74 IS this bug. It's been in flight since then. Every market-box payout retry going through this cron path is at risk if the payment hasn't fully settled.

---

# P1-1: Add cross-event cart isolation to `handleMarketBoxAdd`

**File:** `src/app/api/cart/items/route.ts`
**Insert at:** Lines 444-445 (between cart get-or-create at 430-443 and existing-cart-item check at 447)
**Critical-path:** YES — needs explicit per-file approval. **This is the same file Session 66 broke in production.** Extra caution.
**Blast radius:** Market box cart adds only. Listing path unchanged.

## What we're adding
The same 25-line check that exists for listings at lines 203-227, but checking against `offering.pickup_market_id` as the new market.

## Before (lines 443-447)
```ts
if (cartError) {
  throw traced.fromSupabase(cartError, {
    table: 'carts',
    operation: 'insert',
    userId: user.id,
  })
}

// Check if this offering is already in cart (unique index will also enforce)
```

## After
```ts
if (cartError) {
  throw traced.fromSupabase(cartError, {
    table: 'carts',
    operation: 'insert',
    userId: user.id,
  })
}

// Cross-event cart isolation: prevent mixing market-box subscription with
// items from a different market when either is an event market.
// Mirrors the listing-side check at lines 203-227.
const newMarketId = offering.pickup_market_id
if (newMarketId) {
  crumb.logic('Checking cross-event cart isolation (market box)')
  const { data: crossMarketItems } = await supabase
    .from('cart_items')
    .select('market_id')
    .eq('cart_id', cartId)
    .neq('market_id', newMarketId)
    .limit(1)

  if (crossMarketItems && crossMarketItems.length > 0) {
    const conflictMarketIds = [newMarketId, crossMarketItems[0].market_id as string]
    const { data: eventMarkets } = await supabase
      .from('markets')
      .select('id')
      .in('id', conflictMarketIds)
      .eq('market_type', 'event')
      .limit(1)

    if (eventMarkets && eventMarkets.length > 0) {
      throw traced.validation('ERR_CART_010',
        'Your cart has items from a different location. Event orders cannot be combined with other orders. Please clear your cart first.',
        { additionalContext: { newMarketId, existingMarketId: crossMarketItems[0].market_id } }
      )
    }
  }
}

// Check if this offering is already in cart (unique index will also enforce)
```

## Risk + rollback
- Risk: Medium. Touches the cart-add path. The Session 66 incident broke this exact file when adding a different cap-enforcement check. **Mitigation:** the new code is wrapped in `if (newMarketId)` — if the offering has no pickup_market_id (shouldn't happen but data could be dirty), we skip the check rather than throwing. Failure mode is "no new behavior" not "cart-add throws."
- Test: integration test — buyer adds listing from market A, attempts to add market box from event market B → expect ERR_CART_010 thrown.
- Rollback: revert single commit. Cart returns to current behavior (silent allow).

## Alternative: DB trigger instead of route-level check
Backlog item M1 (Session 72) plans moving cart isolation into a `BEFORE INSERT` trigger on `cart_items` for atomic enforcement. That's the better long-term fix but requires migration + RLS policy work. The route-level fix above is the immediate-ship version.

---

# P1-5: Refund the actual gross paid (not just vendor's pre-fee price) on market box failure

**File:** `src/lib/stripe/webhooks.ts`
**Lines:** 227 (RPC-failure branch) and 241 (at-capacity branch)
**Critical-path:** YES — needs explicit per-file approval.
**Blast radius:** Refund amounts on rare failure paths (RPC failure, at-capacity).

## What needs to be refunded
For one market box item in the order, gross = `priceCents + buyerFeeCents + proratedFlatFeeCents` where:
- `buyerFeeCents = Math.round(priceCents * 0.065)` (matches `calculateExternalBuyerFee` style)
- `proratedFlatFeeCents = Math.floor(15 / totalItemsInOrder)` (matches `proratedFlatFee` from `pricing.ts`)

## Before (lines 226-228)
```ts
try {
  await createRefund(paymentIntentId, mbItem.priceCents)
  crumb.stripe(`Auto-refund issued for failed market box RPC: ${mbItem.offeringId}`)
```

## After
Add a helper at the top of the file (outside any handler) and use it in both refund paths:

```ts
/**
 * Compute the gross amount the buyer paid for one market box line item,
 * including their share of buyer fee + prorated flat fee.
 * Used for refund-amount calculation when an RPC fails or capacity is hit.
 */
function computeMarketBoxGrossCents(
  priceCents: number,
  totalItemsInOrder: number,
): number {
  const buyerFee = Math.round(priceCents * 0.065)
  const flatFee = totalItemsInOrder > 0 ? Math.floor(15 / totalItemsInOrder) : 15
  return priceCents + buyerFee + flatFee
}
```

Then in `handleCheckoutComplete` BEFORE the for-loop at line 206, compute total items in the order:
```ts
const totalItemsInOrder = (order?.order_items?.length || 0) + marketBoxItems.length
```
*(Need to verify `order` already has `order_items` joined; if not, add a query.)*

Then replace each `createRefund(paymentIntentId, mbItem.priceCents)` call with:
```ts
const grossCents = computeMarketBoxGrossCents(mbItem.priceCents, totalItemsInOrder)
await createRefund(paymentIntentId, grossCents)
```

## Open question for the design call
For ORDERS THAT HAVE OTHER SUCCESSFUL ITEMS (mixed cart with one failed market box), refunding only this market box's gross is correct. But the platform fee math is non-trivial:
- Buyer fee on the failed item — refund to buyer (this proposal does that ✓)
- Flat fee proration — should the remaining items absorb the failed item's flat fee share, or does platform eat it? (Currently platform would eat it — flat fee was charged once, only one item's share is refunded.)
- Platform's 6.5% fee on the failed item — platform eats this (Stripe doesn't reverse the platform fee on partial refunds without explicit `application_fee` reversal, which we don't currently use).

Confirm before shipping: is "platform eats its small fee share on the failed item" acceptable, or do we need `refund_application_fee: true` on the Stripe Refund call?

## Risk + rollback
- Risk: Medium. Math is right but the failure paths are rarely exercised. Better refund > shorted refund, but also depends on the design call above.
- Test: unit test for `computeMarketBoxGrossCents` with known inputs (1-item order, mixed cart, etc.). Manual test by simulating an at-capacity scenario in dev.
- Rollback: revert single commit.

---

# P1-7: Add server-side gate to listing publish

**Files (new + modified):**
1. **NEW:** `src/app/api/vendor/listings/[id]/publish/route.ts` — POST handler with auth + onboarding gate check + status update
2. **MODIFIED:** `src/app/[vertical]/vendor/listings/PublishButton.tsx` — replace direct Supabase call with fetch to new route
**Critical-path:** No (new route, not on the protected list)
**Blast radius:** Listing publish path only.

## New route content

```ts
// src/app/api/vendor/listings/[id]/publish/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/listings/[id]/publish', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`listing-publish:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const { id: listingId } = await params

    // Fetch listing → derive vertical for vendor lookup
    const { data: listing, error: listingErr } = await supabase
      .from('listings')
      .select('id, vendor_profile_id, vertical_id, status')
      .eq('id', listingId)
      .is('deleted_at', null)
      .single()

    if (listingErr || !listing) {
      throw traced.notFound('ERR_LISTING_001', 'Listing not found')
    }

    if (listing.status === 'published') {
      return NextResponse.json({ success: true, alreadyPublished: true })
    }

    // Verify listing belongs to caller (multi-vertical-safe profile lookup)
    const { profile: vendorProfile } = await getVendorProfileForVertical<{
      id: string
      stripe_payouts_enabled: boolean | null
    }>(supabase, user.id, listing.vertical_id, 'id, stripe_payouts_enabled')

    if (!vendorProfile || listing.vendor_profile_id !== vendorProfile.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized for this listing')
    }

    // Onboarding gate — same criteria as canPublishListings in
    // /api/vendor/onboarding/status (verification approved + categories
    // authorized + Stripe payouts enabled + partner agreement). Inline here
    // rather than calling the status endpoint to avoid an HTTP round-trip.
    crumb.supabase('select', 'vendor_verifications + category_verifications')
    const [verifResult, listingCategoryResult] = await Promise.all([
      supabase
        .from('vendor_verifications')
        .select('status, onboarding_completed_at, partner_agreement_accepted_at, requested_categories')
        .eq('vendor_profile_id', vendorProfile.id)
        .single(),
      supabase
        .from('listings')
        .select('category')
        .eq('id', listingId)
        .single(),
    ])

    const verif = verifResult.data
    if (!verif || verif.status !== 'approved') {
      throw traced.validation('ERR_LISTING_GATE', 'Your vendor account is not approved yet. Listings cannot be published until approval.')
    }

    if (!vendorProfile.stripe_payouts_enabled) {
      throw traced.validation('ERR_LISTING_GATE', 'Connect Stripe before publishing listings so you can receive payouts.')
    }

    if (!verif.onboarding_completed_at && !verif.partner_agreement_accepted_at) {
      throw traced.validation('ERR_LISTING_GATE', 'Accept the partner agreement before publishing listings.')
    }

    // Category-document gate: if the listing's category requires docs, those docs must be approved
    const cat = listingCategoryResult.data?.category
    if (cat) {
      const { data: catVerif } = await supabase
        .from('category_verifications')
        .select('status, doc_type')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('doc_type', cat) // simplified — real check uses requiresDocuments(cat)
        .maybeSingle()

      // Only fail if the category requires docs AND those docs are not approved
      // (The existing onboarding/status route has the source-of-truth logic; this is a simplified mirror.)
      // Per .claude/rules/no-unauthorized-changes: confirm requiresDocuments() import + the exact gate
      // before shipping.
      if (catVerif && catVerif.status !== 'approved') {
        throw traced.validation('ERR_LISTING_GATE', 'Documentation for this category has not been approved yet.')
      }
    }

    // Update status
    crumb.supabase('update', 'listings')
    const { error: updateErr } = await supabase
      .from('listings')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', listingId)
      .eq('vendor_profile_id', vendorProfile.id)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, { table: 'listings', operation: 'update' })
    }

    return NextResponse.json({ success: true })
  })
}
```

**Note on the category-doc check:** I sketched a simplified version. The real source-of-truth is `src/app/api/vendor/onboarding/status/route.ts` lines 195-210 (full `allAuthorized` logic with `requiresDocuments(cat)` from `category-requirements`). Before shipping, extract that block into a shared helper (e.g., `src/lib/vendor/canPublish.ts`) so both the status endpoint and this new publish endpoint use the same logic — avoid drift between them.

## Modify PublishButton

**`src/app/[vertical]/vendor/listings/PublishButton.tsx:24-45` — replace handlePublish:**
```tsx
async function handlePublish() {
  if (loading) return
  setLoading(true)

  const res = await fetch(`/api/vendor/listings/${listingId}/publish`, {
    method: 'POST',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    showBanner('error', body.error || 'Failed to publish listing')
    setLoading(false)
    return
  }

  router.refresh()
  setLoading(false)
}
```

Remove the unused `import { createClient } from '@/lib/supabase/client'` and `const supabase = createClient()`.

## Risk + rollback
- Risk: Medium. Vendors who currently publish will now fail if they don't pass the gate — that's the intended behavior change. Need to communicate to existing vendors-in-flight.
- Test: integration test for the new route covering: (a) unapproved vendor → 403/422, (b) no Stripe → 422, (c) category docs missing → 422, (d) all gates pass → 200. Add a flow-integrity test.
- Rollback: keep the old PublishButton code in a feature flag; revert client component first if vendors hit blocks.

## Defense in depth (deferred)
The right long-term fix also adds an RLS policy on `listings.UPDATE` that prevents transitions to `published` unless the vendor's `vendor_verifications.status = 'approved'` AND `vendor_profiles.stripe_payouts_enabled`. That would close the API-bypass route entirely. Worth scheduling as a follow-up migration (not part of this fix proposal).

---

# P0-3: Auto-refund Stripe-paid event orders on cancellation

**Files:**
1. `src/app/api/events/[token]/cancel/route.ts` — organizer-cancel path (lines 135-166)
2. `src/app/api/admin/events/[id]/route.ts` — admin-cancel-or-decline path (lines 261-286)
**Critical-path:** YES (both routes call `createRefund` from `lib/stripe/payments.ts`)
**Blast radius:** Real money. **This requires a design call before shipping.** Below is one strawman.

## Open design questions
1. **What about company-paid event orders?** Per `fulfill/route.ts:158-178`, company-paid orders skip Stripe transfer at fulfillment. There's no buyer-side Stripe charge to refund — the organizer paid via `event_company_payments`. **Proposal:** company-paid orders get cancelled with no refund; admin handles the company refund manually via the `event_company_payments` table. Or: kick off a notification to admin to issue the company refund.
2. **What about already-fulfilled items in the cancelled event?** Some items might have been picked up before cancel. Don't refund those. Filter out `status='fulfilled'`.
3. **What about orders that were already refunded (e.g., buyer cancelled earlier)?** Skip — already filtered by the `.not('status', 'in', '("cancelled","refunded","completed")')` clause but verify the refund call doesn't double-refund.
4. **Vendor payout reversal:** if any vendor payouts already transferred for items in the cancelled event, do we reverse? Per Session 75 fresh audit A4 (similar concern), reversal is complex. **Proposal:** flag for manual admin review rather than auto-reverse. Comment/log the affected payouts.

## Strawman implementation

Refactor the buyer-notification + order-cancel block in BOTH cancel routes (organizer cancel and admin cancel) to also issue refunds. Add this AFTER the order status update.

**For `events/[token]/cancel/route.ts` — insert after line 157:**
```ts
// Auto-refund Stripe-paid orders. Company-paid orders are handled separately
// (organizer billing reversed manually). Already-fulfilled items keep their charges.
const refundResults: Array<{ orderId: string; orderItemId: string; refundId?: string; failed?: boolean; reason?: string }> = []

for (const order of buyerOrders) {
  const orderId = order.id as string

  // Get the payment intent and the per-item amounts for THIS order
  const { data: payment } = await serviceClient
    .from('payments')
    .select('stripe_payment_intent_id')
    .eq('order_id', orderId)
    .eq('status', 'succeeded')
    .maybeSingle()

  if (!payment?.stripe_payment_intent_id) continue // External or unpaid — nothing to refund

  // Get refundable items (status was pre-fulfillment when we queried buyerOrders;
  // re-check per item here since multi-vendor events may have mixed statuses).
  const { data: refundableItems } = await serviceClient
    .from('order_items')
    .select('id, subtotal_cents, status')
    .eq('order_id', orderId)
    .eq('market_id', event.market_id)
    .not('status', 'in', '("fulfilled","cancelled","refunded")')

  if (!refundableItems || refundableItems.length === 0) continue

  // Refund the sum of refundable item subtotals + their share of fees.
  // For simplicity v1: full refund per order if ALL items in the order are
  // event items. Mixed orders (rare for events) get per-item handling.
  const { count: totalItemsInOrder } = await serviceClient
    .from('order_items').select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)

  const refundCents = refundableItems.reduce((sum, it) => {
    const subtotal = it.subtotal_cents as number
    const buyerFee = Math.round(subtotal * 0.065)
    const flatShare = totalItemsInOrder ? Math.floor(15 / totalItemsInOrder) : 0
    return sum + subtotal + buyerFee + flatShare
  }, 0)

  try {
    const refund = await createRefund(payment.stripe_payment_intent_id, refundCents)
    refundResults.push({ orderId, orderItemId: 'multi', refundId: refund.id })

    // Mark items as refunded
    await serviceClient
      .from('order_items')
      .update({ status: 'refunded' })
      .in('id', refundableItems.map(it => it.id))
  } catch (err) {
    refundResults.push({
      orderId,
      orderItemId: 'multi',
      failed: true,
      reason: err instanceof Error ? err.message : String(err),
    })
    await logError(new TracedError('ERR_EVENT_CANCEL_REFUND_FAILED', `Refund failed for order ${orderId}: ${err}`, {
      route: '/api/events/[token]/cancel',
      method: 'POST',
      orderId,
      eventId: event.id,
    }))
  }
}

// Update the buyer notification reason text from "If you paid via card, a refund will be processed."
// to be specific based on what actually happened. Refactor the notification block above to use
// per-buyer refund status — show "Your refund of $X is on the way" vs "There was an issue
// processing your refund — admin has been notified."
```

**Same pattern in `admin/events/[id]/route.ts:261-286`.**

## Where to extract the helper
This logic is duplicated across two routes. Extract to `src/lib/events/refund-event-orders.ts` so both call sites share the implementation. Same shape as `restoreOrderInventory` in `lib/inventory.ts`.

## Risk + rollback
- Risk: HIGH. Real money flows out. Must be tested in Stripe sandbox with both single-item and multi-item event orders before staging push.
- Test:
  - Unit: `computeRefundCents` correctness across edge cases (1 item, 5 items, fulfilled mixed in)
  - Integration: simulate event cancel with a paid Stripe order in dev/staging, verify refund hits the buyer
  - Manual: cancel a paid event in staging end-to-end
- Rollback: revert single commit. Behavior reverts to "promise refund, never deliver."

## Why this is THE most important fix
Buyers are charged. Orders are cancelled. Notification promises a refund. Code never refunds. This is a direct money-loss-to-buyer bug that's been live since the event cancel routes were built. P0 has no question.

---

# Notes on test coverage

After all fixes ship, recommend adding these to the vitest suite (under `src/app/api/__tests__/` or `src/lib/__tests__/`):

1. `events-my-order.test.ts` — that the route returns the buyer's order via `order_items.market_id` resolution.
2. `phase5-cron.test.ts` — that the retry includes `source_transaction` when a payment intent exists.
3. `event-cancel-refund.test.ts` — that organizer/admin cancel triggers Stripe refund for paid items.
4. `cart-mb-cross-event.test.ts` — that mixing market box from event with listing from non-event throws ERR_CART_010.
5. `chargeback-dedup.test.ts` — that two consecutive `charge.dispute.created` events with same `dispute.id` produce one notification.
6. `mb-refund-amount.test.ts` — that `computeMarketBoxGrossCents` returns priceCents + 6.5% + prorated $0.15.
7. `listing-publish-gate.test.ts` — that `/api/vendor/listings/[id]/publish` rejects unapproved vendors.

These would also become flow-integrity tests that catch regressions of these classes (cross-file contracts).

---

# Backlog cleanup tasks (parallel to fixes)

Independent of the fix proposals above:
- **Close P1-4 backlog item**: market-box-payout catch-all already calls `logError(ERR_PAYOUT_004)`. Stale.
- **Close P3-7 backlog item**: cart hard-blocks duplicate market box subscription at line 412. The cart-vs-checkout inconsistency claim is wrong.
- **Close P3-8 backlog item**: Phase 11 cron uses `event.vertical_id || 'farmers_market'` (verified at expire-orders/route.ts:2016). Already vertical-aware.
- **Close P0-backlog "Stripe order_number metadata"**: verified at `src/lib/stripe/payments.ts:72` — `order_number: orderNumber` is in the metadata block. Already shipped.

These are doc-only changes to `apps/web/.claude/backlog.md`. Bundle into a single doc commit after the code fixes ship.
