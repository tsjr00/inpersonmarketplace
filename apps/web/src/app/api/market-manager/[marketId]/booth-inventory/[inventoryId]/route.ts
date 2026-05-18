import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { validateBoothInventoryInput, type BoothInventoryRow } from '@/lib/markets/booth-types'

/**
 * PATCH /api/market-manager/[marketId]/booth-inventory/[inventoryId]
 * DELETE /api/market-manager/[marketId]/booth-inventory/[inventoryId]
 *
 * Edit or remove a single booth size tier. PATCH validates input via
 * validateBoothInventoryInput(); body shape matches the POST endpoint
 * on the parent route. Auth: assigned manager of the market only.
 *
 * Both endpoints check that the inventoryId actually belongs to the
 * marketId in the URL — guards against id-spoofing across markets.
 */

async function authorize(
  marketId: string,
  inventoryId: string,
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

  // Verify the inventory row belongs to this market
  const serviceClient = createServiceClient()
  const { data: row } = await serviceClient
    .from('market_booth_inventory')
    .select('id, market_id')
    .eq('id', inventoryId)
    .maybeSingle()

  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Inventory row not found' }, { status: 404 }),
    }
  }
  if (row.market_id !== marketId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Inventory row not in this market' }, { status: 404 }),
    }
  }

  return { ok: true }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; inventoryId: string }> }
) {
  return withErrorTracing(
    '/api/market-manager/[marketId]/booth-inventory/[inventoryId]',
    'PATCH',
    async () => {
      const { marketId, inventoryId } = await params
      const auth = await authorize(marketId, inventoryId, request)
      if (!auth.ok) return auth.response

      const body = await request.json().catch(() => ({}))
      const input = {
        size_label: typeof body?.size_label === 'string' ? body.size_label.trim() : '',
        dimensions:
          typeof body?.dimensions === 'string' && body.dimensions.trim().length > 0
            ? body.dimensions.trim()
            : null,
        count: Number(body?.count),
        weekly_price_cents: Number(body?.weekly_price_cents),
      }

      const validationError = validateBoothInventoryInput(input)
      if (validationError) {
        throw traced.validation('ERR_VALIDATION_001', validationError)
      }

      const serviceClient = createServiceClient()

      crumb.supabase('update', 'market_booth_inventory')
      const { data, error } = await serviceClient
        .from('market_booth_inventory')
        .update({
          size_label: input.size_label,
          dimensions: input.dimensions,
          count: input.count,
          weekly_price_cents: input.weekly_price_cents,
        })
        .eq('id', inventoryId)
        .select('*')
        .single()

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: `A "${input.size_label}" tier already exists for this market.` },
            { status: 409 }
          )
        }
        throw traced.fromSupabase(error, {
          table: 'market_booth_inventory',
          operation: 'update',
        })
      }

      return NextResponse.json({ row: data as BoothInventoryRow })
    }
  )
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; inventoryId: string }> }
) {
  return withErrorTracing(
    '/api/market-manager/[marketId]/booth-inventory/[inventoryId]',
    'DELETE',
    async () => {
      const { marketId, inventoryId } = await params
      const auth = await authorize(marketId, inventoryId, request)
      if (!auth.ok) return auth.response

      const serviceClient = createServiceClient()

      crumb.supabase('delete', 'market_booth_inventory')
      const { error } = await serviceClient
        .from('market_booth_inventory')
        .delete()
        .eq('id', inventoryId)

      if (error) {
        // FK violation from weekly_booth_rentals.inventory_id (ON DELETE
        // RESTRICT, mig 139). Translate to a friendly 409 so the manager
        // sees a useful message instead of a generic "Delete failed".
        // Placeholders link via ON DELETE SET NULL, so they never trigger
        // this branch.
        if (error.code === '23503') {
          return NextResponse.json(
            {
              error: 'This booth size has active bookings. Cancel or wait for them to complete before removing the tier.',
            },
            { status: 409 }
          )
        }
        throw traced.fromSupabase(error, {
          table: 'market_booth_inventory',
          operation: 'delete',
        })
      }

      return NextResponse.json({ success: true })
    }
  )
}
