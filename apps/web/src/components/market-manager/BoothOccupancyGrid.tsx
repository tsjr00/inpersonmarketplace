import { createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface BoothOccupancyGridProps {
  marketId: string
  marketTimezone: string | null
}

interface TierRow {
  id: string
  size_label: string
  dimensions: string | null
  count: number
  weekly_price_cents: number
}

interface OccupantBase {
  booth_number: string | null
  name: string
  inventory_id: string | null
}

interface PlaceholderOccupant extends OccupantBase {
  source: 'placeholder'
}

interface OnPlatformOccupant extends OccupantBase {
  source: 'on_platform'
  vendor_profile_id: string
}

interface PaidRentalOccupant extends OccupantBase {
  source: 'weekly_paid'
  vendor_profile_id: string
}

type Occupant = PlaceholderOccupant | OnPlatformOccupant | PaidRentalOccupant

/**
 * Manager-side visual booth occupancy view for the current week.
 *
 * Sources (all unioned in JS, grouped by tier in render):
 *   - market_booth_placeholders (off-platform; always present)
 *   - market_vendors approved=true (on-platform; always present at this
 *     market, not week-specific)
 *   - weekly_booth_rentals status='paid' WHERE week_start_date = current
 *     week start (this-week additions on top of permanent occupants)
 *
 * Why server component: read-only snapshot, no interactivity beyond
 * navigation. RLS is default-deny on manager-scoped tables; we use
 * service client. Auth is enforced upstream by isMarketManager() on the
 * dashboard page before this component is rendered.
 *
 * Limitations (v1):
 *   - Doesn't show empty named slots (we know the tier count but not
 *     "which specific booth numbers exist in the tier"). Booth label
 *     range + auto-assignment fill the named slots for paid rentals;
 *     for placeholders + on-platform vendors the manager named them
 *     manually.
 *   - Unknown-tier section catches occupants whose inventory_id is
 *     NULL (legacy data). Manager fixes by setting tier in the
 *     respective management card.
 */
export default async function BoothOccupancyGrid({ marketId, marketTimezone }: BoothOccupancyGridProps) {
  const tz = marketTimezone || 'America/Chicago'
  const todayLocal = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const weekStart = mondayOf(todayLocal)
  const weekStartStr = formatLocalDate(weekStart)

  const serviceClient = createServiceClient()

  const [tiersResult, placeholdersResult, vendorsResult, paidResult] = await Promise.all([
    serviceClient
      .from('market_booth_inventory')
      .select('id, size_label, dimensions, count, weekly_price_cents')
      .eq('market_id', marketId)
      .order('size_label', { ascending: true }),
    serviceClient
      .from('market_booth_placeholders')
      .select('id, booth_number, notes, inventory_id')
      .eq('market_id', marketId),
    serviceClient
      .from('market_vendors')
      .select(`
        id, booth_number, inventory_id, vendor_profile_id,
        vendor_profiles!market_vendors_vendor_profile_id_fkey ( profile_data )
      `)
      .eq('market_id', marketId)
      .eq('approved', true),
    serviceClient
      .from('weekly_booth_rentals')
      .select(`
        id, booth_number, inventory_id, vendor_profile_id,
        vendor_profiles!weekly_booth_rentals_vendor_profile_id_fkey ( profile_data )
      `)
      .eq('market_id', marketId)
      .eq('week_start_date', weekStartStr)
      .eq('status', 'paid'),
  ])

  const tiers: TierRow[] = (tiersResult.data ?? []) as TierRow[]
  const placeholderOccupants: PlaceholderOccupant[] = (placeholdersResult.data ?? []).map(
    (p) => ({
      source: 'placeholder' as const,
      booth_number: (p.booth_number as string | null) ?? null,
      name: (p.notes as string | null)?.trim() || '(off-platform)',
      inventory_id: (p.inventory_id as string | null) ?? null,
    })
  )

  const extractName = (vp: unknown): string => {
    const arr = Array.isArray(vp) ? vp[0] : vp
    const data = (arr as { profile_data?: Record<string, unknown> })?.profile_data
    return (
      (data?.business_name as string) ||
      (data?.farm_name as string) ||
      'Unknown vendor'
    )
  }

  const onPlatformOccupants: OnPlatformOccupant[] = (vendorsResult.data ?? []).map((v) => ({
    source: 'on_platform' as const,
    booth_number: (v.booth_number as string | null) ?? null,
    name: extractName(v.vendor_profiles),
    inventory_id: (v.inventory_id as string | null) ?? null,
    vendor_profile_id: v.vendor_profile_id as string,
  }))

  // Avoid double-counting: when an on-platform vendor has a paid
  // rental THIS WEEK, prefer the rental row (it carries the exact
  // booth_number assigned by auto-assignment for the week).
  const paidVendorProfileIds = new Set(
    (paidResult.data ?? []).map((r) => r.vendor_profile_id as string)
  )

  const paidOccupants: PaidRentalOccupant[] = (paidResult.data ?? []).map((r) => ({
    source: 'weekly_paid' as const,
    booth_number: (r.booth_number as string | null) ?? null,
    name: extractName(r.vendor_profiles),
    inventory_id: (r.inventory_id as string | null) ?? null,
    vendor_profile_id: r.vendor_profile_id as string,
  }))

  const onPlatformFiltered = onPlatformOccupants.filter(
    (v) => !paidVendorProfileIds.has(v.vendor_profile_id)
  )

  const allOccupants: Occupant[] = [
    ...placeholderOccupants,
    ...onPlatformFiltered,
    ...paidOccupants,
  ]

  // Group occupants by inventory_id (null bucket = unknown tier)
  const byTier = new Map<string, Occupant[]>()
  const unknownTier: Occupant[] = []
  for (const occ of allOccupants) {
    if (occ.inventory_id === null) {
      unknownTier.push(occ)
    } else {
      const list = byTier.get(occ.inventory_id) ?? []
      list.push(occ)
      byTier.set(occ.inventory_id, list)
    }
  }

  if (tiers.length === 0) {
    return null
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    }}>
      <h2 style={{
        margin: 0,
        marginBottom: spacing.xs,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        {/* Date inline after the heading per Session 84 testing —
            previously the "Week of <date>" floated to the far right in
            small muted text and managers missed it. */}
        Booth occupancy — this week:{' '}
        <span style={{ fontWeight: typography.weights.normal, color: colors.textMuted }}>
          {formatDisplayDate(weekStart)}
        </span>
      </h2>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        fontSize: typography.sizes.sm,
        color: colors.textMuted,
        lineHeight: 1.5,
      }}>
        Per-tier view of who&apos;s at the market this week — combines
        off-platform placeholders, on-platform vendors, and paid weekly
        bookings. Manage each source from the cards below.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {tiers.map((tier, idx) => {
          const occupants = byTier.get(tier.id) ?? []
          const filled = occupants.length
          const total = tier.count
          const available = Math.max(0, total - filled)
          const isOversub = filled > total

          return (
            <div
              key={tier.id}
              style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceBase,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs }}>
                <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.base, color: colors.textPrimary }}>
                  {/* "Tier N: <size_label>" prefix makes it obvious the
                      cards group by tier, not by individual booth — the
                      first revision showed only `size_label` and managers
                      read the card as "a list of booths" instead of
                      "the small tier, the medium tier, etc." Session 84. */}
                  <span style={{ color: colors.textMuted, fontWeight: typography.weights.normal }}>Tier {idx + 1}:</span>{' '}
                  {tier.size_label}
                  {tier.dimensions && (
                    <span style={{ marginLeft: spacing['2xs'], color: colors.textMuted, fontSize: typography.sizes.sm, fontWeight: typography.weights.normal }}>
                      {tier.dimensions}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: typography.sizes.sm,
                  color: isOversub ? '#b91c1c' : colors.textMuted,
                  fontWeight: isOversub ? typography.weights.semibold : typography.weights.normal,
                }}>
                  {filled} of {total} occupied
                  {isOversub && ' ⚠️ over capacity'}
                  {!isOversub && available > 0 && ` · ${available} open`}
                </div>
              </div>

              {occupants.length === 0 ? (
                <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
                  No occupants yet — vendors can book this tier.
                </div>
              ) : (
                <ul style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: spacing['2xs'],
                }}>
                  {occupants
                    .slice()
                    .sort(sortByBoothNumber)
                    .map((occ, idx) => (
                      <li key={`${occ.source}-${idx}-${occ.booth_number ?? ''}`}>
                        <OccupantPill occ={occ} />
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )
        })}

        {unknownTier.length > 0 && (
          <div style={{
            padding: spacing.sm,
            backgroundColor: '#fff7e6',
            border: '1px solid #ffd57a',
            borderRadius: radius.sm,
            color: '#664d03',
          }}>
            <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing['3xs'] }}>
              ⚠️ {unknownTier.length} occupant{unknownTier.length === 1 ? '' : 's'} without a size tier set
            </div>
            <div style={{ fontSize: typography.sizes.xs, marginBottom: spacing['2xs'] }}>
              Tier wasn&apos;t set when they were added. Set it in the relevant card below so they show up under the right size.
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: spacing['2xs'] }}>
              {unknownTier.sort(sortByBoothNumber).map((occ, idx) => (
                <li key={`unknown-${idx}-${occ.booth_number ?? ''}`}>
                  <OccupantPill occ={occ} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function OccupantPill({ occ }: { occ: Occupant }) {
  const badgeBg =
    occ.source === 'weekly_paid'
      ? '#dbeafe'
      : occ.source === 'on_platform'
        ? '#dcfce7'
        : '#f3f4f6'
  const badgeColor =
    occ.source === 'weekly_paid'
      ? '#1e40af'
      : occ.source === 'on_platform'
        ? '#166534'
        : '#374151'
  const badgeLabel =
    occ.source === 'weekly_paid'
      ? 'Paid this week'
      : occ.source === 'on_platform'
        ? 'On platform'
        : 'Off platform'

  return (
    <div style={{
      padding: `${spacing['3xs']} ${spacing.xs}`,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing['2xs'] }}>
        <span style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {occ.booth_number ? `#${occ.booth_number}` : 'no booth #'}
        </span>
        <span style={{
          fontSize: 10,
          padding: '1px 6px',
          borderRadius: 999,
          backgroundColor: badgeBg,
          color: badgeColor,
          whiteSpace: 'nowrap',
        }}>
          {badgeLabel}
        </span>
      </div>
      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {occ.name}
      </div>
    </div>
  )
}

function sortByBoothNumber(a: Occupant, b: Occupant): number {
  // Numeric portion ascending; null booth_numbers last
  if (a.booth_number === null && b.booth_number === null) return 0
  if (a.booth_number === null) return 1
  if (b.booth_number === null) return -1
  const an = parseInt(a.booth_number.replace(/\D/g, ''), 10)
  const bn = parseInt(b.booth_number.replace(/\D/g, ''), 10)
  if (Number.isNaN(an) && Number.isNaN(bn)) {
    return a.booth_number.localeCompare(b.booth_number)
  }
  if (Number.isNaN(an)) return 1
  if (Number.isNaN(bn)) return -1
  return an - bn
}

function mondayOf(d: Date): Date {
  // Returns local-time Monday at 00:00 for the week containing d.
  // Sunday is treated as the END of the previous week (Monday = week start).
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = out.getDay()
  const offset = day === 0 ? -6 : 1 - day
  out.setDate(out.getDate() + offset)
  return out
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
