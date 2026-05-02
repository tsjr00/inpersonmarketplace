/**
 * Wave Generation — Creates time-slot waves for event ordering.
 *
 * Called when an event transitions to 'ready' status (all vendors confirmed).
 * Generates waves based on the event's service window and accepted vendor capacity.
 *
 * Uses service client (bypasses RLS) since this is an admin/system action.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

interface GenerateWavesInput {
  marketId: string
  eventStartTime: string   // HH:MM:SS or HH:MM format
  eventEndTime: string     // HH:MM:SS or HH:MM format
  waveDurationMinutes?: number  // default 30
}

interface GenerateWavesResult {
  success: boolean
  wavesCreated: number
  capacityPerWave: number
  error?: string
}

/**
 * Parse a time string (HH:MM or HH:MM:SS) into total minutes from midnight.
 */
function parseTimeToMinutes(time: string): number {
  const parts = time.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

/**
 * Format minutes from midnight back to HH:MM:SS for database storage.
 */
function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}:00`
}

/**
 * Generate waves for an event market.
 *
 * 1. Calculates wave count from service window and duration
 * 2. Sums accepted vendor capacity (event_max_orders_per_wave) for per-wave capacity
 * 3. Creates event_waves rows
 * 4. Updates market with wave_ordering_enabled = true
 *
 * Idempotent: if waves already exist for this market, returns early with error.
 */
export async function generateEventWaves(
  serviceClient: SupabaseClient,
  input: GenerateWavesInput
): Promise<GenerateWavesResult> {
  const { marketId, eventStartTime, eventEndTime, waveDurationMinutes = 30 } = input

  // Check if waves already exist
  const { count: existingCount } = await serviceClient
    .from('event_waves')
    .select('id', { count: 'exact', head: true })
    .eq('market_id', marketId)

  if (existingCount && existingCount > 0) {
    return {
      success: false,
      wavesCreated: 0,
      capacityPerWave: 0,
      error: 'Waves already generated for this event. Delete existing waves first to regenerate.',
    }
  }

  // Calculate wave count
  const startMinutes = parseTimeToMinutes(eventStartTime)
  const endMinutes = parseTimeToMinutes(eventEndTime)

  if (endMinutes <= startMinutes) {
    return {
      success: false,
      wavesCreated: 0,
      capacityPerWave: 0,
      error: 'Event end time must be after start time.',
    }
  }

  const totalMinutes = endMinutes - startMinutes
  const waveCount = Math.ceil(totalMinutes / waveDurationMinutes)

  // Get accepted vendor capacity
  const { data: acceptedVendors, error: vendorError } = await serviceClient
    .from('market_vendors')
    .select('vendor_profile_id, event_max_orders_per_wave')
    .eq('market_id', marketId)
    .eq('response_status', 'accepted')

  if (vendorError) {
    return {
      success: false,
      wavesCreated: 0,
      capacityPerWave: 0,
      error: `Failed to fetch accepted vendors: ${vendorError.message}`,
    }
  }

  if (!acceptedVendors || acceptedVendors.length === 0) {
    return {
      success: false,
      wavesCreated: 0,
      capacityPerWave: 0,
      error: 'No accepted vendors found. Vendors must accept before waves can be generated.',
    }
  }

  // Hard-error if any accepted vendor lacks per-wave capacity. Per
  // session 76 audit (D1) — silent fallbacks mask incomplete vendor onboarding
  // and risk over- or under-promising buyer slots. Capacity validation lives
  // in vendor/events/[marketId]/respond at acceptance time (FT only); this
  // is the defensive backstop if data ever sneaks through, OR if wave
  // generation is mistakenly triggered for an FM event (FM doesn't use waves).
  const vendorsMissingCapacity = acceptedVendors
    .filter(v => !v.event_max_orders_per_wave || v.event_max_orders_per_wave < 1)
    .map(v => v.vendor_profile_id as string)
  if (vendorsMissingCapacity.length > 0) {
    return {
      success: false,
      wavesCreated: 0,
      capacityPerWave: 0,
      error: `Cannot generate waves — ${vendorsMissingCapacity.length} accepted vendor(s) have not declared per-wave capacity. Vendor profile IDs: ${vendorsMissingCapacity.join(', ')}. This usually means a non-FT vendor was invited to a wave-using event, or vendor onboarding is incomplete.`,
    }
  }
  const capacityPerWave = acceptedVendors.reduce((sum, v) => sum + (v.event_max_orders_per_wave as number), 0)

  // Build wave rows
  const waves = []
  for (let i = 0; i < waveCount; i++) {
    const waveStartMinutes = startMinutes + (i * waveDurationMinutes)
    const waveEndMinutes = Math.min(waveStartMinutes + waveDurationMinutes, endMinutes)

    waves.push({
      market_id: marketId,
      wave_number: i + 1,
      start_time: minutesToTimeString(waveStartMinutes),
      end_time: minutesToTimeString(waveEndMinutes),
      capacity: capacityPerWave,
      reserved_count: 0,
      status: 'open',
    })
  }

  // Insert waves
  const { error: insertError } = await serviceClient
    .from('event_waves')
    .insert(waves)

  if (insertError) {
    return {
      success: false,
      wavesCreated: 0,
      capacityPerWave: 0,
      error: `Failed to create waves: ${insertError.message}`,
    }
  }

  // Enable wave ordering on the market
  await serviceClient
    .from('markets')
    .update({ wave_ordering_enabled: true, wave_duration_minutes: waveDurationMinutes })
    .eq('id', marketId)

  return {
    success: true,
    wavesCreated: waveCount,
    capacityPerWave,
  }
}
