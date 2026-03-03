import { describe, it, expect } from 'vitest'
import {
  NOTIFICATION_REGISTRY,
  URGENCY_CHANNELS,
  getNotificationConfig,
  type NotificationType,
  type NotificationUrgency,
} from '@/lib/notifications/types'
import {
  getTierNotificationChannels,
  TIER_LIMITS,
  FT_TIER_LIMITS,
} from '@/lib/vendor-limits'

// ── Existing structural tests ────────────────────────────────────────

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

describe('In-app notifications always included', () => {
  it('every urgency level includes in_app channel', () => {
    for (const [urgency, channels] of Object.entries(URGENCY_CHANNELS)) {
      if (urgency === 'info') continue // info is email-only by design
      expect(channels, `${urgency} should include in_app`).toContain('in_app')
    }
  })
})

describe('Each notification type has exactly one audience', () => {
  it('every type has audience = buyer, vendor, or admin', () => {
    for (const [type, config] of Object.entries(NOTIFICATION_REGISTRY)) {
      expect(['buyer', 'vendor', 'admin'], `${type} audience invalid`).toContain(config.audience)
    }
  })
})

describe('Notification type count', () => {
  it('has at least 26 notification types', () => {
    const count = Object.keys(NOTIFICATION_REGISTRY).length
    expect(count).toBeGreaterThanOrEqual(26)
  })
})

describe('actionUrl uses vertical parameter', () => {
  it('actionUrl uses vertical from template data for routing', () => {
    const ftData = { orderNumber: 'T-1', vendorName: 'V', vertical: 'food_trucks' }
    const fmData = { orderNumber: 'T-1', vendorName: 'V', vertical: 'farmers_market' }

    const config = NOTIFICATION_REGISTRY.order_ready
    expect(config.actionUrl(ftData)).toContain('food_trucks')
    expect(config.actionUrl(fmData)).toContain('farmers_market')
  })
})

// ══════════════════════════════════════════════════════════════════════
// CURRENT REGISTRY URGENCY VALUES
// These tests verify the CURRENT state of the registry.
// When per-vertical urgency code is built (getNotificationUrgency),
// tests for NI-R19-R27 will replace the .todo() tests below.
// ══════════════════════════════════════════════════════════════════════

describe('NI-R28: stale_confirmed_vendor_final urgency', () => {
  // RULE: standard for BOTH verticals (changed from immediate)
  // NOTE: Registry still says 'immediate' — update pending code change
  it('current registry value is immediate (pending change to standard)', () => {
    expect(NOTIFICATION_REGISTRY.stale_confirmed_vendor_final.urgency).toBe('immediate')
  })
})

describe('NI-R29: trial_reminder_3d urgency', () => {
  // RULE: standard for BOTH verticals (changed from immediate)
  // NOTE: Registry still says 'immediate' — update pending code change
  it('current registry value is immediate (pending change to standard)', () => {
    expect(NOTIFICATION_REGISTRY.trial_reminder_3d.urgency).toBe('immediate')
  })
})

describe('NI-R30: trial_expired urgency', () => {
  // RULE: standard for BOTH verticals (changed from immediate)
  // NOTE: Registry still says 'immediate' — update pending code change
  it('current registry value is immediate (pending change to standard)', () => {
    expect(NOTIFICATION_REGISTRY.trial_expired.urgency).toBe('immediate')
  })
})

describe('NI-R31: order_refunded urgency', () => {
  // RULE: urgent for BOTH verticals (changed from standard)
  // NOTE: Registry still says 'standard' — update pending code change
  it('current registry value is standard (pending change to urgent)', () => {
    expect(NOTIFICATION_REGISTRY.order_refunded.urgency).toBe('standard')
  })
})

describe('NI-R32: trial_grace_expired urgency', () => {
  // RULE: immediate for BOTH verticals (confirmed correct, no change)
  it('is immediate (confirmed correct)', () => {
    expect(NOTIFICATION_REGISTRY.trial_grace_expired.urgency).toBe('immediate')
  })
})

describe('NI-R33: pickup_issue_reported urgency', () => {
  // RULE: urgent for BOTH verticals (confirmed correct, no change)
  it('is urgent — vendor gets SMS for buyer-reported problems', () => {
    expect(NOTIFICATION_REGISTRY.pickup_issue_reported.urgency).toBe('urgent')
  })
})

describe('NI-R34: payout_failed urgency', () => {
  // RULE: urgent for BOTH (platform→vendor transfer failure, NOT buyer payment)
  it('is urgent — vendor gets SMS for transfer failures', () => {
    expect(NOTIFICATION_REGISTRY.payout_failed.urgency).toBe('urgent')
  })
})

