import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { hasPlatformAdminRole, hasAdminRole } from '@/lib/auth/admin'
import { getBeneficiaryBalances } from '@/lib/cause/beneficiaries'

// Community Chip In beneficiary orgs are platform-level (cross-vertical), so
// WRITES are gated on platform_admin (mirrors /api/admin/admins). GET is the one
// exception — vertical admins read a reduced list so they can attach an org to
// their own events (owner decision 2026-08-04). See the note on GET.

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

// GET - list beneficiaries.
//
// READ-PLUS-ATTACH for vertical admins (owner decision 2026-08-04): a vertical
// admin needs to SEE which orgs exist so they can attach one to their event, but
// must never see or change where money goes — the beneficiary pool is shared
// across verticals, so payout details are platform-admin-only. Platform admins
// get the full record plus outstanding balances; vertical admins get name and
// active status and nothing else. The reduction happens server-side, not by
// hiding fields in the UI.
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/cause/beneficiaries', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    const isPlatform = hasPlatformAdminRole(profile || {})
    if (!isPlatform && !hasAdminRole(profile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const service = createServiceClient()

    if (!isPlatform) {
      const { data: rows, error: readErr } = await service
        .from('cause_beneficiaries')
        .select('id, name, active')
        .eq('active', true)
        .order('name', { ascending: true })
      if (readErr) {
        return NextResponse.json({ error: 'Failed to fetch beneficiaries' }, { status: 500 })
      }
      return NextResponse.json({ beneficiaries: rows ?? [], readOnly: true })
    }

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
    // stripe_account_id is deliberately NOT required here. It is produced by
    // Connect onboarding (POST .../[id]/connect), which cannot run until the
    // beneficiary row exists — so requiring it at creation made an automatic-pay
    // org impossible to create at all (tester finding 2026-08-05). A connect
    // beneficiary is simply "not connected yet" until the admin sends the link;
    // the card says so, and the remit sweep already skips NULL accounts.
    // What IS needed up front is the contact email, because that is where
    // Stripe sends the onboarding invitation.
    if (method === 'connect' && (!contact_email || contact_email.trim() === '')) {
      return NextResponse.json(
        { error: 'A contact email is required for automatic payment — Stripe sends the onboarding invitation there.' },
        { status: 400 }
      )
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
