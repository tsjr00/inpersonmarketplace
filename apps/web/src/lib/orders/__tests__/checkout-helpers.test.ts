/**
 * Checkout Helpers Tests
 *
 * Tests idempotency key construction, tipping eligibility,
 * and payment method classification.
 * Covers: MP-R7 (idempotency), MP-R19 (tipping), OL-R9 (Stripe refund guard)
 *
 * Run: npx vitest run src/lib/orders/__tests__/checkout-helpers.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  EXTERNAL_PAYMENT_METHODS,
  buildIdempotencyKey,
  isTippingEnabled,
  isExternalPayment,
  shouldCallStripeRefund,
} from '../checkout-helpers'

// -- MP-R7: Idempotency Keys --

describe('buildIdempotencyKey', () => {
  it('checkout key: checkout-{orderId}', () => {
    expect(buildIdempotencyKey('checkout', { orderId: 'order-123' }))
      .toBe('checkout-order-123')
  })

  it('transfer key: transfer-{orderId}-{orderItemId}', () => {
    expect(buildIdempotencyKey('transfer', { orderId: 'o1', orderItemId: 'oi1' }))
      .toBe('transfer-o1-oi1')
  })

  it('market-box key: market-box-{offeringId}-{userId}-{startDate}', () => {
    expect(buildIdempotencyKey('market-box', {
      offeringId: 'off1',
      userId: 'u1',
      startDate: '2026-03-15',
    })).toBe('market-box-off1-u1-2026-03-15')
  })

  it('transfer-mb-sub key: transfer-mb-sub-{subscriptionId}', () => {
    expect(buildIdempotencyKey('transfer-mb-sub', { subscriptionId: 'sub-abc' }))
      .toBe('transfer-mb-sub-sub-abc')
  })

  it('refund key with amount: refund-{piId}-{amount}', () => {
    expect(buildIdempotencyKey('refund', { paymentIntentId: 'pi_123', amount: 500 }))
      .toBe('refund-pi_123-500')
  })

  it('refund key without amount: refund-{piId}-full', () => {
    expect(buildIdempotencyKey('refund', { paymentIntentId: 'pi_456' }))
      .toBe('refund-pi_456-full')
  })

  it('deterministic: same inputs produce same key', () => {
    const key1 = buildIdempotencyKey('checkout', { orderId: 'x' })
    const key2 = buildIdempotencyKey('checkout', { orderId: 'x' })
    expect(key1).toBe(key2)
  })
})

// -- MP-R19: Tipping --

describe('isTippingEnabled', () => {
  it('food_trucks → true', () => {
    expect(isTippingEnabled('food_trucks')).toBe(true)
  })

  it('farmers_market → false', () => {
    expect(isTippingEnabled('farmers_market')).toBe(false)
  })

  it('fire_works → false', () => {
    expect(isTippingEnabled('fire_works')).toBe(false)
  })

  it('unknown vertical → false', () => {
    expect(isTippingEnabled('something_else')).toBe(false)
  })
})

// -- OL-R9: External Payment / Stripe Refund Guard --

describe('isExternalPayment', () => {
  it('venmo → external', () => {
    expect(isExternalPayment('venmo')).toBe(true)
  })

  it('cashapp → external', () => {
    expect(isExternalPayment('cashapp')).toBe(true)
  })

  it('paypal → external', () => {
    expect(isExternalPayment('paypal')).toBe(true)
  })

  it('cash → external', () => {
    expect(isExternalPayment('cash')).toBe(true)
  })

  it('stripe → not external', () => {
    expect(isExternalPayment('stripe')).toBe(false)
  })

  it('card → not external', () => {
    expect(isExternalPayment('card')).toBe(false)
  })
})

describe('shouldCallStripeRefund', () => {
  it('stripe → true (call Stripe)', () => {
    expect(shouldCallStripeRefund('stripe')).toBe(true)
  })

  it('card → true (call Stripe)', () => {
    expect(shouldCallStripeRefund('card')).toBe(true)
  })

  it('cash → false (no Stripe refund)', () => {
    expect(shouldCallStripeRefund('cash')).toBe(false)
  })

  it('venmo → false (no Stripe refund)', () => {
    expect(shouldCallStripeRefund('venmo')).toBe(false)
  })
})

describe('EXTERNAL_PAYMENT_METHODS constant (OL-R9)', () => {
  it('contains exactly the 4 external payment methods', () => {
    // OL-R9: External payment methods are venmo, cashapp, paypal, cash
    expect([...EXTERNAL_PAYMENT_METHODS].sort()).toEqual(['cash', 'cashapp', 'paypal', 'venmo'])
  })
})
