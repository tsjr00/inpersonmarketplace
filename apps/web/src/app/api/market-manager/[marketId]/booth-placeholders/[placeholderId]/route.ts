import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { validateBoothPlaceholderInput, type BoothPlaceholderRow } from '@/lib/markets/placeholder-types'

/**
 * PATCH /api/market-manager/[marketId]/booth-placeholders/[placeholderId]
 * DELETE /api/market-manager/[marketId]/booth-placeholders/[placeholderId]
 *
 * Edit or remove a single off-platform booth placeholder. PATCH validates
 * input via validateBoothPlaceholderInput(); body shape matches the POST
 * endpoint on the parent route. Auth: assigned manager of the market only.
 *
 * Both endpoints check that the placeholderId actually belongs to the
 * marketId in the URL — guards against id-spoofing across markets.
 *
 * Cross-market inventory_id (PATCH) is caught by the DB trigger
 * trg_booth_placeholder_inventory_market and surfaced as a 400.
 */

async function authorize(
  marketId: string,
  placeholderId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) {
    return { ok: false, response: rateLimitResponse(rateLimitResult) }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 }),
    }
  }

  // Verify the placeholder row belongs to this market
  const serviceClient = createServiceClient()
  const { data: row } = await serviceClient
    .from('market_booth_placeholders')
    .select('id, market_id')
    .eq('id', placeholderId)
    .maybeSingle()

  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Placeholder not found' }, { status: 404 }),
    }
  }
  if (row.market_id !== marketId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Placeholder not in this market' }, { status: 404 }),
    }
  }

  return { ok: true }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; placeholderId: string }> }
) {
  return withErrorTracing(
    '/api/market-manager/[marketId]/booth-placeholders/[placeholderId]',
    'PATCH',
    async () => {
      const { marketId, placeholderId } = await params
      const auth = await authorize(marketId, placeholderId, request)
      if (!auth.ok) return auth.response

      const body = await request.json().catch(() => ({}))
      const input = {
        booth_number: typeof body?.booth_number === 'string' ? body.booth_number.trim() : '',
        inventory_id:
          typeof body?.inventory_id === 'string' && body.inventory_id.trim().length > 0
            ? body.inventory_id.trim()
            : null,
        notes:
          typeof body?.notes === 'string' && body.notes.trim().length > 0
            ? body.notes.trim()
            : null,
      }

      const validationError = validateBoothPlaceholderInput(input)
      if (validationError) {
        throw traced.validation('ERR_VALIDATION_001', validationError)
      }
      // Mig 145 / feedback #4: tier selection is REQUIRED on placeholders.
      if (!input.inventory_id) {
        throw traced.validation(
          'ERR_VALIDATION_002',
          'Booth size tier is required — pick the size this booth belongs to.'
        )
      }

      const serviceClient = createServiceClient()

      // Fetch the current row so we know whether tier is changing
      // (capacity check only needs to run on tier-change INTO a new tier).
      const { data: existing } = await serviceClient
        .from('market_booth_placeholders')
        .select('id, inventory_id')
        .eq('id', placeholderId)
        .maybeSingle()

      // Mig 146 Issue 1: booth_number uniqueness pre-flight.
      const { checkBoothNumberAvailable, checkTierCapacity } = await import('@/lib/markets/booth-conflict-checks')
      const conflict = await checkBoothNumberAvailable(serviceClient, {
        marketId,
        boothNumber: input.booth_number,
        excludeSelf: { kind: 'market_booth_placeholders', id: placeholderId },
      })
      if (conflict) {
        return NextResponse.json({ error: conflict.message }, { status: 409 })
      }

      // Mig 146 Issue 2: tier capacity check. Only run when moving INTO
      // a tier that's different from the current one (no need to re-check
      // if the row stays in its existing tier — already counted).
      if (input.inventory_id && input.inventory_id !== (existing?.inventory_id ?? null)) {
        const cap = await checkTierCapacity(serviceClient, {
          marketId,
          inventoryId: input.inventory_id,
          excludeSelf: { kind: 'market_booth_placeholders', id: placeholderId },
        })
        if (!cap.ok) {
          return NextResponse.json({ error: cap.message }, { status: 409 })
        }
      }

      crumb.supabase('update', 'market_booth_placeholders')
      const { data, error } = await serviceClient
        .from('market_booth_placeholders')
        .update({
          booth_number: input.booth_number,
          inventory_id: input.inventory_id,
          notes: input.notes,
        })
        .eq('id', placeholderId)
        .select('*')
        .single()

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: `Booth "${input.booth_number}" already has a placeholder for this market.` },
            { status: 409 }
          )
        }
        if (error.code === 'P0001' && error.message.includes('does not belong to market')) {
          return NextResponse.json(
            { error: 'Selected booth size tier does not belong to this market.' },
            { status: 400 }
          )
        }
        // Mig 146 booth_number cross-table conflict raised by trigger.
        if (error.code === 'P0005' && error.message.startsWith('BOOTH_CONFLICT')) {
          return NextResponse.json(
            { error: error.message.replace(/^BOOTH_CONFLICT:\s*/, '') },
            { status: 409 }
          )
        }
        throw traced.fromSupabase(error, {
          table: 'market_booth_placeholders',
          operation: 'update',
        })
      }

      return NextResponse.json({ row: data as BoothPlaceholderRow })
    }
  )
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; placeholderId: string }> }
) {
  return withErrorTracing(
    '/api/market-manager/[marketId]/booth-placeholders/[placeholderId]',
    'DELETE',
    async () => {
      const { marketId, placeholderId } = await params
      const auth = await authorize(marketId, placeholderId, request)
      if (!auth.ok) return auth.response

      const serviceClient = createServiceClient()

      crumb.supabase('delete', 'market_booth_placeholders')
      const { error } = await serviceClient
        .from('market_booth_placeholders')
        .delete()
        .eq('id', placeholderId)

      if (error) {
        throw traced.fromSupabase(error, {
          table: 'market_booth_placeholders',
          operation: 'delete',
        })
      }

      return NextResponse.json({ success: true })
    }
  )
}
