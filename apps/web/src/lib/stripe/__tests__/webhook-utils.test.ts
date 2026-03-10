/**
 * Webhook Utilities Tests
 *
 * Tests pure functions extracted from Stripe webhooks.
 * Covers: IR-R9 (webhook event handling)
 *
 * Run: npx vitest run src/lib/stripe/__tests__/webhook-utils.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  HANDLED_EVENT_TYPES,
  isHandledEventType,
  selectBasePriceForTermWeeks,
} from '../webhook-utils'

describe('Webhook Event Types', () => {
  it('lists 11 handled event types', () => {
    expect(HANDLED_EVENT_TYPES).toHaveLength(11)
  })

  it('checkout.session.completed is handled', () => {
    expect(isHandledEventType('checkout.session.completed')).toBe(true)
  })

  it('payment_intent.succeeded is handled', () => {
    expect(isHandledEventType('payment_intent.succeeded')).toBe(true)
  })

  it('customer.subscription.updated is handled', () => {
    expect(isHandledEventType('customer.subscription.updated')).toBe(true)
  })

  it('unknown.event.type is NOT handled', () => {
    expect(isHandledEventType('unknown.event.type')).toBe(false)
  })

  it('empty string is NOT handled', () => {
    expect(isHandledEventType('')).toBe(false)
  })
})

describe('selectBasePriceForTermWeeks', () => {
  const offering = {
    price_cents: 1000,
    price_4week_cents: 900,
    price_8week_cents: 800,
  }

  it('metadata value takes priority over offering', () => {
    const result = selectBasePriceForTermWeeks(
      { basePriceCentsFromMeta: 1200 },
      offering,
      8,
    )
    expect(result).toBe(1200)
  })

  it('8-week term selects price_8week_cents first', () => {
    const result = selectBasePriceForTermWeeks({}, offering, 8)
    expect(result).toBe(800)
  })

  it('4-week term selects price_4week_cents first', () => {
    const result = selectBasePriceForTermWeeks({}, offering, 4)
    expect(result).toBe(900)
  })

  it('8-week term falls back to price_4week if no 8-week price', () => {
    const result = selectBasePriceForTermWeeks(
      {},
      { price_cents: 1000, price_4week_cents: 900, price_8week_cents: null },
      8,
    )
    expect(result).toBe(900)
  })

  it('4-week term falls back to price_cents if no 4-week price', () => {
    const result = selectBasePriceForTermWeeks(
      {},
      { price_cents: 1000, price_4week_cents: null, price_8week_cents: null },
      4,
    )
    expect(result).toBe(1000)
  })

  it('metadata value of 0 is ignored (not positive)', () => {
    const result = selectBasePriceForTermWeeks(
      { basePriceCentsFromMeta: 0 },
      offering,
      4,
    )
    expect(result).toBe(900)
  })

  it('undefined metadata falls through to offering', () => {
    const result = selectBasePriceForTermWeeks(
      { basePriceCentsFromMeta: undefined },
      offering,
      4,
    )
    expect(result).toBe(900)
  })
})
