/**
 * Who gets told when a vendor responds to / withdraws from an event.
 *
 * Owner finding 2026-08-28 (do-soon #1): a user holding BOTH admin and
 * organizer roles clicked "taco truck accepted the event invite" and landed
 * on the ADMIN events panel — because the admin copy of the notification
 * (`catering_vendor_responded`, audience admin) went to every admin, and the
 * organizer copy (`event_vendor_responded_organizer`, links to the Organizer
 * Event Dashboard) only fires once `catering_requests.organizer_user_id` is
 * set — which used to happen only when the organizer first opened
 * /event-manager while logged in.
 *
 * Two fixes live here:
 *   1. resolveOrganizerUserId — the durable id, else a lookup by the request's
 *      contact_email against user_profiles (populated at login by
 *      ensure_user_profile, mig 085b); a hit is written back so every later
 *      send is direct. (The intake route also stamps it when the submitter is
 *      logged in with the same email.)
 *   2. vendorResponseRecipients — the organizer id plus the admin ids MINUS the
 *      organizer, so an admin who is also the organizer gets exactly one
 *      notification, and it is the organizer one.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'

export async function resolveOrganizerUserId(
  service: SupabaseClient,
  cateringRequestId: string
): Promise<string | null> {
  const { data: cReq } = await observed(service
    .from('catering_requests')
    .select('id, organizer_user_id, contact_email')
    .eq('id', cateringRequestId)
    .maybeSingle(), { table: 'catering_requests' })
  if (!cReq) return null
  if (cReq.organizer_user_id) return cReq.organizer_user_id as string

  const email = (cReq.contact_email as string | null)?.trim().toLowerCase()
  if (!email) return null
  const { data: profile } = await observed(service
    .from('user_profiles')
    .select('user_id')
    .ilike('email', email)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle(), { table: 'user_profiles' })
  const userId = (profile?.user_id as string | undefined) ?? null
  if (!userId) return null

  // Backfill so the next send (and the organizer-only routes) find it directly.
  await observed(service
    .from('catering_requests')
    .update({ organizer_user_id: userId })
    .eq('id', cateringRequestId)
    .is('organizer_user_id', null), { table: 'catering_requests', operation: 'update' })
  return userId
}

export interface VendorResponseRecipients {
  organizerUserId: string | null
  /** Admins / platform admins to send the ADMIN copy to — never includes the organizer. */
  adminUserIds: string[]
}

export async function vendorResponseRecipients(
  service: SupabaseClient,
  cateringRequestId: string | null
): Promise<VendorResponseRecipients> {
  const organizerUserId = cateringRequestId ? await resolveOrganizerUserId(service, cateringRequestId) : null
  const { data: admins } = await observed(service
    .from('user_profiles')
    .select('user_id')
    .in('role', ['admin', 'platform_admin'])
    .is('deleted_at', null)
    .limit(5), { table: 'user_profiles' })
  const adminUserIds = (admins ?? [])
    .map(a => a.user_id as string)
    .filter(id => id && id !== organizerUserId)
  return { organizerUserId, adminUserIds }
}
