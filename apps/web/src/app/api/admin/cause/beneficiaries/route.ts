import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { hasPlatformAdminRole } from '@/lib/auth/admin'
import { getBeneficiaryBalances } from '@/lib/cause/beneficiaries'

// Community Chip In beneficiary orgs are platform-level (cross-vertical), so
// these are gated on platform_admin (mirrors /api/admin/admins).

/** Verify the caller is a platform admin. Returns the service client or a 4xx. */
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

// GET - list beneficiaries with their outstanding (un-remitted) balances
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/cause/beneficiaries', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service

    const { data: beneficiaries, error } = await service
      .from('cause_beneficiaries')
      .select('id, name, contact_email, stripe_account_id, remit_method, mailing_address, active, notes, created_at')
      .order('active', { ascending: false })
      .order('name', { ascending: true })
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch beneficiaries' }, { status: 500 })
    }

    const balances = await getBeneficiaryBalances(service)
    const withBalances = (beneficiaries ?? []).map((b) => ({
      ...b,
      outstanding_cents: balances.get(b.id as string) ?? 0,
    }))
    return NextResponse.json({ beneficiaries: withBalances })
  })
}

// POST - create a beneficiary
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/cause/beneficiaries', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service

    const body = await request.json()
    const { name, contact_email, stripe_account_id, remit_method, mailing_address, notes } = body as {
      name?: string
      contact_email?: string
      stripe_account_id?: string
      remit_method?: string
      mailing_address?: string
      notes?: string
    }

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const method = remit_method === 'connect' ? 'connect' : 'check'
    if (method === 'connect' && (!stripe_account_id || stripe_account_id.trim() === '')) {
      return NextResponse.json({ error: 'stripe_account_id is required for automatic (Connect) remittance' }, { status: 400 })
    }

    const { data, error } = await service
      .from('cause_beneficiaries')
      .insert({
        name: name.trim(),
        contact_email: contact_email?.trim() || null,
        stripe_account_id: stripe_account_id?.trim() || null,
        remit_method: method,
        mailing_address: mailing_address?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select('id, name, remit_method, active')
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ beneficiary: data })
  })
}
