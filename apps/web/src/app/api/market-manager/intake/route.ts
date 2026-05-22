import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimits,
  rateLimitResponse,
} from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * POST /api/market-manager/intake
 *
 * Public-facing endpoint for the market-manager-program landing page.
 * No auth required. Creates a `markets` row in `status='pending'` and
 * sends two emails: a confirmation to the applicant + a notification to
 * the platform admin queue.
 *
 * Pattern mirrors `apps/web/src/app/api/event-requests/route.ts` —
 * Resend dynamic import for direct email send (no in-app notification
 * because the applicant has no user_id yet), rate-limit via
 * `rateLimits.submit`, content moderation on free-text via `checkFields`.
 *
 * Vertical scope: farmers_market for v1 (per market_manager_v2_plan.md).
 * FT park-operator equivalent is a separate persona, deferred.
 *
 * Body shape:
 *   {
 *     manager_name: string   // required; admin email only (not stored on markets)
 *     email: string          // required; normalized to lowercase
 *     market_name: string    // required
 *     city: string           // required
 *     state: string          // required (2-letter US state)
 *     phone?: string         // optional; admin email only
 *     notes?: string         // optional; admin email only
 *   }
 *
 * Response:
 *   200 → { success: true, market_id, message }
 *   400 → validation failure (with .field key for client mapping)
 *   409 → email already has a market on the platform
 *   429 → rate-limited
 *
 * Activation: market stays `status='pending'` until admin flips it to
 * `'active'`. Public browse / nearby / vendors-with-listings all filter
 * `.eq('status', 'active')` so the pending market stays hidden until
 * approval. The manager CAN access their dashboard for the pending
 * market immediately (manager-auth doesn't filter status).
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/market-manager/intake', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(
      `mm-intake:${clientIp}`,
      rateLimits.submit
    )
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const body = await request.json().catch(() => ({}))

    // ── Trim + normalize ────────────────────────────────────────────
    const managerName =
      typeof body?.manager_name === 'string' ? body.manager_name.trim() : ''
    const email =
      typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const marketName =
      typeof body?.market_name === 'string' ? body.market_name.trim() : ''
    const city = typeof body?.city === 'string' ? body.city.trim() : ''
    const state =
      typeof body?.state === 'string' ? body.state.trim().toUpperCase() : ''
    const phone =
      typeof body?.phone === 'string' && body.phone.trim().length > 0
        ? body.phone.trim().slice(0, 30)
        : null
    const notes =
      typeof body?.notes === 'string' && body.notes.trim().length > 0
        ? body.notes.trim().slice(0, 1000)
        : null

    // ── Required field validation ───────────────────────────────────
    if (!managerName) {
      return NextResponse.json(
        { error: 'Your name is required', field: 'manager_name' },
        { status: 400 }
      )
    }
    if (managerName.length < 2 || managerName.length > 100) {
      return NextResponse.json(
        { error: 'Name must be between 2 and 100 characters', field: 'manager_name' },
        { status: 400 }
      )
    }
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required', field: 'email' },
        { status: 400 }
      )
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Enter a valid email address', field: 'email' },
        { status: 400 }
      )
    }
    if (!marketName) {
      return NextResponse.json(
        { error: 'Market name is required', field: 'market_name' },
        { status: 400 }
      )
    }
    if (marketName.length < 3 || marketName.length > 100) {
      return NextResponse.json(
        { error: 'Market name must be between 3 and 100 characters', field: 'market_name' },
        { status: 400 }
      )
    }
    if (!city) {
      return NextResponse.json(
        { error: 'City is required', field: 'city' },
        { status: 400 }
      )
    }
    if (city.length < 2 || city.length > 100) {
      return NextResponse.json(
        { error: 'City must be between 2 and 100 characters', field: 'city' },
        { status: 400 }
      )
    }
    if (!state) {
      return NextResponse.json(
        { error: 'State is required', field: 'state' },
        { status: 400 }
      )
    }
    if (!/^[A-Z]{2}$/.test(state)) {
      return NextResponse.json(
        { error: 'State must be a 2-letter US state code (e.g., TX)', field: 'state' },
        { status: 400 }
      )
    }

    // ── Content moderation on text fields (matches event-requests pattern) ──
    const { checkFields } = await import('@/lib/content-moderation')
    const modCheck = checkFields({
      manager_name: managerName,
      market_name: marketName,
      city: city,
      ...(notes ? { notes } : {}),
    })
    if (!modCheck.passed) {
      return NextResponse.json({ error: modCheck.reason }, { status: 400 })
    }

    const supabase = createServiceClient()

    // ── Dedup: one market per manager email ─────────────────────────
    // The partial functional index `idx_markets_manager_email ON
    // markets(LOWER(manager_email)) WHERE manager_email IS NOT NULL`
    // (mig 133) handles this query cheaply.
    crumb.supabase('select', 'markets')
    const { data: existing } = await supabase
      .from('markets')
      .select('id, name, vertical_id, status')
      .eq('manager_email', email)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        {
          error: `You already have a market set up under this email (${existing.name as string}). Sign in to your dashboard to manage it.`,
          field: 'email',
          existing_market_id: existing.id as string,
        },
        { status: 409 }
      )
    }

    // ── Insert the market in pending status ─────────────────────────
    // Required NOT NULL columns: vertical_id, name, market_type.
    // status='pending' keeps it hidden from public browse / nearby /
    // vendors-with-listings until admin approval.
    crumb.supabase('insert', 'markets')
    const { data: inserted, error: insertError } = await supabase
      .from('markets')
      .insert({
        vertical_id: 'farmers_market',
        name: marketName.slice(0, 200),
        market_type: 'traditional',
        status: 'pending',
        city: city.slice(0, 100),
        state: state,
        manager_email: email,
        manager_invited_at: new Date().toISOString(),
      })
      .select('id, name, vertical_id')
      .single()

    if (insertError) {
      throw traced.fromSupabase(insertError, { table: 'markets', operation: 'insert' })
    }

    const marketId = inserted.id as string
    const verticalId = (inserted.vertical_id as string) || 'farmers_market'

    // ── Notifications (non-blocking) ───────────────────────────────
    // Both emails are best-effort. If they fail the row is still
    // created, the admin sees the new pending market in their queue
    // via the admin/markets page, and the manager can re-request.
    await Promise.all([
      sendAdminNotification({
        managerName,
        email,
        marketName,
        city,
        state,
        phone,
        notes,
        marketId,
      }),
      sendManagerConfirmation({
        managerName,
        email,
        marketName,
        verticalId,
      }),
    ])

    return NextResponse.json({
      success: true,
      market_id: marketId,
      message:
        "Thanks — your market is registered. Check your email for the link to set up your dashboard. We'll review and activate your public listing within one business day.",
    })
  })
}

