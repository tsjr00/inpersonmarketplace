/**
 * FT Pickup Slot Capacity — DB Integration Tests (migration 216)
 *
 * Covers the two RPCs that cap how many app orders a food truck receives for
 * one pickup time, and that validate the chosen time server-side:
 *
 *   check_pickup_slot_capacity(vendor, market, date, time, adding_items, order_id)
 *   validate_pickup_slot_time(vendor, market, date, time)
 *
 * WHY THESE TESTS EXIST
 *
 * Before mig 216 nothing counted pickup slots — `time-slots.ts:26` says outright
 * "slots are waves, not reservations" — so 40 buyers could all pick 12:00 and the
 * truck got a line it never agreed to, breaking the `_platform_skip_line`
 * commitment every truck accepts. The enforcement shipped with NO test coverage;
 * this file closes that gap.
 *
 * Two of these tests are regression guards for bugs found in review BEFORE the
 * migration was ever applied. Both are marked ⚑ below. Do not weaken them:
 *
 *   ⚑ Abandoned checkouts must not hold a slot. Orders are inserted with status
 *     'pending' BEFORE payment (checkout/session/route.ts:913-914) and the only
 *     cleanup cron runs ONCE A DAY (vercel.json). Counting every pending row let
 *     a buyer who walked away from checkout block a slot for ~24 hours.
 *
 *   ⚑ A market may run TWO active schedule rows on one weekday (lunch + dinner);
 *     there is no unique constraint on (market_id, day_of_week). An earlier
 *     LIMIT-1 form of validate_pickup_slot_time rejected every dinner-time order
 *     at such a market — and that guard fails CLOSED, so the buyer was told a
 *     time the truck actually serves was "no longer available".
 *
 * PREREQUISITE: migration 216 must be applied to the Dev project. Until it is,
 * every test here fails loudly with a message naming the migration. That is
 * intended — a silent skip would let the feature ship unverified.
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - Dev Supabase project accessible
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestClient } from '../test-utils/supabase-test-client'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient

const createdIds: { table: string; id: string }[] = []

let testAuthUserId: string
let testVendorProfileId: string
let testMarketId: string
let testListingId: string

// A pickup date far enough out that same-day lead-time logic never interferes.
const target = new Date()
target.setUTCDate(target.getUTCDate() + 14)
const PICKUP_DATE = target.toISOString().slice(0, 10)
const PICKUP_DOW = target.getUTCDay()

// Two service windows on the SAME weekday — the shape that broke the LIMIT-1 form.
const LUNCH = { start: '11:00:00', end: '14:00:00' }
const DINNER = { start: '17:00:00', end: '20:00:00' }

type CapacityRow = {
  allowed: boolean
  reason: string | null
  orders_used: number
  orders_cap: number | null
  items_used: number
  items_cap: number | null
}

/**
 * Call the capacity RPC and fail loudly (naming mig 216) if it is missing,
 * rather than letting a null result read as "allowed".
 */
async function checkCapacity(opts: {
  time: string
  addingItems?: number
  orderId?: string | null
}): Promise<CapacityRow> {
  const { data, error } = await supabase.rpc('check_pickup_slot_capacity', {
    p_vendor_profile_id: testVendorProfileId,
    p_market_id: testMarketId,
    p_pickup_date: PICKUP_DATE,
    p_pickup_time: opts.time,
    p_adding_items: opts.addingItems ?? 1,
    p_order_id: opts.orderId ?? null,
  })
  if (error) {
    throw new Error(
      `check_pickup_slot_capacity failed — is migration 216 applied to Dev? ${error.message}`
    )
  }
  const row = Array.isArray(data) ? data[0] : data
  expect(row, 'RPC returned no row').toBeTruthy()
  return row as CapacityRow
}

async function validateTime(time: string | null, date = PICKUP_DATE): Promise<boolean> {
  const { data, error } = await supabase.rpc('validate_pickup_slot_time', {
    p_vendor_profile_id: testVendorProfileId,
    p_market_id: testMarketId,
    p_pickup_date: date,
    p_pickup_time: time,
  })
  if (error) {
    throw new Error(
      `validate_pickup_slot_time failed — is migration 216 applied to Dev? ${error.message}`
    )
  }
  return data as boolean
}

async function setCaps(orders: number | null, items: number | null) {
  const { error } = await supabase
    .from('vendor_profiles')
    .update({ pickup_capacity_app_orders: orders, pickup_capacity_items: items })
    .eq('id', testVendorProfileId)
  if (error) {
    throw new Error(
      `Could not set capacity columns — is migration 216 applied to Dev? ${error.message}`
    )
  }
}