describe('NI-R35: market_box_skip urgency', () => {
  // RULE: standard for BOTH verticals (confirmed correct, no change)
  it('is standard', () => {
    expect(NOTIFICATION_REGISTRY.market_box_skip.urgency).toBe('standard')
  })
})

describe('NI-R36: pickup_confirmation_needed', () => {
  // RULE: should only fire when 30s window missed, NOT at start
  // Current code fires at start — redesign pending
  it('current urgency is immediate', () => {
    expect(NOTIFICATION_REGISTRY.pickup_confirmation_needed.urgency).toBe('immediate')
  })

  it('is vendor-facing', () => {
    expect(NOTIFICATION_REGISTRY.pickup_confirmation_needed.audience).toBe('vendor')
  })
})

// ── NI-R19 through NI-R27: Per-Vertical Urgency ─────────────────────
// These rules require getNotificationUrgency() which does not exist yet.
// Tests will be activated when the per-vertical urgency code is built.

describe('NI-R19-R27: Per-vertical urgency (pending implementation)', () => {
  // Documenting expected values — these become real tests after code change
  it.todo('NI-R19: order_ready FT=immediate, FM=standard')
  it.todo('NI-R20: order_cancelled_by_vendor FT=immediate, FM=urgent')
  it.todo('NI-R21: order_cancelled_by_buyer FT=immediate, FM=urgent')
  it.todo('NI-R22: new_paid_order FT=immediate, FM=standard')
  it.todo('NI-R23: new_external_order FT=immediate, FM=standard')
  it.todo('NI-R24: stale_confirmed_vendor FT=immediate, FM=standard')
  it.todo('NI-R25: external_payment_reminder FT=immediate, FM=standard')
  it.todo('NI-R26: pickup_missed FT=immediate, FM=urgent')
  it.todo('NI-R27: market_box_pickup_missed FT=immediate, FM=standard')
})

// ── NI-R37: External payment reminder timing ─────────────────────────
// Timing constants are hardcoded in cron route, not importable.
// Verified via NI-W1 workflow (manual/integration test).

// ══════════════════════════════════════════════════════════════════════
// CHANNEL GATING (NI-R7, NI-Q5 confirmed)
// ══════════════════════════════════════════════════════════════════════

describe('NI-Q5: Tier-based channel gating — both verticals', () => {
  describe('FT channel ladder', () => {
    it('free tier = in_app only', () => {
      const channels = getTierNotificationChannels('free', 'food_trucks')
      expect(channels).toContain('in_app')
      expect(channels).not.toContain('email')
      expect(channels).not.toContain('push')
      expect(channels).not.toContain('sms')
    })

    it('basic tier = in_app + email', () => {
      const channels = getTierNotificationChannels('basic', 'food_trucks')
      expect(channels).toContain('in_app')
      expect(channels).toContain('email')
      expect(channels).not.toContain('push')
      expect(channels).not.toContain('sms')
    })

    it('pro tier = in_app + email + push', () => {
      const channels = getTierNotificationChannels('pro', 'food_trucks')
      expect(channels).toContain('in_app')
      expect(channels).toContain('email')
      expect(channels).toContain('push')
      expect(channels).not.toContain('sms')
    })

    it('boss tier = all channels', () => {
      const channels = getTierNotificationChannels('boss', 'food_trucks')
      expect(channels).toContain('in_app')
      expect(channels).toContain('email')
      expect(channels).toContain('push')
      expect(channels).toContain('sms')
    })
  })

  describe('FM channel ladder (NI-Q5 confirmed: same as FT)', () => {
    it('free tier = in_app only', () => {
      const channels = getTierNotificationChannels('free', 'farmers_market')
      expect(channels).toContain('in_app')
      expect(channels).not.toContain('email')
      expect(channels).not.toContain('push')
      expect(channels).not.toContain('sms')
    })

    it('standard tier = in_app + email', () => {
      const channels = getTierNotificationChannels('standard', 'farmers_market')
      expect(channels).toContain('in_app')
      expect(channels).toContain('email')
      expect(channels).not.toContain('push')
      expect(channels).not.toContain('sms')
    })

    it('premium tier = in_app + email + push', () => {
      const channels = getTierNotificationChannels('premium', 'farmers_market')
      expect(channels).toContain('in_app')
      expect(channels).toContain('email')
      expect(channels).toContain('push')
      expect(channels).not.toContain('sms')
    })

    it('featured tier = all channels', () => {
      const channels = getTierNotificationChannels('featured', 'farmers_market')
      expect(channels).toContain('in_app')
      expect(channels).toContain('email')
      expect(channels).toContain('push')
      expect(channels).toContain('sms')
    })
  })

  describe('Channel ladder progresses monotonically', () => {
    it('FT: each tier has >= channels of the tier below', () => {
      const tiers = ['free', 'basic', 'pro', 'boss'] as const
      for (let i = 1; i < tiers.length; i++) {
        const lower = getTierNotificationChannels(tiers[i - 1], 'food_trucks')
        const higher = getTierNotificationChannels(tiers[i], 'food_trucks')
        expect(higher.length, `${tiers[i]} should have >= ${tiers[i-1]} channels`).toBeGreaterThanOrEqual(lower.length)
      }
    })

    it('FM: each tier has >= channels of the tier below', () => {
      const tiers = ['free', 'standard', 'premium', 'featured'] as const
      for (let i = 1; i < tiers.length; i++) {
        const lower = getTierNotificationChannels(tiers[i - 1], 'farmers_market')
        const higher = getTierNotificationChannels(tiers[i], 'farmers_market')
        expect(higher.length, `${tiers[i]} should have >= ${tiers[i-1]} channels`).toBeGreaterThanOrEqual(lower.length)
      }
    })
  })

  describe('Unknown tier falls back to in_app only', () => {
    it('unknown FT tier gets in_app', () => {
      const channels = getTierNotificationChannels('nonexistent', 'food_trucks')
      expect(channels).toContain('in_app')
    })

    it('unknown FM tier gets in_app', () => {
      const channels = getTierNotificationChannels('nonexistent', 'farmers_market')
      expect(channels).toContain('in_app')
    })
  })
})

