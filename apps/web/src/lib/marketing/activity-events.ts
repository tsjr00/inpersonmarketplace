/**
 * Public Activity Events — Social Proof Logger
 *
 * Logs anonymized marketplace activity for the social proof toast.
 * Uses service client (bypasses RLS) — only called from server-side routes.
 * Never throws — marketing is non-critical.
 */

import { createServiceClient } from '@/lib/supabase/server'

interface ActivityEventParams {
  vertical_id: string
  event_type: 'purchase' | 'new_vendor' | 'sold_out' | 'new_listing'
  city?: string
  item_name?: string
  vendor_display_name?: string
  item_category?: string
}

export async function logPublicActivityEvent(params: ActivityEventParams): Promise<void> {
  try {
    const serviceClient = createServiceClient()
    await serviceClient.from('public_activity_events').insert({
      vertical_id: params.vertical_id,
      event_type: params.event_type,
      city: params.city || null,
      item_name: params.item_name || null,
      vendor_display_name: params.vendor_display_name || null,
      item_category: params.item_category || null,
    })
  } catch {
    // Marketing is non-critical — silently fail
  }
}
