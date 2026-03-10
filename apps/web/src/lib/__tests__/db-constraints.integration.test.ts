/**
 * DB Constraint Integration Tests
 *
 * Tests database-level constraints using the dev Supabase instance.
 * Covers: MP-R6 (payout unique index), MP-R8 (atomic_decrement_inventory)
 *
 * Run: npx vitest run --config vitest.integration.config.ts src/lib/__tests__/db-constraints.integration.test.ts
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - Dev Supabase project accessible
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestClient } from '../test-utils/supabase-test-client'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient

// Track IDs for cleanup
const createdIds: { table: string; id: string }[] = []

async function cleanup() {
  if (!supabase) return
  // Delete in reverse order (children first)
  for (const { table, id } of [...createdIds].reverse()) {
    await supabase.from(table).delete().eq('id', id)
  }
}

// Test data
let testAuthUserId: string
let testVendorProfileId: string
let testListingId: string
let testOrderId: string
let testOrderItemId: string

beforeAll(async () => {
  supabase = createTestClient()

  // Create auth user (orders.buyer_user_id FK → auth.users)
  const testEmail = `__test_${Date.now()}@integration.test`
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: 'test-password-integration-1234',
    email_confirm: true,
  })

  if (authError) throw new Error(`Setup failed (auth user): ${authError.message}`)
  testAuthUserId = authUser.user.id

  // Create vendor profile (no user_id required — nullable)
  const { data: vendorProfile, error: vpError } = await supabase
    .from('vendor_profiles')
    .insert({
      vertical_id: 'farmers_market',
      status: 'approved',
      profile_data: { business_name: 'Integration Test Vendor' },
      tier: 'free',
    })
    .select('id')
    .single()

  if (vpError) throw new Error(`Setup failed (vendor profile): ${vpError.message}`)
  testVendorProfileId = vendorProfile.id
  createdIds.push({ table: 'vendor_profiles', id: testVendorProfileId })

  // Create listing (uses `quantity` not `quantity_available`, status is enum)
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .insert({
      vendor_profile_id: testVendorProfileId,
      title: 'Integration Test Listing',
      price_cents: 1000,
      quantity: 10,
      status: 'draft',
      vertical_id: 'farmers_market',
    })
    .select('id')
    .single()

  if (listingError) throw new Error(`Setup failed (listing): ${listingError.message}`)
  testListingId = listing.id
  createdIds.push({ table: 'listings', id: testListingId })

  // Create order (buyer_user_id FK → auth.users, all NOT NULL fields required)
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      buyer_user_id: testAuthUserId,
      status: 'pending',
      vertical_id: 'farmers_market',
      order_number: `TEST-${Date.now()}`,
      subtotal_cents: 2000,
      platform_fee_cents: 130,
      total_cents: 2130,
      payment_method: 'stripe',
    })
    .select('id')
    .single()

  if (orderError) throw new Error(`Setup failed (order): ${orderError.message}`)
  testOrderId = order.id
  createdIds.push({ table: 'orders', id: testOrderId })

  // Create order item
  const { data: orderItem, error: oiError } = await supabase
    .from('order_items')
    .insert({
      order_id: testOrderId,
      listing_id: testListingId,
      vendor_profile_id: testVendorProfileId,
      quantity: 2,
      unit_price_cents: 1000,
      subtotal_cents: 2000,
      platform_fee_cents: 130,
      vendor_payout_cents: 2000,
      status: 'pending',
    })
    .select('id')
    .single()

  if (oiError) throw new Error(`Setup failed (order item): ${oiError.message}`)
  testOrderItemId = orderItem.id
  createdIds.push({ table: 'order_items', id: testOrderItemId })
})

afterAll(async () => {
  await cleanup()
  // Delete auth user last (orders FK → auth.users, CASCADE handles orders)
  if (testAuthUserId) {
    await supabase.auth.admin.deleteUser(testAuthUserId)
  }
})

// -- MP-R6: Vendor Payouts Unique Index --

describe('MP-R6: vendor_payouts unique index', () => {
  it('allows first payout for an order item', async () => {
    const { data, error } = await supabase
      .from('vendor_payouts')
      .insert({
        order_item_id: testOrderItemId,
        vendor_profile_id: testVendorProfileId,
        amount_cents: 2000,
        status: 'pending',
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    if (data) createdIds.push({ table: 'vendor_payouts', id: data.id })
  })

  it('rejects duplicate payout for same order item', async () => {
    const { error } = await supabase
      .from('vendor_payouts')
      .insert({
        order_item_id: testOrderItemId,
        vendor_profile_id: testVendorProfileId,
        amount_cents: 2000,
        status: 'pending',
      })

    // Should fail with unique constraint violation
    expect(error).toBeTruthy()
    expect(error!.code).toBe('23505') // unique_violation
  })
})

// -- MP-R8: Atomic Decrement Inventory --

describe('MP-R8: atomic_decrement_inventory RPC', () => {
  it('decrements inventory by specified quantity', async () => {
    // Get current inventory
    const { data: before } = await supabase
      .from('listings')
      .select('quantity')
      .eq('id', testListingId)
      .single()

    const beforeQty = before!.quantity

    // Decrement by 3
    const { error } = await supabase.rpc('atomic_decrement_inventory', {
      p_listing_id: testListingId,
      p_quantity: 3,
    })

    expect(error).toBeNull()

    // Verify decrement
    const { data: after } = await supabase
      .from('listings')
      .select('quantity')
      .eq('id', testListingId)
      .single()

    expect(after!.quantity).toBe(beforeQty - 3)
  })

  it('rejects decrement that would go negative', async () => {
    // Try to decrement more than available — must reject, not silently clamp
    // BUG: Current implementation uses GREATEST(0, qty - n) which silently allows overselling.
    // This test documents the CORRECT behavior: insufficient inventory must error out.
    const { data, error } = await supabase.rpc('atomic_decrement_inventory', {
      p_listing_id: testListingId,
      p_quantity: 9999,
    })

    // Should fail — inventory can't go negative, order must not proceed
    expect(error).toBeTruthy()
  })
})
