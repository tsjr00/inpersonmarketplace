import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'

/**
 * BR-7 (owner 2026-09-19, booth_model_design.md): an ASSIGNED booth number is
 * frozen. A vendor's pin is an assignment while they hold a PAID booking under
 * that number covering today or later. While it exists, the manager cannot
 * change the vendor's pin or tier, and cannot override the number on any of
 * that vendor's paid current/upcoming weeks. The way out is a missed week (no
 * paid current/upcoming booking) or cancelling the paid week (BR-10, part D).
 *
 * Pending (unpaid) weeks are never frozen — the vendor has not paid for them.
 *
 * Returns the last paid week's Sunday under the number when frozen, so the
 * refusal can say "paid through …"; null when not frozen.
 */
export async function boothAssignmentFrozenUntil(
  service: SupabaseClient,
  input: { marketId: string; vendorProfileId: string; boothNumber: string | null },
): Promise<string | null> {
  if (!input.boothNumber) return null
  const weekAgo = new Date()
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6)
  const { data } = await observed(service
    .from('weekly_booth_rentals')
    .select('week_start_date')
    .eq('market_id', input.marketId)
    .eq('vendor_profile_id', input.vendorProfileId)
    .eq('booth_number', input.boothNumber)
    .eq('status', 'paid')
    .gte('week_start_date', weekAgo.toISOString().slice(0, 10))
    .order('week_start_date', { ascending: false })
    .limit(1), { table: 'weekly_booth_rentals' })
  const last = data?.[0]?.week_start_date as string | undefined
  if (!last) return null
  // The week runs Sunday..Saturday — report the Saturday it is paid through.
  const [y, m, d] = last.split('-').map(Number)
  const sat = new Date(Date.UTC(y, m - 1, d + 6))
  return sat.toISOString().slice(0, 10)
}

/** Refusal copy shared by the pin route and the per-week override. */
export function frozenBoothMessage(vendorName: string, boothNumber: string, paidThrough: string): string {
  return `${vendorName} has paid for booth #${boothNumber} through ${paidThrough}. Assigned numbers don't change until a week is missed. ` +
    `To move them now, cancel the paid week (they get a credit), then re-pin.`
}
