import { createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import DashboardCard from '@/components/dashboard/DashboardCard'
import { term } from '@/lib/vertical/terminology'
import { isBeforeSeason } from '@/lib/markets/season-window'
import { tierLabels } from '@/lib/markets/booth-types'

interface BoothOccupancyGridProps {
  marketId: string
  marketTimezone: string | null
  vertical: string
}

interface TierRow {
  id: string
  size_label: string
  dimensions: string | null
  count: number
  weekly_price_cents: number
  // mig 258: the tier's own booth numbers (range or list)
  label_prefix: string | null
  label_start: number | null
  label_end: number | null
  labels: string[] | null
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

interface PendingRentalOccupant extends OccupantBase {
  source: 'weekly_pending'
  vendor_profile_id: string
}

type Occupant = PlaceholderOccupant | OnPlatformOccupant | PaidRentalOccupant | PendingRentalOccupant

/** Rows that take a booth for the week — what the booking RPC counts. A pin
 *  ('on_platform') is a hold, not an occupant. */
function countsAgainstCapacity(occ: Occupant): boolean {
  return occ.source !== 'on_platform'
}

/**
 * Manager-side visual booth occupancy view for the current week.
 *
 * Sources (all unioned in JS, grouped by tier in render):
 *   - market_booth_placeholders (off-platform; always present)
 *   - market_vendors approved=true WITH a booth pin (on-platform; a standing
 *     HOLD at this market, not week-specific). Shown as "Pinned (hold)" and
 *     NOT counted against capacity — a pin is a soft hold the vendor may never
 *     pay for (owner 2026-09-19, BR-6). Approved vendors without a pin are not
 *     drawn: they occupy nothing.
 *   - weekly_booth_rentals status IN (pending_payment, paid) WHERE
 *     week_start_date = the week's SUNDAY — these are the week's real
 *     occupants and the only rows counted, matching the booking RPC's capacity
 *     (placeholders + active rentals per tier).
 *
 * Mig 258 (booth numbering Option U, owner 2026-09-20): each size tier OWNS
 * its numbers, so this card draws EVERY numbered slot per tier — occupied or
 * "free" — instead of only the occupants (design §3.6). A tier with no numbers
 * yet is flagged (not bookable, N-7). An occupant whose number is not one of
 * its tier's numbers (legacy data) is listed under the tier so the manager
 * can re-pick it.
 *
 * Week key (OB-028 review C12, 2026-09-19): rentals are stored against the
 * SUNDAY that starts the week (api/vendor/markets/[id]/book rejects any other
 * day; season enumeration anchors to Sunday). This card used a Monday key, so
 * its paid-rentals query matched NOTHING and no paying vendor ever appeared
 * here unless they also had a pin. Fixed to Sunday.
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
export default async function BoothOccupancyGrid({ marketId, marketTimezone, vertical }: BoothOccupancyGridProps) {
  const tz = marketTimezone || 'America/Chicago'
  const todayLocal = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))

  const serviceClient = createServiceClient()

  // Operating window (season_start/end). When today is before the season
  // starts, anchor the displayed week to the first in-season market week so a
  // seasonal market shows the week that actually holds bookings instead of an
  // empty current week (the paid-rentals query below keys off weekStartStr).
  // NULL = year-round → show the real current week (unchanged behavior).
  const { data: seasonRow } = await serviceClient
    .from('markets')
    .select('season_start, season_end')
    .eq('id', marketId)
    .maybeSingle()
  const seasonStart = (seasonRow?.season_start as string | null) ?? null

  const weekStart = sundayOf(todayLocal)
  if (seasonStart) {
    let guard = 0
    while (isBeforeSeason(formatLocalDate(weekStart), seasonStart) && guard < 520) {
      weekStart.setDate(weekStart.getDate() + 7)
      guard++
    }
  }
  const weekStartStr = formatLocalDate(weekStart)
  // True when we moved off the real current week to the first in-season week —
  // used to label the card "upcoming market week" instead of "this week".
  const anchoredToSeason = weekStartStr !== formatLocalDate(sundayOf(todayLocal))

  const [tiersResult, placeholdersResult, vendorsResult, paidResult] = await Promise.all([
    serviceClient
      .from('market_booth_inventory')
      .select('id, size_label, dimensions, count, weekly_price_cents, label_prefix, label_start, label_end, labels')
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
      .eq('approved', true)
      .not('booth_number', 'is', null),
    serviceClient
      .from('weekly_booth_rentals')
      .select(`
        id, booth_number, inventory_id, vendor_profile_id, status,
        vendor_profiles!weekly_booth_rentals_vendor_profile_id_fkey ( profile_data )
      `)
      .eq('market_id', marketId)
      .eq('week_start_date', weekStartStr)
      .in('status', ['pending_payment', 'paid']),
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

  // Avoid double-counting: when a pinned vendor has an active rental THIS
  // WEEK, prefer the rental row (it carries the exact booth_number for the
  // week and it is the row that occupies capacity).
  const rentingVendorProfileIds = new Set(
    (paidResult.data ?? []).map((r) => r.vendor_profile_id as string)
  )

  const rentalOccupants: Array<PaidRentalOccupant | PendingRentalOccupant> = (paidResult.data ?? []).map((r) => ({
    source: r.status === 'paid' ? ('weekly_paid' as const) : ('weekly_pending' as const),
    booth_number: (r.booth_number as string | null) ?? null,
    name: extractName(r.vendor_profiles),
    inventory_id: (r.inventory_id as string | null) ?? null,
    vendor_profile_id: r.vendor_profile_id as string,
  }))

  const onPlatformFiltered = onPlatformOccupants.filter(
    (v) => !rentingVendorProfileIds.has(v.vendor_profile_id)
  )

  const allOccupants: Occupant[] = [
    ...placeholderOccupants,
    ...onPlatformFiltered,
    ...rentalOccupants,
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

  // Collapses rather than disappearing (owner, 2026-08-08). No tiers means the
  // manager hasn't configured inventory yet — the SETUP flavour, not "waiting":
  // this data never arrives on its own, so the line has to point at the thing
  // they need to do. It names the card by its visible title rather than
  // linking, because that card is two cards up on this same page.
  const noTiersConfigured = tiers.length === 0

  return (
    <DashboardCard
      title={<>{term(vertical, 'booth')} occupancy — {anchoredToSeason ? 'upcoming market week' : 'this week'}:{' '}<span style={{ fontWeight: typography.weights.normal, color: colors.textMuted }}>{formatDisplayDate(weekStart)}</span></>}
      description={`Is there room? Every numbered ${term(vertical, 'booth').toLowerCase()} in each size, ${anchoredToSeason ? 'that week' : 'this week'}: off-platform placeholders and this week's bookings take ${term(vertical, 'booths').toLowerCase()}; a "Held" ${term(vertical, 'vendor').toLowerCase()} has the number reserved but hasn't paid for this week, so it still counts as open; "free" means nobody${anchoredToSeason ? ' (showing the first week of the season, since it hasn’t started yet)' : ''}. To change a booking, use Weekly ${term(vertical, 'booth').toLowerCase()} bookings below; numbers and placeholders have their own cards.`}
      {...(noTiersConfigured ? {
        empty: {
          kind: 'setup' as const,
          message: `Set up your size tiers in "${term(vertical, 'booth')} inventory" above, and this fills in with who is in each ${term(vertical, 'booth').toLowerCase()} each week.`,
        },
      } : {})}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {tiers.map((tier, idx) => {
          const occupants = byTier.get(tier.id) ?? []
          // Holds (pins) are listed but not counted — same arithmetic as the
          // booking RPC, so "N open" here is what a vendor can actually book.
          const filled = occupants.filter(countsAgainstCapacity).length
          const total = tier.count
          const available = Math.max(0, total - filled)
          const isOversub = filled > total
          // Mig 258: the tier's numbered slots. Occupants sit in their slot;
          // legacy occupants whose number is not one of the tier's are listed
          // after the slots so they can be re-picked.
          const slots = tierLabels(tier)
          const slotSet = new Set(slots)
          const bySlot = new Map<string, Occupant[]>()
          const offMap: Occupant[] = []
          for (const occ of occupants) {
            if (occ.booth_number && slotSet.has(occ.booth_number)) {
              const list = bySlot.get(occ.booth_number) ?? []
              list.push(occ)
              bySlot.set(occ.booth_number, list)
            } else {
              offMap.push(occ)
            }
          }

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

              {slots.length === 0 ? (
                // N-7: a size without numbers cannot be booked. Point at the fix.
                <div style={{ fontSize: typography.sizes.sm, color: '#92400e', fontWeight: typography.weights.semibold }}>
                  ⚠ No {term(vertical, 'booth').toLowerCase()} numbers yet — {term(vertical, 'vendors').toLowerCase()} can&apos;t book this size until you set them in {term(vertical, 'booth')} inventory.
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
                  {slots.map((label) => {
                    const here = bySlot.get(label) ?? []
                    if (here.length === 0) {
                      return (
                        <li key={`free-${label}`}>
                          <FreeSlotPill label={label} />
                        </li>
                      )
                    }
                    return here.map((occ, i) => (
                      <li key={`${occ.source}-${label}-${i}`}>
                        <OccupantPill occ={occ} vertical={vertical} />
                      </li>
                    ))
                  })}
                </ul>
              )}
              {offMap.length > 0 && (
                <div style={{ marginTop: spacing.xs }}>
                  <div style={{ fontSize: typography.sizes.xs, color: '#92400e', marginBottom: spacing['3xs'] }}>
                    Not one of this size&apos;s numbers — re-pick the number on the roster / placeholders card:
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: spacing['2xs'] }}>
                    {offMap.slice().sort(sortByBoothNumber).map((occ, i) => (
                      <li key={`off-${occ.source}-${i}-${occ.booth_number ?? ''}`}>
                        <OccupantPill occ={occ} vertical={vertical} />
                      </li>
                    ))}
                  </ul>
                </div>
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
              Added before numbers belonged to sizes. Re-pick each one&apos;s number (roster or placeholders card) and it lands under the right size.
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: spacing['2xs'] }}>
              {unknownTier.sort(sortByBoothNumber).map((occ, idx) => (
                <li key={`unknown-${idx}-${occ.booth_number ?? ''}`}>
                  <OccupantPill occ={occ} vertical={vertical} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DashboardCard>
  )
}

/** An empty numbered slot (mig 258) — the grid shows every booth, not just the taken ones. */
function FreeSlotPill({ label }: { label: string }) {
  return (
    <div style={{
      padding: `${spacing['3xs']} ${spacing.xs}`,
      backgroundColor: 'transparent',
      border: `1px dashed ${colors.border}`,
      borderRadius: radius.sm,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: spacing['2xs'],
      minWidth: 0,
    }}>
      <span style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, color: colors.textMuted }}>#{label}</span>
      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, backgroundColor: '#f0fdf4', color: '#166534', whiteSpace: 'nowrap' }}>free</span>
    </div>
  )
}

