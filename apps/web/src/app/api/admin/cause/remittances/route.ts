import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { hasPlatformAdminRole } from '@/lib/auth/admin'
import { recordManualCheckRemittance } from '@/lib/cause/beneficiaries'

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

// GET - remittance history (optionally ?beneficiaryId=)
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/cause/remittances', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service

    const beneficiaryId = request.nextUrl.searchParams.get('beneficiaryId')
    let query = service
      .from('cause_remittances')
      .select('id, beneficiary_id, amount_cents, method, stripe_transfer_id, status, period_start, period_end, notes, created_at, paid_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (beneficiaryId) query = query.eq('beneficiary_id', beneficiaryId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: 'Failed to fetch remittances' }, { status: 500 })
    return NextResponse.json({ remittances: data ?? [] })
  })
}

// POST - record a MANUAL check remittance (admin mailed a check).
// Bookkeeping only — no money moves here. Drops the org's outstanding balance
// by amount_cents via a matching negative ledger row. The automatic Connect
// path (which DOES move money) runs in the remittance cron, not here.
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/cause/remittances', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service

    const body = await request.json()
    const { beneficiary_id, amount_cents, notes } = body as {
      beneficiary_id?: string
      amount_cents?: number
      notes?: string
    }
    if (!beneficiary_id) {
      return NextResponse.json({ error: 'beneficiary_id is required' }, { status: 400 })
    }
    if (typeof amount_cents !== 'number' || !Number.isInteger(amount_cents) || amount_cents <= 0) {
      return NextResponse.json({ error: 'amount_cents must be a positive integer' }, { status: 400 })
    }

    const result = await recordManualCheckRemittance(
      service,
      beneficiary_id,
      amount_cents,
      new Date().toISOString(),
      notes
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json({ success: true, remittanceId: result.remittanceId })
  })
}
