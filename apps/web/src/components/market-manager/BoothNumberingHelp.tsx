import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'

/**
 * THE one helper paragraph about booth numbers (booth_numbering_design.md
 * §3.7, N-8). Rendered verbatim on the four cards where a number is set or
 * shown — Booth inventory, the roster, placeholders, weekly bookings — so the
 * manager reads one story everywhere. Before this, four cards carried copy
 * written in four different eras ("we auto-assign" · "assign on the roster" ·
 * "a pin is a hold" · "payment makes it yours").
 *
 * `tiers` is the market's map ("Small A1–A4 · Medium B1–B3"); pass [] when the
 * caller does not have it and the sentence falls back to the generic form.
 */
export default function BoothNumberingHelp({
  vertical,
  tiers,
  compact = false,
}: {
  vertical: string
  tiers: Array<{ size_label: string; description: string }>
  compact?: boolean
}) {
  const booth = term(vertical, 'booth').toLowerCase()
  const vendor = term(vertical, 'vendor').toLowerCase()
  const numbered = tiers.filter((t) => t.description)
  const unnumbered = tiers.filter((t) => !t.description)
  const map = numbered.map((t) => `${t.size_label} ${t.description}`).join(' · ')

  return (
    <div style={{
      padding: compact ? spacing.xs : spacing.sm,
      backgroundColor: '#f8fafc',
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      fontSize: typography.sizes.xs,
      color: colors.textSecondary,
      lineHeight: 1.5,
    }}>
      <strong style={{ color: colors.textPrimary }}>How {booth} numbers work here.</strong>{' '}
      Every {booth} has a number and a size{map ? <> — <span style={{ color: colors.textPrimary }}>{map}</span></> : ''}.
      When a {vendor} books, they get their held number if you gave them one, otherwise the lowest free number in the
      size they booked. Paying for a week makes that number theirs until they miss a week. You hold a number for a
      {' '}{vendor} from the roster; you record {booth}s rented off the platform as placeholders; both take that number
      out of circulation. Numbers only change for unpaid weeks, or if you cancel a paid week.
      {unnumbered.length > 0 && (
        <span style={{ color: '#92400e' }}>
          {' '}⚠ {unnumbered.map((t) => t.size_label).join(', ')} {unnumbered.length === 1 ? 'has' : 'have'} no {booth} numbers yet — {vendor}s can&apos;t book {unnumbered.length === 1 ? 'that size' : 'those sizes'} until you set them in {term(vertical, 'booth')} inventory.
        </span>
      )}
    </div>
  )
}
