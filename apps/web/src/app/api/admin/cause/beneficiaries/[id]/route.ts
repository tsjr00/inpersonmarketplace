import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { hasPlatformAdminRole } from '@/lib/auth/admin'

interface RouteContext {
  params: Promise<{ id: string }>
}

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

// PATCH - update a beneficiary (edit fields, switch remit method, or
// deactivate via active:false — soft-delete; we never DELETE an org with history)
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/cause/beneficiaries/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service

    const { id } = await context.params
    const body = await request.json()
    const { name, contact_email, stripe_account_id, remit_method, mailing_address, notes, active } = body as {
      name?: string
      contact_email?: string | null
      stripe_account_id?: string | null
      remit_method?: string
      mailing_address?: string | null
      notes?: string | null
      active?: boolean
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) {
      if (!name || name.trim() === '') {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      }
      update.name = name.trim()
    }
    if (contact_email !== undefined) update.contact_email = contact_email?.trim() || null
    if (stripe_account_id !== undefined) update.stripe_account_id = stripe_account_id?.trim() || null
    if (mailing_address !== undefined) update.mailing_address = mailing_address?.trim() || null
    if (notes !== undefined) update.notes = notes?.trim() || null
    if (active !== undefined) update.active = !!active
    if (remit_method !== undefined) {
      update.remit_method = remit_method === 'connect' ? 'connect' : 'check'
    }

    // No account-id guard here either (see the POST route). The id comes from
    // Connect onboarding, not from the admin, so switching an org to automatic
    // payment before they have onboarded is a legitimate intermediate state —
    // it just means "not connected yet", which the card surfaces and the remit
    // sweep skips. Requiring it here blocked the switch entirely.
    if (update.remit_method === 'connect') {
      const { data: existing } = await service
        .from('cause_beneficiaries')
        .select('contact_email')
        .eq('id', id)
        .maybeSingle()
      const effectiveEmail =
        contact_email !== undefined ? contact_email : (existing?.contact_email as string | null)
      if (!effectiveEmail || effectiveEmail.trim() === '') {
        return NextResponse.json(
          { error: 'A contact email is required for automatic payment — Stripe sends the onboarding invitation there.' },
          { status: 400 }
        )
      }
    }

    const { data, error } = await service
      .from('cause_beneficiaries')
      .update(update)
      .eq('id', id)
      .select('id, name, remit_method, stripe_account_id, active')
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ beneficiary: data })
  })
}