// ─────────────────────────────────────────────────────────────────────
// Email helpers (Resend direct; applicant has no user_id yet so the
// in-app sendNotification system isn't applicable).
// ─────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface AdminNotificationArgs {
  managerName: string
  email: string
  marketName: string
  city: string
  state: string
  phone: string | null
  notes: string | null
  marketId: string
}

async function sendAdminNotification(args: AdminNotificationArgs): Promise<void> {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (!adminEmail || !apiKey) {
    console.warn('[mm-intake] ADMIN_ALERT_EMAIL or RESEND_API_KEY not set — skipping admin email')
    return
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: 'Farmers Marketing <updates@mail.farmersmarketing.app>',
      to: adminEmail,
      subject: `New market manager intake: ${args.marketName} (${args.city}, ${args.state})`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#2d5016;margin:0 0 16px">New market manager intake</h2>
          <p style="color:#737373;font-size:13px;margin:0 0 16px">Market is in <strong>pending</strong> status and hidden from public browse. Flip status to <strong>active</strong> when ready.</p>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;width:140px">Market name</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(args.marketName)}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Manager</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(args.managerName)}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee"><a href="mailto:${escapeHtml(args.email)}">${escapeHtml(args.email)}</a></td></tr>
            ${args.phone ? `<tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(args.phone)}</td></tr>` : ''}
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Location</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(args.city)}, ${escapeHtml(args.state)}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Market ID</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${escapeHtml(args.marketId)}</td></tr>
            ${args.notes ? `<tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;vertical-align:top">Notes</td><td style="padding:8px 12px;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(args.notes)}</td></tr>` : ''}
          </table>
          <p style="margin-top:16px;color:#737373;font-size:13px">Review in the admin markets dashboard.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[mm-intake] Failed to send admin email:', err instanceof Error ? err.message : err)
  }
}

interface ManagerConfirmationArgs {
  managerName: string
  email: string
  marketName: string
  verticalId: string
}

async function sendManagerConfirmation(args: ManagerConfirmationArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  // Public-facing signup URL — applicant signs up with the same email
  // they just submitted; the existing email-to-user-id backfill flow
  // links manager_user_id on their first authenticated dashboard load
  // (admin/markets/[id]/manager/route.ts:46-49 references this pattern).
  const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://farmersmarketing.app'
  const signupUrl = `${appBase}/${args.verticalId}/login?signup=true&email=${encodeURIComponent(args.email)}`

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: 'Farmers Marketing <updates@mail.farmersmarketing.app>',
      to: args.email,
      subject: `Welcome — set up your dashboard for ${args.marketName}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#2d5016;margin:0 0 16px">Welcome, ${escapeHtml(args.managerName.split(' ')[0])} 👋</h2>
          <p style="margin:0 0 16px;line-height:1.6">
            Thanks for signing up <strong>${escapeHtml(args.marketName)}</strong> for the Farmers Marketing Manager Program.
          </p>
          <p style="margin:0 0 16px;line-height:1.6">
            Your next step is to set up your dashboard. Use the email below to sign up — we&apos;ve already linked your market to it.
          </p>
          <div style="background:#f4f4f4;padding:12px 16px;border-radius:6px;font-family:monospace;font-size:14px;margin:0 0 20px">
            ${escapeHtml(args.email)}
          </div>
          <p style="margin:0 0 24px;line-height:1.6">
            <a href="${signupUrl}" style="display:inline-block;background:#2d5016;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600">Set up your dashboard →</a>
          </p>
          <h3 style="margin:24px 0 8px;font-size:16px">What happens next</h3>
          <ul style="margin:0 0 16px;padding-left:20px;line-height:1.7">
            <li>You sign up + sign in to your dashboard.</li>
            <li>You configure your booth inventory (sizes, count, weekly price).</li>
            <li>You select the vendor agreement statements your market uses.</li>
            <li>You connect a Stripe account so we can pay you booth rental revenue.</li>
            <li>We review your setup and activate your public market listing — usually within one business day.</li>
          </ul>
          <p style="margin:24px 0 0;color:#737373;font-size:13px;line-height:1.5">
            Questions? Reply to this email and we&apos;ll get back to you.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[mm-intake] Failed to send manager confirmation email:', err instanceof Error ? err.message : err)
  }
}
