import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import type { OptinStatement } from '@/lib/markets/optin-types'

/**
 * Organizer-side event agreement picker (Events Tier-1, Commit B).
 *
 * GET  /api/events/[token]/agreement — event-eligible catalog + this event's
 *      current selections, for the organizer's picker UI.
 * PUT  /api/events/[token]/agreement — replace this event's selected
 *      statements. Body: { statement_ids: string[] }.
 *
 * The organizer picks from the event-eligible catalog (mig 189: rows with
 * event_eligible = true, scoped to universal OR the event's vertical). The
 * chosen statements are written to `market_optin_selections` keyed to the
 * event's market_id — the SAME table markets use — so the vendor-facing read
 * path (optin-public → MarketAgreementBlock) and the acceptance snapshot work
 * unchanged. Event statements have no placeholders, so selections store empty
 * placeholder_values.
 *
 * Auth: the event's organizer (catering_requests.organizer_user_id === user.id).
 * Mirrors the broadcast route's organizer gate.
 */

async function resolveOrganizerEvent(token: string) {
  const serviceClient = createServiceClient()
  crumb.supabase('select', 'catering_requests')
  const { data: evt } = await observed(serviceClient
    .from('catering_requests')
    .select('id, organizer_user_id, market_id, vertical_id')
    .eq('event_token', token)
    .maybeSingle(), { table: 'catering_requests' })
  return { serviceClient, evt }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/agreement', 'GET', async () => {
    const { token } = await params

    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`event-agreement:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { serviceClient, evt } = await resolveOrganizerEvent(token)
    if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (evt.organizer_user_id !== user.id) {
      return NextResponse.json({ error: 'Not the organizer of this event' }, { status: 403 })
    }
    const marketId = evt.market_id as string | null
    const vertical = (evt.vertical_id as string | undefined) || 'farmers_market'

    // Event-eligible catalog, scoped to universal + this event's vertical.
    crumb.supabase('select', 'market_optin_statement_catalog')
    const { data: catalog, error: catErr } = await serviceClient
      .from('market_optin_statement_catalog')
      .select('id, category, statement, placeholders, active, sort_order')
      .eq('active', true)
      .eq('event_eligible', true)
      .or(`vertical_id.is.null,vertical_id.eq.${vertical}`)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    if (catErr) {
      throw traced.fromSupabase(catErr, { table: 'market_optin_statement_catalog', operation: 'select' })
    }

    // Current selections for this event (only exist once the event has a market).
    let selected: string[] = []
    if (marketId) {
      crumb.supabase('select', 'market_optin_selections')
      const { data: sels, error: selErr } = await serviceClient
        .from('market_optin_selections')
        .select('statement_id')
        .eq('market_id', marketId)
      if (selErr) {
        throw traced.fromSupabase(selErr, { table: 'market_optin_selections', operation: 'select' })
      }
      selected = (sels ?? []).map((s) => s.statement_id as string)
    }

    return NextResponse.json({
      catalog: (catalog ?? []) as OptinStatement[],
      selected,
      hasMarket: !!marketId,
    })
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/agreement', 'PUT', async () => {
    const { token } = await params

    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`event-agreement:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { serviceClient, evt } = await resolveOrganizerEvent(token)
    if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (evt.organizer_user_id !== user.id) {
      return NextResponse.json({ error: 'Not the organizer of this event' }, { status: 403 })
    }
    const marketId = evt.market_id as string | null
    if (!marketId) {
      return NextResponse.json(
        { error: 'This event is not active yet — you can set the vendor agreement once it is approved.' },
        { status: 409 }
      )
    }
    const vertical = (evt.vertical_id as string | undefined) || 'farmers_market'

    const body = await request.json().catch(() => ({}))
    const rawIds = Array.isArray(body?.statement_ids) ? body.statement_ids : null
    if (rawIds === null) {
      throw traced.validation('ERR_VALIDATION_001', 'statement_ids must be an array')
    }

    // Shape + dedupe.
    const seen = new Set<string>()
    const ids: string[] = []
    for (const raw of rawIds) {
      if (typeof raw !== 'string') continue
      const id = raw.trim()
      if (id.length === 0 || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }

    // Validate every id is an event-eligible statement in this event's scope —
    // an organizer can't smuggle in a market/park statement or an out-of-vertical
    // one via a crafted request.
    if (ids.length > 0) {
      crumb.supabase('select', 'market_optin_statement_catalog')
      const { data: catalogRows, error: catErr } = await serviceClient
        .from('market_optin_statement_catalog')
        .select('id')
        .eq('active', true)
        .eq('event_eligible', true)
        .or(`vertical_id.is.null,vertical_id.eq.${vertical}`)
        .in('id', ids)
      if (catErr) {
        throw traced.fromSupabase(catErr, { table: 'market_optin_statement_catalog', operation: 'select' })
      }
      const validIds = new Set((catalogRows ?? []).map((r) => r.id as string))
      const invalid = ids.filter((id) => !validIds.has(id))
      if (invalid.length > 0) {
        throw traced.validation('ERR_VALIDATION_002', `Unknown or ineligible statement IDs: ${invalid.join(', ')}`)
      }
    }

    // Atomic replace via mig 143 RPC (delete-all + insert-all in one txn).
    // Event statements carry no placeholders → empty placeholder_values.
    crumb.supabase('rpc', 'replace_market_optin_selections')
    const { error: rpcErr } = await serviceClient.rpc('replace_market_optin_selections', {
      p_market_id: marketId,
      p_selections: ids.map((statement_id) => ({ statement_id, placeholder_values: {} })),
    })
    if (rpcErr) {
      throw traced.fromSupabase(rpcErr, { table: 'market_optin_selections', operation: 'rpc' })
    }

    return NextResponse.json({ success: true, selected: ids })
  })
}