function OccupantPill({ occ, vertical }: { occ: Occupant; vertical: string }) {
  // Four sources, four looks: paid (blue) and pending (amber) bookings take the
  // booth this week; a pin (green) is a hold that takes nothing until paid;
  // a placeholder (grey) is an off-platform vendor the manager recorded.
  const badgeBg =
    occ.source === 'weekly_paid'
      ? '#dbeafe'
      : occ.source === 'weekly_pending'
        ? '#fef3c7'
        : occ.source === 'on_platform'
          ? '#dcfce7'
          : '#f3f4f6'
  const badgeColor =
    occ.source === 'weekly_paid'
      ? '#1e40af'
      : occ.source === 'weekly_pending'
        ? '#92400e'
        : occ.source === 'on_platform'
          ? '#166534'
          : '#374151'
  const badgeLabel =
    occ.source === 'weekly_paid'
      ? 'Paid this week'
      : occ.source === 'weekly_pending'
        ? 'Pending payment'
        : occ.source === 'on_platform'
          ? 'Held (not paid)'
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
          {occ.booth_number ? `#${occ.booth_number}` : `no ${term(vertical, 'booth').toLowerCase()} #`}
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

function sundayOf(d: Date): Date {
  // Returns local-time SUNDAY at 00:00 for the week containing d — the same
  // week key weekly_booth_rentals.week_start_date uses (book route requires
  // a Sunday; season enumeration anchors to Sunday; mig 255 covers Sun..Sat).
  // Was mondayOf(): a Monday key never matched a stored rental (C12).
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() - out.getDay())
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
