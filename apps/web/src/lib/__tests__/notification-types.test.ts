import { describe, it, expect } from 'vitest'
import {
  NOTIFICATION_REGISTRY,
  URGENCY_CHANNELS,
  getNotificationConfig,
  type NotificationType,
} from '@/lib/notifications/types'

describe('NOTIFICATION_REGISTRY', () => {
  it('has all required notification types', () => {
    const requiredTypes: NotificationType[] = [
      'order_confirmed',
      'order_ready',
      'order_fulfilled',
      'order_cancelled_by_vendor',
      'order_refunded',
      'order_expired',
      'pickup_missed',
      'new_paid_order',
      'new_external_order',
      'payout_processed',
      'payout_failed',
      'vendor_approved',
      'new_vendor_application',
    ]

    for (const type of requiredTypes) {
      expect(NOTIFICATION_REGISTRY[type], `Missing type: ${type}`).toBeDefined()
    }
  })

  it('every type has title, message, and actionUrl functions', () => {
    for (const [type, config] of Object.entries(NOTIFICATION_REGISTRY)) {
      expect(typeof config.title, `${type}.title should be function`).toBe('function')
      expect(typeof config.message, `${type}.message should be function`).toBe('function')
      expect(typeof config.actionUrl, `${type}.actionUrl should be function`).toBe('function')
      expect(config.urgency, `${type}.urgency should be defined`).toBeTruthy()
      expect(config.audience, `${type}.audience should be defined`).toBeTruthy()
    }
  })

  it('every type produces non-empty title and message', () => {
    const testData = { orderNumber: 'TEST-001', vendorName: 'Test Vendor' }

    for (const [type, config] of Object.entries(NOTIFICATION_REGISTRY)) {
      const title = config.title(testData)
      const message = config.message(testData)

      expect(title.length, `${type} title should not be empty`).toBeGreaterThan(0)
      expect(message.length, `${type} message should not be empty`).toBeGreaterThan(0)
    }
  })

  it('order_refunded includes refund amount in message', () => {
    const config = NOTIFICATION_REGISTRY.order_refunded
    const message = config.message({ orderNumber: 'ORD-123', amountCents: 1500 })

    expect(message).toContain('$15.00')
    expect(message).toContain('ORD-123')
  })
})

describe('URGENCY_CHANNELS', () => {
  it('maps urgencies to appropriate channels', () => {
    expect(URGENCY_CHANNELS.immediate).toContain('push')
    expect(URGENCY_CHANNELS.immediate).toContain('in_app')
    expect(URGENCY_CHANNELS.urgent).toContain('sms')
    expect(URGENCY_CHANNELS.standard).toContain('email')
    expect(URGENCY_CHANNELS.info).toContain('email')
  })
})

describe('getNotificationConfig', () => {
  it('returns config for known types', () => {
    const config = getNotificationConfig('order_confirmed')
    expect(config).toBeDefined()
    expect(config?.audience).toBe('buyer')
  })

  it('returns undefined for unknown types', () => {
    const config = getNotificationConfig('nonexistent_type')
    expect(config).toBeUndefined()
  })
})
