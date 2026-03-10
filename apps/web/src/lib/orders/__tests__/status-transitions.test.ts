/**
 * Status Transition Tests
 *
 * Tests the state machines for order and item statuses.
 * Covers: OL-R1 (order status transitions), OL-R2 (item status transitions)
 *
 * IMPORTANT: These tests assert what the BUSINESS RULES require, not what
 * the code currently does. If a test fails, investigate the code — do NOT
 * change the test to match the code. See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Source of truth: apps/web/.claude/status_system_audit.md
 * Verified against every route handler 2026-03-10.
 *
 * Run: npx vitest run src/lib/orders/__tests__/status-transitions.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  ORDER_STATUSES_ACTIVE,
  ORDER_STATUSES_UNUSED,
  ITEM_STATUSES,
  ORDER_TERMINAL_STATUSES,
  ITEM_TERMINAL_STATUSES,
  isValidOrderTransition,
  isValidItemTransition,
  getNextOrderStatuses,
  getNextItemStatuses,
} from '../status-transitions'
import type { OrderStatus, ItemStatus } from '../status-transitions'

// =============================================================================
// ORDER AND ITEM STATUS ENUMS
// =============================================================================

describe('status enums', () => {
  // OL-R1: Order statuses — DB enum is order_status
  it('active order statuses are pending, paid, completed, cancelled, refunded', () => {
    expect([...ORDER_STATUSES_ACTIVE].sort()).toEqual(
      ['cancelled', 'completed', 'paid', 'pending', 'refunded']
    )
  })

  it('unused order statuses are confirmed and ready (exist in DB enum, never set on orders)', () => {
    expect([...ORDER_STATUSES_UNUSED].sort()).toEqual(['confirmed', 'ready'])
  })

  // OL-R2: Item statuses — DB enum is order_item_status
  it('item statuses are pending, confirmed, ready, fulfilled, cancelled, refunded', () => {
    expect([...ITEM_STATUSES].sort()).toEqual(
      ['cancelled', 'confirmed', 'fulfilled', 'pending', 'ready', 'refunded']
    )
  })

  it('order terminal statuses are refunded only', () => {
    // completed is also effectively terminal in happy path, but
    // charge.refunded webhook can move completed → refunded
    expect([...ORDER_TERMINAL_STATUSES]).toEqual(['refunded'])
  })

  it('item terminal statuses are fulfilled and refunded', () => {
    expect([...ITEM_TERMINAL_STATUSES].sort()).toEqual(['fulfilled', 'refunded'])
  })
})

// =============================================================================
// OL-R1: ORDER STATUS TRANSITIONS
// Orders use: pending → paid → completed (+ cancelled/refunded interrupts)
// Orders do NOT use: confirmed, fulfilled, ready (those are item-level)
// =============================================================================

describe('OL-R1: order status transitions', () => {
  // -- Happy path --
  it('pending → paid (Stripe success or vendor confirms external payment)', () => {
    expect(isValidOrderTransition('pending', 'paid')).toBe(true)
  })

  it('paid → completed (all items done via atomic_complete_order_if_ready)', () => {
    expect(isValidOrderTransition('paid', 'completed')).toBe(true)
  })

  // -- Cancellation --
  it('pending → cancelled (Stripe timeout, external expiry, all items cancelled)', () => {
    expect(isValidOrderTransition('pending', 'cancelled')).toBe(true)
  })

  it('paid → cancelled (all items cancelled by buyer/vendor after payment)', () => {
    expect(isValidOrderTransition('paid', 'cancelled')).toBe(true)
  })

  // -- Refund (charge.refunded webhook from Stripe Dashboard) --
  it('pending → refunded (charge.refunded webhook)', () => {
    expect(isValidOrderTransition('pending', 'refunded')).toBe(true)
  })

  it('paid → refunded (charge.refunded webhook)', () => {
    expect(isValidOrderTransition('paid', 'refunded')).toBe(true)
  })

  it('completed → refunded (charge.refunded webhook)', () => {
    expect(isValidOrderTransition('completed', 'refunded')).toBe(true)
  })

  it('cancelled → refunded (after Stripe refund processes)', () => {
    expect(isValidOrderTransition('cancelled', 'refunded')).toBe(true)
  })

  // -- Invalid transitions --
  it('pending → completed (cannot skip paid)', () => {
    expect(isValidOrderTransition('pending', 'completed')).toBe(false)
  })

  it('paid → pending (cannot go backwards)', () => {
    expect(isValidOrderTransition('paid', 'pending')).toBe(false)
  })

  it('completed → paid (cannot go backwards)', () => {
    expect(isValidOrderTransition('completed', 'paid')).toBe(false)
  })

  it('completed → pending (cannot go backwards)', () => {
    expect(isValidOrderTransition('completed', 'pending')).toBe(false)
  })

  it('refunded → pending (terminal — no exits)', () => {
    expect(isValidOrderTransition('refunded', 'pending')).toBe(false)
  })

  it('refunded → paid (terminal — no exits)', () => {
    expect(isValidOrderTransition('refunded', 'paid')).toBe(false)
  })

  it('pending → pending (self-transition invalid)', () => {
    expect(isValidOrderTransition('pending', 'pending')).toBe(false)
  })

  it('completed → cancelled (completed cannot be cancelled, only refunded)', () => {
    expect(isValidOrderTransition('completed', 'cancelled')).toBe(false)
  })
})

// =============================================================================
// OL-R2: ITEM STATUS TRANSITIONS
// Items use: pending → confirmed → ready → fulfilled (+ cancelled/refunded)
// Items do NOT use: paid, completed (those are order-level)
// =============================================================================

describe('OL-R2: item status transitions', () => {
  // -- Happy path --
  it('pending → confirmed (vendor confirms or external payment confirmed)', () => {
    expect(isValidItemTransition('pending', 'confirmed')).toBe(true)
  })

  it('confirmed → ready (vendor marks ready)', () => {
    expect(isValidItemTransition('confirmed', 'ready')).toBe(true)
  })

  it('ready → fulfilled (vendor fulfills, mutual pickup, cron Phase 4/7)', () => {
    expect(isValidItemTransition('ready', 'fulfilled')).toBe(true)
  })

  // -- Skip paths --
  it('pending → ready (vendor can skip confirmed via ready route)', () => {
    expect(isValidItemTransition('pending', 'ready')).toBe(true)
  })

  it('confirmed → fulfilled (vendor fulfills directly, Phase 7 auto-fulfill)', () => {
    expect(isValidItemTransition('confirmed', 'fulfilled')).toBe(true)
  })

  // -- Cancellation (any pre-fulfilled status) --
  it('pending → cancelled (expiry, buyer cancel, vendor reject)', () => {
    expect(isValidItemTransition('pending', 'cancelled')).toBe(true)
  })

  it('confirmed → cancelled (buyer cancel, vendor reject)', () => {
    expect(isValidItemTransition('confirmed', 'cancelled')).toBe(true)
  })

  it('ready → cancelled (buyer cancel, vendor reject)', () => {
    expect(isValidItemTransition('ready', 'cancelled')).toBe(true)
  })

  // -- Refund --
  it('cancelled → refunded (after Stripe refund processing)', () => {
    expect(isValidItemTransition('cancelled', 'refunded')).toBe(true)
  })

  it('pending → refunded (charge.refunded webhook, full refund)', () => {
    expect(isValidItemTransition('pending', 'refunded')).toBe(true)
  })

  it('confirmed → refunded (charge.refunded webhook)', () => {
    expect(isValidItemTransition('confirmed', 'refunded')).toBe(true)
  })

  it('ready → refunded (charge.refunded webhook)', () => {
    expect(isValidItemTransition('ready', 'refunded')).toBe(true)
  })

  // -- Terminal states --
  it('fulfilled is terminal — no exits (fulfillment is physical, cannot undo)', () => {
    expect(isValidItemTransition('fulfilled', 'ready')).toBe(false)
    expect(isValidItemTransition('fulfilled', 'cancelled')).toBe(false)
    expect(isValidItemTransition('fulfilled', 'pending')).toBe(false)
    expect(isValidItemTransition('fulfilled', 'confirmed')).toBe(false)
    expect(isValidItemTransition('fulfilled', 'refunded')).toBe(false)
  })

  it('refunded is terminal — no exits', () => {
    expect(isValidItemTransition('refunded', 'pending')).toBe(false)
    expect(isValidItemTransition('refunded', 'cancelled')).toBe(false)
    expect(isValidItemTransition('refunded', 'fulfilled')).toBe(false)
  })

  // -- Invalid backwards --
  it('confirmed → pending (cannot go backwards)', () => {
    expect(isValidItemTransition('confirmed', 'pending')).toBe(false)
  })

  it('ready → pending (cannot go backwards)', () => {
    expect(isValidItemTransition('ready', 'pending')).toBe(false)
  })

  it('ready → confirmed (cannot go backwards)', () => {
    expect(isValidItemTransition('ready', 'confirmed')).toBe(false)
  })

  // -- Self-transitions --
  it('pending → pending (self-transition invalid)', () => {
    expect(isValidItemTransition('pending', 'pending')).toBe(false)
  })

  it('fulfilled → fulfilled (self-transition invalid)', () => {
    expect(isValidItemTransition('fulfilled', 'fulfilled')).toBe(false)
  })
})

// =============================================================================
// getNextOrderStatuses / getNextItemStatuses
// =============================================================================

describe('getNextOrderStatuses', () => {
  it('pending → paid, cancelled, refunded', () => {
    const next = getNextOrderStatuses('pending')
    expect([...next].sort()).toEqual(['cancelled', 'paid', 'refunded'])
  })

  it('paid → completed, cancelled, refunded', () => {
    const next = getNextOrderStatuses('paid')
    expect([...next].sort()).toEqual(['cancelled', 'completed', 'refunded'])
  })

  it('completed → refunded only', () => {
    const next = getNextOrderStatuses('completed')
    expect([...next]).toEqual(['refunded'])
  })

  it('cancelled → refunded only', () => {
    const next = getNextOrderStatuses('cancelled')
    expect([...next]).toEqual(['refunded'])
  })

  it('refunded → empty (terminal)', () => {
    expect(getNextOrderStatuses('refunded')).toHaveLength(0)
  })
})

describe('getNextItemStatuses', () => {
  it('pending → confirmed, ready, cancelled, refunded', () => {
    const next = getNextItemStatuses('pending')
    expect([...next].sort()).toEqual(['cancelled', 'confirmed', 'ready', 'refunded'])
  })

  it('confirmed → ready, fulfilled, cancelled, refunded', () => {
    const next = getNextItemStatuses('confirmed')
    expect([...next].sort()).toEqual(['cancelled', 'fulfilled', 'ready', 'refunded'])
  })

  it('ready → fulfilled, cancelled, refunded', () => {
    const next = getNextItemStatuses('ready')
    expect([...next].sort()).toEqual(['cancelled', 'fulfilled', 'refunded'])
  })

  it('fulfilled → empty (terminal)', () => {
    expect(getNextItemStatuses('fulfilled')).toHaveLength(0)
  })

  it('cancelled → refunded only', () => {
    expect([...getNextItemStatuses('cancelled')]).toEqual(['refunded'])
  })

  it('refunded → empty (terminal)', () => {
    expect(getNextItemStatuses('refunded')).toHaveLength(0)
  })
})
