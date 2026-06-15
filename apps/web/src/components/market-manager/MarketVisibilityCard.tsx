import { spacing, typography, radius } from '@/lib/design-tokens'
import type { MarketVisibilityStatus } from '@/lib/markets/market-visibility'

/**
 * Buyer-visibility status card on the manager dashboard (Session 92 A1).
 *
 * The public markets directory hides a traditional market until at least
 * one vendor has BOTH a published listing here AND an active attendance
 * schedule (visible-markets.ts). That rule is deliberate — buyers should
 * never see a market they can't buy from — but before this card, managers
 * could complete 100% of onboarding and have no idea why their market
 * didn't appear. This card names the rule and shows the live status.
 *
 * Rendered only for market_type='traditional' (events are exempt from the
 * gate). Renders a compact confirmation once visible.
 */
interface MarketVisibilityCardProps {
  status: MarketVisibilityStatus
}

export default function MarketVisibilityCard({ status }: MarketVisibilityCardProps) {
  if (status.isVisible) {
    return (
      <div style={{
        padding: `${spacing.sm} ${spacing.md}`,
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: radius.md,
        marginBottom: spacing.sm,
        display: 'flex',
        alignItems: 'baseline',
        gap: spacing.xs,
        flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          color: '#166534',
        }}>
          ✓ Your market is visible to buyers
        </span>
        <span style={{ fontSize: typography.sizes.xs, color: '#15803d' }}>
          {status.vendorsWithBoth} vendor{status.vendorsWithBoth === 1 ? ' is' : 's are'} fully
          set up (published listing + active schedule), which lists your market in the public directory.
        </span>
      </div>
    )
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: '#fffbeb',
      border: '1px solid #fde68a',
      borderRadius: radius.md,
      marginBottom: spacing.sm,
    }}>
      <h2 style={{
        marginTop: 0,
        marginBottom: spacing.xs,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: '#92400e',
      }}>
        Your market isn&apos;t visible to buyers yet
      </h2>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        color: '#92400e',
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        Markets appear in the public directory once at least one vendor has{' '}
        <strong>both</strong> a published listing at your market <strong>and</strong> an
        active attendance schedule. This keeps buyers from finding markets they
        can&apos;t actually order from — so attracting and activating your first
        vendor is the step that puts you on the map.
      </p>
      <div style={{
        display: 'flex',
        gap: spacing.md,
        flexWrap: 'wrap',
        marginBottom: spacing.sm,
      }}>
        {[
          { label: 'With published listings', value: status.vendorsWithListings },
          { label: 'With active schedules', value: status.vendorsWithSchedules },
          { label: 'With both (needed: 1+)', value: status.vendorsWithBoth },
        ].map((item) => (
          <div key={item.label} style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: 'white',
            border: '1px solid #fde68a',
            borderRadius: radius.sm,
          }}>
            <div style={{
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.bold,
              color: '#92400e',
              lineHeight: 1.2,
            }}>
              {item.value}
            </div>
            <div style={{ fontSize: typography.sizes.xs, color: '#a16207' }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
      <p style={{
        margin: 0,
        fontSize: typography.sizes.xs,
        color: '#a16207',
        lineHeight: 1.5,
      }}>
        Use the <a href="#vendors-at-market" style={{ color: '#92400e' }}>vendor tools below</a> to
        invite vendors, then encourage them to publish a listing at your market and set
        their attendance schedule. Until then, expect to do your own outreach — vendors
        and buyers won&apos;t find a market that isn&apos;t live yet.
      </p>
    </div>
  )
}
