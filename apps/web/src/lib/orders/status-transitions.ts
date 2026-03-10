/**
 * Order & Item Status Transition Rules
 *
 * Codifies the valid state machines for orders and items as separate,
 * type-safe systems. Orders and items use DIFFERENT enums with DIFFERENT
 * values — do not confuse them.
 *
 * Source of truth: apps/web/.claude/status_system_audit.md
 * Verified against every route handler 2026-03-10.
 *
 * Orders: pending → paid → completed (+ cancelled/refunded interrupts)
 * Items:  pending → confirmed → ready → fulfilled (+ cancelled/refunded interrupts)
 *
 * Rules: OL-R1 (order transitions), OL-R2 (item transitions)
 */

// -- Order Statuses (orders.status column, order_status enum) --

/** Statuses actively used on orders by route handlers */
export const ORDER_STATUSES_ACTIVE = ['pending', 'paid', 'completed', 'cancelled', 'refunded'] as const
export type OrderStatus = typeof ORDER_STATUSES_ACTIVE[number]

/**
 * Full DB enum includes 'confirmed' and 'ready' but these are NEVER set
 * on orders by any code path. They exist in the enum only. Documented
 * as unused per user decision 2026-03-10.
 */
export const ORDER_STATUSES_UNUSED = ['confirmed', 'ready'] as const

// -- Item Statuses (order_items.status column, order_item_status enum) --

export const ITEM_STATUSES = ['pending', 'confirmed', 'ready', 'fulfilled', 'cancelled', 'refunded'] as const
export type ItemStatus = typeof ITEM_STATUSES[number]

// -- Order Transitions --

/**
 * Valid order status transitions.
 *
 * Happy path: pending → paid → completed
 * Cancellation: any non-terminal → cancelled
 * Refund: any → refunded (via charge.refunded webhook)
 *         cancelled → refunded (after Stripe refund processing)
 *
 * Triggers:
 *   pending → paid:       checkout/success, webhook checkout.session.completed,
 *                          vendor confirm-external-payment, cron Phase 3.6
 *   paid → completed:     atomic_complete_order_if_ready() RPC
 *   any → cancelled:      all items cancelled (buyer cancel, vendor reject, cron Phases 1-3)
 *   any → refunded:       charge.refunded webhook (Stripe Dashboard)
 *   cancelled → refunded: after Stripe refund processes
 */
const VALID_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['paid', 'cancelled', 'refunded'],
  paid: ['completed', 'cancelled', 'refunded'],
  completed: ['refunded'],     // only via charge.refunded webhook
  cancelled: ['refunded'],     // after Stripe refund processes
  refunded: [],                // terminal
}

// -- Item Transitions --

/**
 * Valid item status transitions.
 *
 * Happy path: pending → confirmed → ready → fulfilled
 * Skip: pending → ready (vendor can skip confirmed via ready route)
 * Cancel: any pre-fulfilled → cancelled
 * Refund: cancelled → refunded (after Stripe refund)
 *         any non-cancelled → refunded (charge.refunded webhook)
 *
 * Triggers:
 *   pending → confirmed:    vendor confirm, vendor confirm-external-payment, Phase 3.6
 *   pending → ready:        vendor ready route (accepts pending)
 *   pending → cancelled:    Phase 1 expiry, Phase 2/3, buyer cancel, vendor reject
 *   confirmed → ready:      vendor marks ready
 *   confirmed → fulfilled:  vendor fulfill, Phase 7 auto-fulfill
 *   confirmed → cancelled:  buyer cancel, vendor reject
 *   ready → fulfilled:      vendor fulfill, mutual pickup, Phase 4 no-show, Phase 7
 *   ready → cancelled:      buyer cancel, vendor reject
 *   cancelled → refunded:   after Stripe refund processing
 *   any → refunded:         charge.refunded webhook (full refund)
 *
 * NOTE: fulfilled is TERMINAL. The previous fulfilled→ready revert on failed
 * Stripe transfer was incorrect (user decision 2026-03-10: fulfillment is
 * physical, payout is financial — separate concerns). Fix on backlog.
 */
const VALID_ITEM_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  pending: ['confirmed', 'ready', 'cancelled', 'refunded'],
  confirmed: ['ready', 'fulfilled', 'cancelled', 'refunded'],
  ready: ['fulfilled', 'cancelled', 'refunded'],
  fulfilled: [],               // terminal — physical handover happened
  cancelled: ['refunded'],
  refunded: [],                // terminal
}

/** Terminal order statuses — no further transitions possible */
export const ORDER_TERMINAL_STATUSES: readonly OrderStatus[] = ['refunded']

/** Terminal item statuses — no further transitions possible */
export const ITEM_TERMINAL_STATUSES: readonly ItemStatus[] = ['fulfilled', 'refunded']

/**
 * Check if an order status transition is valid.
 * Uses OrderStatus type to prevent accidentally passing item statuses.
 */
export function isValidOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false
  return VALID_ORDER_TRANSITIONS[from].includes(to)
}

/**
 * Check if an item status transition is valid.
 * Uses ItemStatus type to prevent accidentally passing order statuses.
 */
export function isValidItemTransition(from: ItemStatus, to: ItemStatus): boolean {
  if (from === to) return false
  return VALID_ITEM_TRANSITIONS[from].includes(to)
}

/**
 * Get all valid next statuses for a given current status.
 * Returns empty array for terminal states.
 */
export function getNextOrderStatuses(current: OrderStatus): readonly OrderStatus[] {
  return VALID_ORDER_TRANSITIONS[current] ?? []
}

export function getNextItemStatuses(current: ItemStatus): readonly ItemStatus[] {
  return VALID_ITEM_TRANSITIONS[current] ?? []
}
