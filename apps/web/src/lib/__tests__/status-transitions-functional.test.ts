/**
 * Order & Item Status Transitions — Functional Tests
 *
 * Tests the complete state machines for orders and items.
 * Verifies every valid transition, every invalid transition,
 * terminal states, and status enums.
 *
 * Covers gaps: OL-001 through OL-008
 *
 * IMPORTANT: Expected values come from BUSINESS RULES, not from reading code.
 * If a test fails, investigate the code — do NOT change the test.
 * See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/status-transitions-functional.test.ts
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
} from '@/lib/orders/status-transitions'

// =============================================================================
// OL-001: Active order statuses
// =============================================================================

describe('OL-001: Active order statuses', () => {
  it('contains exactly pending, paid, completed, cancelled, refunded', () => {
    expect([...ORDER_STATUSES_ACTIVE].sort()).toEqual(
      ['cancelled', 'completed', 'paid', 'pending', 'refunded']
    )
  })

  it('has exactly 5 active statuses', () => {
    expect(ORDER_STATUSES_ACTIVE).toHaveLength(5)
  })
})

// =============================================================================
// OL-002: Unused order statuses (in DB enum, never set by code)
// =============================================================================

describe('OL-002: Unused order statuses', () => {
  it('contains exactly confirmed and ready', () => {
    expect([...ORDER_STATUSES_UNUSED].sort()).toEqual(['confirmed', 'ready'])
  })

  it('has exactly 2 unused statuses', () => {
    expect(ORDER_STATUSES_UNUSED).toHaveLength(2)
  })
})

// =============================================================================
// OL-003: Valid order transitions
// =============================================================================

describe('OL-003: Valid order status transitions', () => {
  // Happy path
  it('pending → paid is valid', () => {
    expect(isValidOrderTransition('pending', 'paid')).toBe(true)
  })

  it('paid → completed is valid', () => {
    expect(isValidOrderTransition('paid', 'completed')).toBe(true)
  })

  // Cancellation from non-terminal
  it('pending → cancelled is valid', () => {
    expect(isValidOrderTransition('pending', 'cancelled')).toBe(true)
  })

  it('paid → cancelled is valid', () => {
    expect(isValidOrderTransition('paid', 'cancelled')).toBe(true)
  })

  // Refund from any
  it('pending → refunded is valid', () => {
    expect(isValidOrderTransition('pending', 'refunded')).toBe(true)
  })

  it('paid → refunded is valid', () => {
    expect(isValidOrderTransition('paid', 'refunded')).toBe(true)
  })

  it('completed → refunded is valid (charge.refunded webhook)', () => {
    expect(isValidOrderTransition('completed', 'refunded')).toBe(true)
  })

  it('cancelled → refunded is valid (after Stripe refund)', () => {
    expect(isValidOrderTransition('cancelled', 'refunded')).toBe(true)
  })

  // Invalid transitions
  it('completed → cancelled is NOT valid', () => {
    expect(isValidOrderTransition('completed', 'cancelled')).toBe(false)
  })

  it('completed → paid is NOT valid (no backwards)', () => {
    expect(isValidOrderTransition('completed', 'paid')).toBe(false)
  })

  it('paid → pending is NOT valid (no backwards)', () => {
    expect(isValidOrderTransition('paid', 'pending')).toBe(false)
  })

  it('cancelled → paid is NOT valid', () => {
    expect(isValidOrderTransition('cancelled', 'paid')).toBe(false)
  })

  it('cancelled → completed is NOT valid', () => {
    expect(isValidOrderTransition('cancelled', 'completed')).toBe(false)
  })

  it('refunded → anything is NOT valid (terminal)', () => {
    expect(isValidOrderTransition('refunded', 'pending')).toBe(false)
    expect(isValidOrderTransition('refunded', 'paid')).toBe(false)
    expect(isValidOrderTransition('refunded', 'completed')).toBe(false)
    expect(isValidOrderTransition('refunded', 'cancelled')).toBe(false)
  })

  // getNextOrderStatuses
  it('pending can go to paid, cancelled, refunded', () => {
    const next = getNextOrderStatuses('pending')
    expect([...next].sort()).toEqual(['cancelled', 'paid', 'refunded'])
  })

  it('paid can go to completed, cancelled, refunded', () => {
    const next = getNextOrderStatuses('paid')
    expect([...next].sort()).toEqual(['cancelled', 'completed', 'refunded'])
  })

  it('completed can only go to refunded', () => {
    expect([...getNextOrderStatuses('completed')]).toEqual(['refunded'])
  })

  it('cancelled can only go to refunded', () => {
    expect([...getNextOrderStatuses('cancelled')]).toEqual(['refunded'])
  })

  it('refunded has no next statuses', () => {
    expect([...getNextOrderStatuses('refunded')]).toEqual([])
  })
})

// =============================================================================
// OL-004: Terminal order statuses
// =============================================================================

describe('OL-004: Terminal order statuses', () => {
  it('only refunded is terminal', () => {
    expect([...ORDER_TERMINAL_STATUSES]).toEqual(['refunded'])
  })
})

// =============================================================================
// OL-005: Item statuses
// =============================================================================

describe('OL-005: Item statuses', () => {
  it('contains exactly pending, confirmed, ready, fulfilled, cancelled, refunded', () => {
    expect([...ITEM_STATUSES].sort()).toEqual(
      ['cancelled', 'confirmed', 'fulfilled', 'pending', 'ready', 'refunded']
    )
  })

  it('has exactly 6 item statuses', () => {
    expect(ITEM_STATUSES).toHaveLength(6)
  })
})

// =============================================================================
// OL-006: Valid item transitions
// =============================================================================

describe('OL-006: Valid item status transitions', () => {
  // Happy path
  it('pending → confirmed is valid', () => {
    expect(isValidItemTransition('pending', 'confirmed')).toBe(true)
  })

  it('confirmed → ready is valid', () => {
    expect(isValidItemTransition('confirmed', 'ready')).toBe(true)
  })

  it('ready → fulfilled is valid', () => {
    expect(isValidItemTransition('ready', 'fulfilled')).toBe(true)
  })

  // Skip: pending → ready (vendor skips confirmed)
  it('pending → ready is valid (vendor can skip confirmed)', () => {
    expect(isValidItemTransition('pending', 'ready')).toBe(true)
  })

  // Skip: confirmed → fulfilled (vendor can skip ready)
  it('confirmed → fulfilled is valid', () => {
    expect(isValidItemTransition('confirmed', 'fulfilled')).toBe(true)
  })

  // Cancellation from pre-fulfilled
  it('pending → cancelled is valid', () => {
    expect(isValidItemTransition('pending', 'cancelled')).toBe(true)
  })

  it('confirmed → cancelled is valid', () => {
    expect(isValidItemTransition('confirmed', 'cancelled')).toBe(true)
  })

  it('ready → cancelled is valid', () => {
    expect(isValidItemTransition('ready', 'cancelled')).toBe(true)
  })

  // Refund from various
  it('pending → refunded is valid', () => {
    expect(isValidItemTransition('pending', 'refunded')).toBe(true)
  })

  it('confirmed → refunded is valid', () => {
    expect(isValidItemTransition('confirmed', 'refunded')).toBe(true)
  })

  it('ready → refunded is valid', () => {
    expect(isValidItemTransition('ready', 'refunded')).toBe(true)
  })

  it('cancelled → refunded is valid (after Stripe refund)', () => {
    expect(isValidItemTransition('cancelled', 'refunded')).toBe(true)
  })

  // Terminal: fulfilled → nothing
  it('fulfilled → anything is NOT valid (terminal)', () => {
    expect(isValidItemTransition('fulfilled', 'pending')).toBe(false)
    expect(isValidItemTransition('fulfilled', 'confirmed')).toBe(false)
    expect(isValidItemTransition('fulfilled', 'ready')).toBe(false)
    expect(isValidItemTransition('fulfilled', 'cancelled')).toBe(false)
    expect(isValidItemTransition('fulfilled', 'refunded')).toBe(false)
  })

  // Terminal: refunded → nothing
  it('refunded → anything is NOT valid (terminal)', () => {
    expect(isValidItemTransition('refunded', 'pending')).toBe(false)
    expect(isValidItemTransition('refunded', 'confirmed')).toBe(false)
    expect(isValidItemTransition('refunded', 'ready')).toBe(false)
    expect(isValidItemTransition('refunded', 'fulfilled')).toBe(false)
    expect(isValidItemTransition('refunded', 'cancelled')).toBe(false)
  })

  // Invalid backwards transitions
  it('confirmed → pending is NOT valid (no backwards)', () => {
    expect(isValidItemTransition('confirmed', 'pending')).toBe(false)
  })

  it('ready → pending is NOT valid', () => {
    expect(isValidItemTransition('ready', 'pending')).toBe(false)
  })

  it('ready → confirmed is NOT valid', () => {
    expect(isValidItemTransition('ready', 'confirmed')).toBe(false)
  })

  it('cancelled → pending is NOT valid', () => {
    expect(isValidItemTransition('cancelled', 'pending')).toBe(false)
  })

  it('cancelled → confirmed is NOT valid', () => {
    expect(isValidItemTransition('cancelled', 'confirmed')).toBe(false)
  })

  // getNextItemStatuses
  it('pending can go to confirmed, ready, cancelled, refunded', () => {
    const next = getNextItemStatuses('pending')
    expect([...next].sort()).toEqual(['cancelled', 'confirmed', 'ready', 'refunded'])
  })

  it('confirmed can go to ready, fulfilled, cancelled, refunded', () => {
    const next = getNextItemStatuses('confirmed')
    expect([...next].sort()).toEqual(['cancelled', 'fulfilled', 'ready', 'refunded'])
  })

  it('ready can go to fulfilled, cancelled, refunded', () => {
    const next = getNextItemStatuses('ready')
    expect([...next].sort()).toEqual(['cancelled', 'fulfilled', 'refunded'])
  })

  it('fulfilled has no next statuses', () => {
    expect([...getNextItemStatuses('fulfilled')]).toEqual([])
  })

  it('cancelled can only go to refunded', () => {
    expect([...getNextItemStatuses('cancelled')]).toEqual(['refunded'])
  })

  it('refunded has no next statuses', () => {
    expect([...getNextItemStatuses('refunded')]).toEqual([])
  })
})

// =============================================================================
// OL-007: Terminal item statuses
// =============================================================================

describe('OL-007: Terminal item statuses', () => {
  it('fulfilled and refunded are terminal', () => {
    expect([...ITEM_TERMINAL_STATUSES].sort()).toEqual(['fulfilled', 'refunded'])
  })
})

// =============================================================================
// OL-008: Same-status transition is always invalid
// =============================================================================

describe('OL-008: Same-status transition is invalid', () => {
  it('order: same status → false for all statuses', () => {
    for (const status of ORDER_STATUSES_ACTIVE) {
      expect(isValidOrderTransition(status, status)).toBe(false)
    }
  })

  it('item: same status → false for all statuses', () => {
    for (const status of ITEM_STATUSES) {
      expect(isValidItemTransition(status, status)).toBe(false)
    }
  })
})
