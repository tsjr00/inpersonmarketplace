import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * PATCH /api/market-manager/[marketId]/branding
 *
 * Updates manager-editable branding text fields on the market record.
 * v1 (A3, 2026-05-16) covers `description` only — logo upload uses
 * /api/market-manager/[marketId]/logo (separate route because multipart).
 *
 * Body:
 *   { description: string | null }    // null clears
 *
 * Auth: caller must be the assigned manager. Mirrors other manager
 * API patterns — createClient → auth.getUser → isMarketManager →
 * service-client write.
 *
 * 1000-char cap on description (matches what the public market profile
 * comfortably renders; longer text gets unwieldy).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/branding', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm-branding:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId } = await params

    crumb.auth('Checking market manager auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))

    // Validate description: null OR non-null string ≤ 1000 chars.
    // Empty string normalized to null (clearing the description).
    let descriptionValue: string | null
    if (body?.description === null || body?.description === undefined) {
      descriptionValue = null
    } else if (typeof body.description === 'string') {
      const trimmed = body.description.trim()
      if (trimmed.length === 0) {
        descriptionValue = null
      } else if (trimmed.length > 1000) {
        throw traced.validation('ERR_VALIDATION_001', 'Description must be 1000 characters or fewer')
      } else {
        descriptionValue = trimmed
      }
    } else {
      throw traced.validation('ERR_VALIDATION_002', 'description must be a string or null')
    }

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { error: updateErr } = await serviceClient
      .from('markets')
      .update({ description: descriptionValue })
      .eq('id', marketId)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, { table: 'markets', operation: 'update' })
    }

    return NextResponse.json({ success: true, description: descriptionValue })
  })
}
