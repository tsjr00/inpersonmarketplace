'use client'

import { useRouter } from 'next/navigation'
import MarketScheduleSelector from '@/components/vendor/MarketScheduleSelector'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * BR-13 (owner 2026-09-19, "C"): a vendor must pick at least one day they
 * attend a market before booking a booth week there. The booking page renders
 * this above the (disabled) booking form when the vendor has no declaration
 * rows at the market; the same selector the Markets page uses does the work,
 * and when the vendor closes it the page reloads its server state so the
 * form unlocks. The server route is authoritative (ERR_DECLARE_DAYS_FIRST).
 *
 * Why here and not a link away: the declaration is what makes a paid week
 * sellable (mig 238/255) and what the cancelled-day credit is computed over
 * (BR-9/10). Sending the vendor elsewhere at the moment of paying is exactly
 * the "paid but can't sell" gap this closes.
 */
interface DeclareDaysGateProps {
  marketId: string
  marketName: string
  vertical: string
}

export default function DeclareDaysGate({ marketId, marketName, vertical }: DeclareDaysGateProps) {
  const router = useRouter()
  return (
    <div style={{
      marginBottom: spacing.md,
      padding: spacing.md,
      backgroundColor: '#fffbeb',
      border: '1px solid #fcd34d',
      borderRadius: radius.md,
    }}>
      <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.base, color: '#78350f', marginBottom: spacing['2xs'] }}>
        First, pick the days you attend {marketName}
      </div>
      <p style={{ margin: `0 0 ${spacing.sm} 0`, fontSize: typography.sizes.sm, color: '#78350f', lineHeight: 1.5 }}>
        Buyers see you only on the days you pick, and a booth week you pay for covers those days. Choose at least
        one day below, then the booking form unlocks. You can change your days any time from your Markets page.
      </p>
      <MarketScheduleSelector
        marketId={marketId}
        marketName={marketName}
        vertical={vertical}
        marketType="traditional"
        onClose={() => router.refresh()}
      />
      <button
        type="button"
        onClick={() => router.refresh()}
        style={{
          marginTop: spacing.sm,
          padding: `${spacing.xs} ${spacing.md}`,
          backgroundColor: colors.primary,
          color: 'white',
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          cursor: 'pointer',
        }}
      >
        Done — continue to booking
      </button>
    </div>
  )
}