// ══════════════════════════════════════════════════════════════════════
// URGENCY → CHANNEL MAPPING INTEGRITY
// ══════════════════════════════════════════════════════════════════════

describe('Urgency-to-channel mapping integrity', () => {
  it('immediate = push + in_app (free channels, real-time)', () => {
    expect(URGENCY_CHANNELS.immediate).toEqual(['push', 'in_app'])
  })

  it('urgent = sms + in_app (paid SMS for critical vendor alerts)', () => {
    expect(URGENCY_CHANNELS.urgent).toEqual(['sms', 'in_app'])
  })

  it('standard = email + in_app (low-cost, non-time-critical)', () => {
    expect(URGENCY_CHANNELS.standard).toEqual(['email', 'in_app'])
  })

  it('info = email only (lowest priority)', () => {
    expect(URGENCY_CHANNELS.info).toEqual(['email'])
  })
})

// ══════════════════════════════════════════════════════════════════════
// AUDIENCE CORRECTNESS
// ══════════════════════════════════════════════════════════════════════

describe('Notification audience correctness', () => {
  const buyerTypes: NotificationType[] = [
    'order_confirmed', 'order_ready', 'order_fulfilled',
    'order_cancelled_by_vendor', 'order_refunded', 'order_expired',
    'pickup_missed', 'stale_confirmed_buyer', 'market_box_skip',
    'market_box_pickup_missed', 'issue_resolved',
  ]

  const vendorTypes: NotificationType[] = [
    'new_paid_order', 'new_external_order', 'external_payment_reminder',
    'external_payment_auto_confirmed', 'order_cancelled_by_buyer',
    'vendor_approved', 'vendor_rejected', 'market_approved',
    'pickup_confirmation_needed', 'pickup_issue_reported',
    'inventory_low_stock', 'inventory_out_of_stock',
    'payout_processed', 'payout_failed',
    'stale_confirmed_vendor', 'stale_confirmed_vendor_final',
    'vendor_cancellation_warning', 'vendor_quality_alert',
    'vendor_approved_trial', 'trial_reminder_14d', 'trial_reminder_7d',
    'trial_reminder_3d', 'trial_expired', 'trial_grace_expired',
  ]

  const adminTypes: NotificationType[] = [
    'new_vendor_application', 'issue_disputed',
  ]

  for (const type of buyerTypes) {
    it(`${type} is buyer-facing`, () => {
      expect(NOTIFICATION_REGISTRY[type]?.audience).toBe('buyer')
    })
  }

  for (const type of vendorTypes) {
    it(`${type} is vendor-facing`, () => {
      expect(NOTIFICATION_REGISTRY[type]?.audience).toBe('vendor')
    })
  }

  for (const type of adminTypes) {
    it(`${type} is admin-facing`, () => {
      expect(NOTIFICATION_REGISTRY[type]?.audience).toBe('admin')
    })
  }
})
