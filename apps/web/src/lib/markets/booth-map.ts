import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tolerant read of markets.booth_map_url (mig 205).
 *
 * Returns null if the column does not exist yet (pre-migration-205) or on any
 * error — a SEPARATE select from the surface's main market query, so every place
 * that shows the booth map (manager dashboard, FM/FT booking forms, vendor
 * bookings view) renders even before the migration applies. Mirrors the
 * pre-migration-safe pattern used for markets.required_docs_note (mig 192).
 */
export async function getBoothMapUrl(client: SupabaseClient, marketId: string): Promise<string | null> {
  const { data, error } = await client
    .from('markets')
    .select('booth_map_url')
    .eq('id', marketId)
    .maybeSingle()
  if (error || !data) return null
  return (data.booth_map_url as string | null) ?? null
}

/** True when a booth-map URL points at a PDF (rendered as a link) vs an image. */
export function isPdfMap(url: string): boolean {
  return url.split('?')[0].toLowerCase().endsWith('.pdf')
}
