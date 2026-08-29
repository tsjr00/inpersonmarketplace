import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, observed } from '@/lib/errors'
import { hasPlatformAdminRole } from '@/lib/auth/admin'

// Round-Up campaigns (Feature B) — always-on partner windows. Platform-level.

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: profile } = await observed(supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single(), { table: 'user_profiles' })
  if (!hasPlatformAdminRole(profile || {})) {
    return { error: NextResponse.json({ error: 'Platform admin access required' }, { status: 403 }) }
  }
  return { service: createServiceClient() }
}

// GET - list campaigns with beneficiary names
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/cause/campaigns', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service

    const { data, error } = await service
      .from('cause_campaigns')
      .select('id, beneficiary_id, name, starts_at, ends_at, vertical_id, market_ids, round_up_enabled, active, created_at, cause_beneficiaries!cause_campaigns_beneficiary_id_fkey ( name )')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })

    const campaigns = (data ?? []).map((c) => {
      const ben = Array.isArray(c.cause_beneficiaries) ? c.cause_beneficiaries[0] : c.cause_beneficiaries
      return { ...c, beneficiary_name: (ben as { name?: string } | null)?.name ?? '—' }
    })
    return NextResponse.json({ campaigns })
  })
}

// POST - create a campaign
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/cause/campaigns', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service

    const body = await request.json()
    const { beneficiary_id, name, starts_at, ends_at, vertical_id } = body as {
      beneficiary_id?: string; name?: string; starts_at?: string; ends_at?: string; vertical_id?: string | null
    }
    if (!beneficiary_id || !name || !starts_at || !ends_at) {
      return NextResponse.json({ error: 'beneficiary, name, starts_at and ends_at are required' }, { status: 400 })
    }
    if (new Date(ends_at).getTime() <= new Date(starts_at).getTime()) {
      return NextResponse.json({ error: 'ends_at must be after starts_at' }, { status: 400 })
    }
    // Verify the beneficiary exists + is active
    const { data: ben } = await observed(service
      .from('cause_beneficiaries').select('id').eq('id', beneficiary_id).eq('active', true).maybeSingle(), { table: 'cause_beneficiaries' })
    if (!ben) return NextResponse.json({ error: 'Beneficiary not found or inactive' }, { status: 400 })

    const { data, error } = await service
      .from('cause_campaigns')
      .insert({
        beneficiary_id, name: name.trim(), starts_at, ends_at,
        vertical_id: vertical_id || null, round_up_enabled: true, active: true,
      })
      .select('id, name, active')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ campaign: data })
  })
}
