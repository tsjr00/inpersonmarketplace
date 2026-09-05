import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { formatPrice } from '@/lib/pricing'
import { t } from '@/lib/locale/messages'

/**
 * Buyer-facing bundle cards on the public market page (mig 244).
 *
 * Copy follows the 5-pillar template (backlog marketing entry, owner
 * 2026-09-05): ① curator line ② NAMED makers with vendor profile links
 * ③ quality/scarcity ("only N left") ④ pickup line ⑤ cause line (B2).
 * Prices come from lib/bundles/core.ts via the server page — the same
 * function checkout charges with.
 *
 * Server component — the parent page queries active bundles (service
 * client; market_bundles is service-only RLS) and passes display props.
 */

export interface BundleCardData {
  id: string
  name: string
  description: string | null
  displayPriceCents: number
  remaining: number
  pickupMarketDate: string
  pickupNotes: string | null
  causeName: string | null
  causePct: number | null
  makers: Array<{ vendorProfileId: string; vendorName: string }>
  available: boolean
}

interface MarketBundlesSectionProps {
  vertical: string
  marketName: string
  bundles: BundleCardData[]
  locale?: string
}

export default function MarketBundlesSection({ vertical, marketName, bundles, locale = 'en' }: MarketBundlesSectionProps) {
  if (bundles.length === 0) return null

  return (
    <section style={{ marginBottom: spacing.lg }}>
      <h2 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary, margin: `0 0 ${spacing.xs}` }}>
        🧺 {t('bundle.section_title', locale)}
      </h2>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing.sm}` }}>
        {t('bundle.section_sub', locale, { market: marketName })}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing.sm }}>
        {bundles.map(b => (
          <div key={b.id} style={{ padding: spacing.md, backgroundColor: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.md, boxShadow: shadows.sm, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.xs }}>
              <span style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: colors.textPrimary }}>{b.name}</span>
              <span style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: colors.primary, whiteSpace: 'nowrap' }}>
                {formatPrice(b.displayPriceCents)}
              </span>
            </div>

            {b.description && (
              <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, lineHeight: 1.5 }}>{b.description}</div>
            )}

            {/* ② Named makers */}
            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
              {t('bundle.made_by', locale)}{' '}
              {b.makers.map((m, i) => (
                <span key={m.vendorProfileId}>
                  {i > 0 && (i === b.makers.length - 1 ? ' & ' : ', ')}
                  <Link href={`/${vertical}/vendor/${m.vendorProfileId}`} style={{ color: colors.primary, textDecoration: 'none' }}>
                    {m.vendorName}
                  </Link>
                </span>
              ))}
            </div>

            {/* ③ Scarcity + ④ pickup + ⑤ cause */}
            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
              {b.remaining <= 5 ? <strong style={{ color: '#b45309' }}>{t('bundle.only_n_left', locale, { n: String(b.remaining) })} · </strong> : null}
              {t('bundle.pickup_on', locale, { date: b.pickupMarketDate })}{b.pickupNotes ? ` — ${b.pickupNotes}` : ` ${t('bundle.pickup_at_market', locale)}`}
              {b.causeName && b.causePct ? <> · 🤝 {t('bundle.supports', locale, { org: b.causeName })}</> : null}
            </div>

            {b.available ? (
              <Link
                href={`/${vertical}/checkout?bundle=${b.id}`}
                style={{
                  marginTop: 'auto',
                  display: 'block',
                  textAlign: 'center',
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: colors.primary,
                  color: 'white',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  textDecoration: 'none',
                }}
              >
                {t('bundle.buy', locale)}
              </Link>
            ) : (
              <div style={{ marginTop: 'auto', textAlign: 'center', padding: `${spacing.xs} ${spacing.md}`, backgroundColor: colors.surfaceBase, color: colors.textMuted, borderRadius: radius.sm, fontSize: typography.sizes.sm }}>
                {b.remaining === 0 ? t('bundle.sold_out', locale) : t('bundle.ordering_closed', locale)}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
