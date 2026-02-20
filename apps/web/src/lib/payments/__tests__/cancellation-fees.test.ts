import { describe, it, expect } from 'vitest'
import {
  calculateCancellationFee,
  CANCELLATION_FEE_PERCENT,
  GRACE_PERIOD_MS,
} from '@/lib/payments/cancellation-fees'

describe('calculateCancellationFee', () => {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  it('gives full refund within grace period regardless of status', () => {
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed', // vendor confirmed, but still within grace
      orderCreatedAt: thirtyMinAgo,
    })

    expect(result.feeApplied).toBe(false)
    expect(result.withinGracePeriod).toBe(true)
    expect(result.cancellationFeeCents).toBe(0)
    expect(result.vendorShareCents).toBe(0)
    expect(result.platformShareCents).toBe(0)
    // Refund = full buyer payment: 1000 + round(1000*0.065) + round(15/1) = 1000 + 65 + 15 = 1080
    expect(result.refundAmountCents).toBe(1080)
  })

  it('gives full refund after grace when vendor has NOT confirmed', () => {
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'pending',
      orderCreatedAt: twoHoursAgo,
    })

    expect(result.feeApplied).toBe(false)
    expect(result.withinGracePeriod).toBe(false)
    expect(result.vendorHadConfirmed).toBe(false)
    expect(result.cancellationFeeCents).toBe(0)
    expect(result.refundAmountCents).toBe(1080)
  })

  it('applies 25% fee after grace when vendor confirmed', () => {
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: twoHoursAgo,
    })

    expect(result.feeApplied).toBe(true)
    expect(result.withinGracePeriod).toBe(false)
    expect(result.vendorHadConfirmed).toBe(true)

    // Buyer paid 1080. 25% fee = 270. Refund = 810.
    expect(result.refundAmountCents).toBe(810)
    expect(result.cancellationFeeCents).toBe(270)

    // Platform + vendor shares should sum to cancellation fee
    expect(result.platformShareCents + result.vendorShareCents).toBe(270)

    // Platform share: round(270 * 13% application fee) = round(270 * 0.13) = 35
    expect(result.platformShareCents).toBe(35)
    expect(result.vendorShareCents).toBe(235)
  })

  it('prorates flat fee correctly for multi-item orders', () => {
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 3,
      orderStatus: 'pending',
      orderCreatedAt: thirtyMinAgo,
    })

    // Flat fee per item: round(15/3) = 5
    // Buyer paid: 1000 + round(1000*0.065) + 5 = 1000 + 65 + 5 = 1070
    expect(result.refundAmountCents).toBe(1070)
  })
})