/** Create a paid order occupying one slot. Returns the order id. */
async function createOrderInSlot(opts: {
  time: string
  quantity?: number
  orderStatus?: string
  itemStatus?: string
  cancelledAt?: string
  createdAt?: string
  date?: string
}): Promise<string> {
  const orderInsert: Record<string, unknown> = {
    buyer_user_id: testAuthUserId,
    status: opts.orderStatus ?? 'paid',
    vertical_id: 'food_trucks',
    order_number: `TEST-CAP-${Date.now()}-${Math.random().toString().slice(2, 8)}`,
    subtotal_cents: 1000,
    platform_fee_cents: 65,
    total_cents: 1065,
    payment_method: 'stripe',
  }
  if (opts.createdAt) orderInsert.created_at = opts.createdAt

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert(orderInsert)
    .select('id')
    .single()
  if (orderError) throw new Error(`createOrderInSlot (order): ${orderError.message}`)
  createdIds.push({ table: 'orders', id: order.id })

  const { data: item, error: itemError } = await supabase
    .from('order_items')
    .insert({
      order_id: order.id,
      listing_id: testListingId,
      vendor_profile_id: testVendorProfileId,
      market_id: testMarketId,
      pickup_date: opts.date ?? PICKUP_DATE,
      preferred_pickup_time: opts.time,
      quantity: opts.quantity ?? 1,
      unit_price_cents: 1000,
      subtotal_cents: 1000,
      platform_fee_cents: 65,
      vendor_payout_cents: 935,
      status: opts.itemStatus ?? 'pending',
      cancelled_at: opts.cancelledAt ?? null,
    })
    .select('id')
    .single()
  if (itemError) throw new Error(`createOrderInSlot (item): ${itemError.message}`)
  createdIds.push({ table: 'order_items', id: item.id })

  return order.id
}

beforeAll(async () => {
  supabase = createTestClient()

  const testEmail = `__test_cap_${Date.now()}@integration.test`
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: 'test-password-integration-1234',
    email_confirm: true,
  })
  if (authError) throw new Error(`Setup failed (auth user): ${authError.message}`)
  testAuthUserId = authUser.user.id

  const { data: vendorProfile, error: vpError } = await supabase
    .from('vendor_profiles')
    .insert({
      vertical_id: 'food_trucks',
      status: 'approved',
      profile_data: { business_name: 'Integration Test Truck' },
      tier: 'free',
      pickup_lead_minutes: 30,
    })
    .select('id')
    .single()
  if (vpError) throw new Error(`Setup failed (vendor profile): ${vpError.message}`)
  testVendorProfileId = vendorProfile.id
  createdIds.push({ table: 'vendor_profiles', id: testVendorProfileId })

  const { data: market, error: marketError } = await supabase
    .from('markets')
    .insert({
      vertical_id: 'food_trucks',
      name: '__test_ Capacity Test Location',
      market_type: 'traditional',
      status: 'active',
      active: true,
      timezone: 'America/Chicago',
    })
    .select('id')
    .single()
  if (marketError) throw new Error(`Setup failed (market): ${marketError.message}`)
  testMarketId = market.id
  createdIds.push({ table: 'markets', id: testMarketId })

  // TWO active schedule rows on the same weekday — deliberately, see ⚑ above.
  for (const w of [LUNCH, DINNER]) {
    const { data: sched, error: schedError } = await supabase
      .from('market_schedules')
      .insert({
        market_id: testMarketId,
        day_of_week: PICKUP_DOW,
        start_time: w.start,
        end_time: w.end,
        active: true,
      })
      .select('id')
      .single()
    if (schedError) throw new Error(`Setup failed (schedule): ${schedError.message}`)
    createdIds.push({ table: 'market_schedules', id: sched.id })
  }

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .insert({
      vendor_profile_id: testVendorProfileId,
      title: '__test_ Capacity Test Item',
      price_cents: 1000,
      quantity: 500,
      status: 'draft',
      vertical_id: 'food_trucks',
    })
    .select('id')
    .single()
  if (listingError) throw new Error(`Setup failed (listing): ${listingError.message}`)
  testListingId = listing.id
  createdIds.push({ table: 'listings', id: testListingId })
})

afterAll(async () => {
  if (!supabase) return
  for (const { table, id } of [...createdIds].reverse()) {
    await supabase.from(table).delete().eq('id', id)
  }
  if (testAuthUserId) await supabase.auth.admin.deleteUser(testAuthUserId)
})

// ═══════════════════════════════════════════════════════════════════════
// check_pickup_slot_capacity
// ═══════════════════════════════════════════════════════════════════════

