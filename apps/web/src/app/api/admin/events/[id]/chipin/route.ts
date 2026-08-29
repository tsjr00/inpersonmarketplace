import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, observed } from '@/lib/errors'
import { verifyAdminScope } from '@/lib/auth/admin'
import { getActiveBeneficiaries } from '@/lib/cause/beneficiaries'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Community Chip In config for an EVENT. [id] = catering_requests id.
// Chip-in config lives on the event's markets row (set on approval), so the
// event must be approved (market_id present) before it can be configured.
// Auth: verifyAdminScope(event.vertical_id) — platform admins AND the
// vertical's own admins can manage it (events are vertical-scoped).

async function loadEvent(service: ReturnType<typeof createServiceClient>, cateringId: string) {
  const { data } = await observed(service
    .from('catering_requests')
    .select('id, market_id, vertical_id, company_name')
    .eq('id', cateringId)
    .maybeSingle(), { table: 'catering_requests' })
  return data as { id: string; market_id: string | null; vertical_id: string | null; company_name: string | null } | null
}

// GET - current chip-in config + the active beneficiary options for the picker
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]/chipin', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const service = createServiceClient()
    const { id } = await context.params
    const event = await loadEvent(service, id)
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const scope = await verifyAdminScope(event.vertical_id)
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!scope.authorized) {
      return NextResponse.json({ error: "Not authorized for this event's vertical" }, { status: 403 })
    }

    const beneficiaries = (await getActiveBeneficiaries(service)).map((b) => ({ id: b.id, name: b.name }))

    if (!event.market_id) {
      // Not approved yet → no market row to configure. Surface a clear state.
      return NextResponse.json({
        available: false,
        enabled: false,
        beneficiaryId: null,
        beneficiaries,
      })
    }

    const { data: market } = await observed(service
      .from('markets')
      .select('chipin_enabled, chipin_beneficiary_id')
      .eq('id', event.market_id)
      .maybeSingle(), { table: 'markets' })

    return NextResponse.json({
      available: true,
      enabled: !!market?.chipin_enabled,
      beneficiaryId: (market?.chipin_beneficiary_id as string | null) ?? null,
      beneficiaries,
    })
  })
}

// PATCH - set chip-in on/off + beneficiary for the event
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]/chipin', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const service = createServiceClient()
    const { id } = await context.params
    const event = await loadEvent(service, id)
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const scope = await verifyAdminScope(event.vertical_id)
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!scope.authorized) {
      return NextResponse.json({ error: "Not authorized for this event's vertical" }, { status: 403 })
    }
    if (!event.market_id) {
      return NextResponse.json({ error: 'Approve the event before enabling Community Chip In.' }, { status: 400 })
    }

    const body = await request.json()
    const { enabled, beneficiaryId } = body as { enabled?: boolean; beneficiaryId?: string | null }

    // Enabling requires an active beneficiary; verify it exists + is active.
    if (enabled) {
      if (!beneficiaryId) {
        return NextResponse.json({ error: 'Pick a beneficiary to enable Community Chip In.' }, { status: 400 })
      }
      const { data: ben } = await observed(service
        .from('cause_beneficiaries')
        .select('id')
        .eq('id', beneficiaryId)
        .eq('active', true)
        .maybeSingle(), { table: 'cause_beneficiaries' })
      if (!ben) return NextResponse.json({ error: 'Beneficiary not found or inactive' }, { status: 400 })
    }

    const { error } = await service
      .from('markets')
      .update({
        chipin_enabled: !!enabled,
        chipin_beneficiary_id: enabled ? beneficiaryId : null,
      })
      .eq('id', event.market_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, enabled: !!enabled, beneficiaryId: enabled ? beneficiaryId : null })
  })
}
