'use client'

import { spacing, typography } from '@/lib/design-tokens'

interface PaymentMethodBadgesProps {
  stripeChargesEnabled?: boolean
  venmoUsername?: string | null
  cashappCashtag?: string | null
  paypalUsername?: string | null
  acceptsCashAtPickup?: boolean
  size?: 'sm' | 'md'
}

const BADGE_STYLES = {
  sm: {
    fontSize: typography.sizes.xs,
    padding: '1px 8px',
  },
  md: {
    fontSize: typography.sizes.sm,
    padding: '2px 10px',
  },
} as const

export default function PaymentMethodBadges({
  venmoUsername,
  cashappCashtag,
  paypalUsername,
  acceptsCashAtPickup,
  size = 'sm',
}: PaymentMethodBadgesProps) {
  const methods: string[] = ['Cards'] // Stripe/cards always available

  if (venmoUsername) methods.push('Venmo')
  if (cashappCashtag) methods.push('Cash App')
  if (paypalUsername) methods.push('PayPal')
  if (acceptsCashAtPickup) methods.push('Cash')

  const sizeStyle = BADGE_STYLES[size]

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing['2xs'],
      alignItems: 'center',
    }}>
      {methods.map(method => (
        <span
          key={method}
          style={{
            display: 'inline-block',
            fontSize: sizeStyle.fontSize,
            padding: sizeStyle.padding,
            border: '1px solid #6b7280',
            borderRadius: 999,
            color: '#374151',
            backgroundColor: 'transparent',
            whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}
        >
          {method}
        </span>
      ))}
    </div>
  )
}
