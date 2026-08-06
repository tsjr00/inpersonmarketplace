import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { createCauseConnectAccount, createAccountLink } from '@/lib/stripe/connect'

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * PUBLIC, UNAUTHENTICATED. The durable onboarding link we email to a cause
 * beneficiary org (mig 218).
 *
 * WHY THIS EXISTS: the org — not a platform admin — has to complete Stripe
 * Connect onboarding, because the form asks for their bank account, tax ID and a
 * representative's personal details. But a Stripe account link cannot be
 * emailed: it expires within minutes, is single-use, and is routinely consumed
 * by mail scanners and link-preview bots before a human clicks. So we email THIS
 * url, which is durable, and mint a fresh Stripe link on every visit. A bot
 * hitting it burns one generated link and nothing else.
 *
 * WHAT THE TOKEN GRANTS: starting Stripe onboarding for one org. Nothing else —
 * it reads no platform data, exposes no admin surface, and moves no money. The
 * response body never reveals org details; a bad token is a flat 404. Revoke by
 * nulling the column, which kills every previously sent email.
 *
 * ?status=complete is Stripe's return_url landing. We show a plain confirmation
 * rather than redirecting somewhere in the app, because the org has no account
 * here and nowhere to be sent.
 */
function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.25rem;line-height:1.6;color:#111">
<h1 style="font-size:1.25rem;margin:0 0 .75rem">${title}</h1>
<p style="color:#444;margin:0">${body}</p>
</div>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/cause/onboard/[token]', 'GET', async () => {
    const { token } = await context.params

    // Shape check before touching the DB — the column is UUID, so anything else
    // is a scanner probing, not a real invitation.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return page('Link not found', 'This onboarding link is not valid. Ask your contact to send a new one.', 404)
    }

    const service = createServiceClient()
    const { data: b } = await service
      .from('cause_beneficiaries')
      .select('id, name, contact_email, stripe_account_id, active')
      .eq('onboarding_token', token)
      .maybeSingle()

    // Same response for unknown, revoked and deactivated — a public endpoint
    // should not let a caller distinguish those.
    if (!b || !b.active) {
      return page('Link not found', 'This onboarding link is no longer valid. Ask your contact to send a new one.', 404)
    }

    if (request.nextUrl.searchParams.get('status') === 'complete') {
      return page(
        'Thanks — you&rsquo;re all set',
        `Stripe has what it needs for ${escapeHtml(b.name as string)}. Contributions collected on your behalf will be
         transferred automatically. You can close this window.`
      )
    }

    const email = (b.contact_email as string | null) ?? ''
    if (!email) {
      return page(
        'Something is missing',
        'We need a contact email on file before onboarding can start. Please reply to the message that brought you here.',
        400
      )
    }

    let accountId = b.stripe_account_id as string | null
    if (!accountId) {
      // Created here rather than at invite time so the email can go out before
      // any Stripe object exists. Idempotency key is per beneficiary, so repeat
      // visits — including bot visits — never create a second account.
      const account = await createCauseConnectAccount(email, b.id as string)
      accountId = account.id
      await service
        .from('cause_beneficiaries')
        .update({ stripe_account_id: accountId, updated_at: new Date().toISOString() })
        .eq('id', b.id)
    }

    const origin = request.nextUrl.origin
    const link = await createAccountLink(
      accountId,
      `${origin}/cause/onboard/${token}`,                  // refresh → mint another
      `${origin}/cause/onboard/${token}?status=complete`   // return → confirmation
    )

    return NextResponse.redirect(link.url, { status: 303 })
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}
