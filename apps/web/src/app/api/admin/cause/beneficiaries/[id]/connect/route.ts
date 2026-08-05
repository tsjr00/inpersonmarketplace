import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { hasPlatformAdminRole } from '@/lib/auth/admin'
import { createCauseConnectAccount, createAccountLink, getAccountStatus } from '@/lib/stripe/connect'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * Stripe Connect onboarding for a cause beneficiary (mig 213).
 *
 * WHY: `runCauseRemitSweep` pays beneficiaries with
 * `stripe.transfers.create({ destination })`, and Stripe only allows transfers
 * to accounts connected to THIS platform. Collecting an org's own account
 * number as free text — which is what the form did before 2026-08-04 — produces
 * an id that looks valid and fails at transfer time. The org has to be onboarded
 * through us, exactly like vendors and managers are.
 *
 * GET  — current onboarding status, read live from Stripe. Deliberately NOT
 *        cached in a column: "did they finish onboarding" is Stripe's fact, and
 *        a stale local copy is how a beneficiary ends up in the remit sweep
 *        before they can actually receive money.
 * POST — create the Express account if it doesn't exist yet, then return a
 *        fresh onboarding link. Account links are single-use and short-lived,
 *        so this is safe (and expected) to call repeatedly.
 *
 * Platform admin only. Vertical admins get read-plus-attach on beneficiaries
 * (owner decision 2026-08-04) — they never touch where money goes.
 */
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

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/cause/beneficiaries/[id]/connect', 'GET', async () => {
    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service!

    const { id } = await context.params
    const { data: b } = await service
      .from('cause_beneficiaries')
      .select('id, stripe_account_id')
      .eq('id', id)
      .maybeSingle()

    if (!b) return NextResponse.json({ error: 'Beneficiary not found' }, { status: 404 })
    if (!b.stripe_account_id) {
      return NextResponse.json({ connected: false, payoutsEnabled: false, accountId: null })
    }

    try {
      const status = await getAccountStatus(b.stripe_account_id as string)
      return NextResponse.json({
        connected: true,
        accountId: b.stripe_account_id,
        // The only field that decides whether the remit sweep can actually pay
        // them. "Account exists" is not the same as "can receive money".
        payoutsEnabled: !!status.payoutsEnabled,
        detailsSubmitted: !!status.detailsSubmitted,
      })
    } catch {
      // A deleted or unreachable account must not read as ready.
      return NextResponse.json({ connected: true, accountId: b.stripe_account_id, payoutsEnabled: false, unreachable: true })
    }
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/cause/beneficiaries/[id]/connect', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error
    const service = gate.service!

    const { id } = await context.params
    const { data: b } = await service
      .from('cause_beneficiaries')
      .select('id, name, contact_email, stripe_account_id')
      .eq('id', id)
      .maybeSingle()

    if (!b) return NextResponse.json({ error: 'Beneficiary not found' }, { status: 404 })

    const email = (b.contact_email as string | null) ?? ''
    if (!email) {
      return NextResponse.json(
        { error: 'Add a contact email for this organization first — Stripe sends the onboarding invitation there.' },
        { status: 400 }
      )
    }

    let accountId = b.stripe_account_id as string | null

    if (!accountId) {
      // Idempotency key is per beneficiary, so a double-click cannot create a
      // second Connect account for the same org.
      const account = await createCauseConnectAccount(email, b.id as string)
      accountId = account.id

      const { error: saveErr } = await service
        .from('cause_beneficiaries')
        .update({ stripe_account_id: accountId, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (saveErr) {
        // The Stripe account now exists but we failed to record it. Surface it
        // loudly rather than returning a link to an account we've lost track of
        // — the idempotency key makes a retry safe and non-duplicating.
        return NextResponse.json(
          { error: `Stripe account ${accountId} was created but could not be saved. Retry — it will reuse the same account.` },
          { status: 500 }
        )
      }
    }

    const origin = request.nextUrl.origin
    const link = await createAccountLink(
      accountId,
      `${origin}/admin/cause?onboarding=refresh&beneficiary=${id}`,
      `${origin}/admin/cause?onboarding=complete&beneficiary=${id}`
    )

    return NextResponse.json({ url: link.url, accountId })
  })
}