describe('check_pickup_slot_capacity: opt-in default', () => {
  it('allows unlimited orders when the truck has set no capacity (NULL caps)', async () => {
    // RULE: mig 216 is inert on arrival. Every existing truck has NULL caps and
    // must behave exactly as it did before the migration.
    await setCaps(null, null)
    await createOrderInSlot({ time: '11:15:00' })
    await createOrderInSlot({ time: '11:15:00' })
    await createOrderInSlot({ time: '11:15:00' })

    const row = await checkCapacity({ time: '11:15:00' })
    expect(row.allowed).toBe(true)
    expect(row.orders_cap).toBeNull()
    expect(row.items_cap).toBeNull()
  })
})

describe('check_pickup_slot_capacity: order cap', () => {
  it('allows an order while the slot is under the cap', async () => {
    await setCaps(2, null)
    await createOrderInSlot({ time: '11:30:00' })

    const row = await checkCapacity({ time: '11:30:00' })
    expect(row.allowed).toBe(true)
    expect(row.orders_used).toBe(1)
    expect(row.orders_cap).toBe(2)
  })

  it('rejects the order that would exceed the cap, with reason slot_orders_full', async () => {
    // RULE: the cap is the number of app orders the truck agreed to take in one
    // slot. The order that would make it cap+1 is refused.
    await setCaps(2, null)
    await createOrderInSlot({ time: '11:45:00' })
    await createOrderInSlot({ time: '11:45:00' })

    const row = await checkCapacity({ time: '11:45:00' })
    expect(row.allowed).toBe(false)
    expect(row.reason).toBe('slot_orders_full')
    expect(row.orders_used).toBe(2)
  })

  it('counts one order once, no matter how many items it has', async () => {
    // RULE: the order cap counts DISTINCT orders — a 5-item order is one order.
    await setCaps(2, null)
    const orderId = await createOrderInSlot({ time: '12:00:00', quantity: 1 })
    // Second item on the SAME order, same slot.
    const { error } = await supabase.from('order_items').insert({
      order_id: orderId,
      listing_id: testListingId,
      vendor_profile_id: testVendorProfileId,
      market_id: testMarketId,
      pickup_date: PICKUP_DATE,
      preferred_pickup_time: '12:00:00',
      quantity: 1,
      unit_price_cents: 1000,
      subtotal_cents: 1000,
      platform_fee_cents: 65,
      vendor_payout_cents: 935,
      status: 'pending',
    })
    expect(error).toBeNull()

    const row = await checkCapacity({ time: '12:00:00' })
    expect(row.orders_used).toBe(1)
    expect(row.allowed).toBe(true)
  })
})

describe('check_pickup_slot_capacity: item cap', () => {
  it('rejects one oversized order that fits the order cap but not the item cap', async () => {
    // RULE: the item cap exists so a single very large order cannot consume a
    // slot the order cap alone would allow. Empty slot, order cap 5, item cap 8,
    // one 9-item order → refused.
    await setCaps(5, 8)

    const row = await checkCapacity({ time: '12:15:00', addingItems: 9 })
    expect(row.allowed).toBe(false)
    expect(row.reason).toBe('slot_items_full')
    expect(row.items_used).toBe(0)
    expect(row.items_cap).toBe(8)
  })

  it('counts item quantity across separate orders in the slot', async () => {
    await setCaps(10, 6)
    await createOrderInSlot({ time: '12:30:00', quantity: 4 })

    const fits = await checkCapacity({ time: '12:30:00', addingItems: 2 })
    expect(fits.items_used).toBe(4)
    expect(fits.allowed).toBe(true)

    const overflows = await checkCapacity({ time: '12:30:00', addingItems: 3 })
    expect(overflows.allowed).toBe(false)
    expect(overflows.reason).toBe('slot_items_full')
  })
})

