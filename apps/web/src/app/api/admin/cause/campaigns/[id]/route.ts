import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { hasPlatformAdminRole } from '@/lib/auth/admin'

interface RouteContext { params: Promise<{ id: string }> }

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()
  if (!hasPlatformAdminRole(profile || {})) {
    return { error: NextResponse.json({ error: 'Platform admin access required' }, { status: 403 }) }
  }
  return { service: createServiceClient() }
}

// PATCH - toggle active / round_up_enabled, or adjust dates
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/cause/campaigns/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service

    const { id } = await context.params
    const body = await request.json()
    const { active, round_up_enabled, starts_at, ends_at, name } = body as {
      active?: boolean; round_up_enabled?: boolean; starts_at?: string; ends_at?: string; name?: string
    }

    const update: Record<string, unknown> = {}
    if (active !== undefined) update.active = !!active
    if (round_up_enabled !== undefined) update.round_up_enabled = !!round_up_enabled
    if (name !== undefined && name.trim() !== '') update.name = name.trim()
    if (starts_at !== undefined) update.starts_at = starts_at
    if (ends_at !== undefined) update.ends_at = ends_at
    if (update.starts_at && update.ends_at &&
        new Date(update.ends_at as string).getTime() <= new Date(update.starts_at as string).getTime()) {
      return NextResponse.json({ error: 'ends_at must be after starts_at' }, { status: 400 })
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await service
      .from('cause_campaigns')
      .update(update)
      .eq('id', id)
      .select('id, name, active, round_up_enabled')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ campaign: data })
  })
}
