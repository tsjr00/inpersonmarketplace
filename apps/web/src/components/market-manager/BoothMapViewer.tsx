import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { isPdfMap } from '@/lib/markets/booth-map'

/**
 * Presentational booth/spot map display (mig 205). Pure markup — no hooks, no
 * server APIs — so it renders in server components (booking forms, vendor
 * bookings view) AND when pulled into the client MarketMapCard.
 *
 * Images render inline (click to open full-size). PDFs render as a "View" link
 * that opens in a new tab — inline PDF embeds are unreliable on mobile.
 */
export default function BoothMapViewer({
  url,
  alt = 'Booth map',
  maxHeight = 360,
}: {
  url: string
  alt?: string
  maxHeight?: number
}) {
  if (isPdfMap(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing.xs,
          padding: `${spacing.sm} ${spacing.md}`,
          backgroundColor: colors.surfaceBase,
          color: colors.primary,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          textDecoration: 'none',
        }}
      >
        <span aria-hidden="true">📄</span> View booth map (PDF)
      </a>
    )
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        style={{
          display: 'block',
          maxWidth: '100%',
          maxHeight,
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          borderRadius: radius.sm,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surfaceBase,
        }}
      />
    </a>
  )
}