describe('check_pickup_slot_capacity: dead rows never consume capacity', () => {
  it('ignores a cancelled order item', async () => {
    // RULE: capacity must free up on cancellation, or a slot stays "full"
    // forever after a refund.
    await setCaps(1, null)
    await createOrderInSlot({ time: '12:45:00', cancelledAt: new Date().toISOString() })

    const row = await checkCapacity({ time: '12:45:00' })
    expect(row.orders_used).toBe(0)
    expect(row.allowed).toBe(true)
  })

  it('ignores cancelled and refunded orders', async () => {
    await setCaps(1, null)
    await createOrderInSlot({ time: '13:00:00', orderStatus: 'cancelled' })
    await createOrderInSlot({ time: '13:00:00', orderStatus: 'refunded' })

    const row = await checkCapacity({ time: '13:00:00' })
    expect(row.orders_used).toBe(0)
    expect(row.allowed).toBe(true)
  })

  it('⚑ ignores an abandoned checkout — unpaid and older than 10 minutes', async () => {
    // RULE (regression guard): orders are inserted as 'pending' BEFORE payment,
    // and the cleanup cron runs once a day. A pending order therefore holds its
    // slot for only the 10 minutes Stripe gives the buyer; past that it is
    // abandoned by definition and must release the slot without waiting for the
    // cron. Counting it would grey out a truck's whole lunch service over
    // checkouts nobody completed.
    await setCaps(1, null)
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    await createOrderInSlot({
      time: '13:15:00',
      orderStatus: 'pending',
      createdAt: elevenMinutesAgo,
    })

    const row = await checkCapacity({ time: '13:15:00' })
    expect(row.orders_used).toBe(0)
    expect(row.allowed).toBe(true)
  })

  it('⚑ still counts a checkout in progress — unpaid but under 10 minutes old', async () => {
    // RULE (the other half): the window must not become "ignore all pending".
    // A buyer actively on the Stripe page holds their slot, or two buyers can be
    // sold the same last spot.
    await setCaps(1, null)
    await createOrderInSlot({
      time: '13:30:00',
      orderStatus: 'pending',
      createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
    })

    const row = await checkCapacity({ time: '13:30:00' })
    expect(row.orders_used).toBe(1)
    expect(row.allowed).toBe(false)
    expect(row.reason).toBe('slot_orders_full')
  })
})

describe('check_pickup_slot_capacity: scoping', () => {
  it('does not count orders from a different slot or a different date', async () => {
    // RULE: capacity is per (vendor, market, date, pickup time). A busy 11:15
    // must not make 13:45 unavailable.
    await setCaps(1, null)
    await createOrderInSlot({ time: '18:00:00' })
    await createOrderInSlot({ time: '13:45:00', date: '2099-01-01' })

    const row = await checkCapacity({ time: '13:45:00' })
    expect(row.orders_used).toBe(0)
    expect(row.allowed).toBe(true)
  })

  it('excludes an order own rows via p_order_id', async () => {
    // RULE: re-checking a cart mid-flight must not count the order against
    // itself.
    await setCaps(1, null)
    const orderId = await createOrderInSlot({ time: '19:00:00' })

    const counted = await checkCapacity({ time: '19:00:00' })
    expect(counted.allowed).toBe(false)

    const excluded = await checkCapacity({ time: '19:00:00', orderId })
    expect(excluded.orders_used).toBe(0)
    expect(excluded.allowed).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// validate_pickup_slot_time
// ═══════════════════════════════════════════════════════════════════════

describe('validate_pickup_slot_time: service window', () => {
  it('accepts a time inside the first window', async () => {
    expect(await validateTime('12:00:00')).toBe(true)
  })

  it('⚑ accepts a time inside the SECOND window on the same weekday', async () => {
    // RULE (regression guard): a market may run a lunch window and a dinner
    // window on one day — there is no unique constraint on
    // (market_id, day_of_week). The slot is valid if it falls inside ANY active
    // window. A single-window test rejected every dinner order at such a market,
    // and this guard fails CLOSED: the buyer was told a time the truck actually
    // serves was "no longer available".
    expect(await validateTime('18:00:00')).toBe(true)
  })

  it('rejects a time in the gap between two windows', async () => {
    expect(await validateTime('15:30:00')).toBe(false)
  })

  it('rejects a time before the first window opens', async () => {
    expect(await validateTime('09:00:00')).toBe(false)
  })

  it('rejects a time after the last window closes', async () => {
    expect(await validateTime('21:00:00')).toBe(false)
  })

  it('accepts a time exactly at a window close', async () => {
    // RULE: the buyer who arrives at close is served — matches time-slots.ts:28-29.
    expect(await validateTime('14:00:00')).toBe(true)
  })

  it('rejects every time on a weekday the market does not operate', async () => {
    const otherDay = new Date(target)
    otherDay.setUTCDate(otherDay.getUTCDate() + 1)
    expect(await validateTime('12:00:00', otherDay.toISOString().slice(0, 10))).toBe(false)
  })
})

describe('validate_pickup_slot_time: date rules', () => {
  it('rejects a past date', async () => {
    expect(await validateTime('12:00:00', '2020-01-01')).toBe(false)
  })

  it('accepts a NULL time — non-FT flows legitimately have no slot', async () => {
    expect(await validateTime(null)).toBe(true)
  })
})
