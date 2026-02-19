import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

const SPIKE_THRESHOLD = 5 // reports of same error code in 1 hour triggers immediate alert
const SPIKE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

/**
 * POST /api/errors/report
 *
 * Allows users to report errors they encounter.
 * This creates an entry in error_reports for vertical admin review.
 * If the same error code is reported 5+ times in an hour, sends an
 * immediate alert to admin (spike detection).
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/errors/report', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`errors-report:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Get user if authenticated (optional - users can report errors even if logged out)
    crumb.auth('Checking authentication (optional)')
    const { data: { user } } = await supabase.auth.getUser()

    // Parse request body
    const body = await request.json()
    const {
      errorCode,
      traceId,
      verticalId,
      pageUrl,
      userDescription,
      reporterEmail,
    } = body

    crumb.logic('Validating error report', { errorCode, traceId })

    // At minimum we need either an error code or trace ID
    if (!errorCode && !traceId) {
      throw traced.validation('ERR_VALIDATION_001', 'Either errorCode or traceId is required')
    }

    // Get user agent from request
    const userAgent = request.headers.get('user-agent') || undefined

    crumb.supabase('insert', 'error_reports')
    const { data: report, error } = await supabase
      .from('error_reports')
      .insert({
        error_code: errorCode,
        trace_id: traceId,
        vertical_id: verticalId,
        page_url: pageUrl,
        user_agent: userAgent,
        reported_by_user_id: user?.id,
        reporter_email: reporterEmail || user?.email,
        user_description: userDescription,
        status: 'pending',
        escalation_level: 'vertical_admin',
      })
      .select('id, error_code, status, created_at')
      .single()

    if (error) {
      throw traced.fromSupabase(error, {
        table: 'error_reports',
        operation: 'insert',
      })
    }

    crumb.logic('Error report created', { reportId: report.id })

    // Spike detection: check if this error code is being reported heavily
    // Runs async after response — uses service client to count across all users
    if (errorCode) {
      checkForSpike(errorCode).catch(() => {
        // Spike detection should never break the report flow
      })
    }

    return NextResponse.json({
      success: true,
      reportId: report.id,
      message: 'Thank you for reporting this error. Our team will investigate.',
    })
  })
}

/**
 * Spike detection: if the same error code has been reported SPIKE_THRESHOLD+
 * times in the last hour, send an immediate email/SMS to admin.
 * Uses in-memory dedup so we don't spam admin with repeated spike alerts.
 */
const recentSpikeAlerts = new Map<string, number>() // errorCode -> timestamp of last alert

async function checkForSpike(errorCode: string): Promise<void> {
  // Don't re-alert for same code within the spike window
  const lastAlert = recentSpikeAlerts.get(errorCode)
  if (lastAlert && Date.now() - lastAlert < SPIKE_WINDOW_MS) return

  const serviceClient = createServiceClient()
  const oneHourAgo = new Date(Date.now() - SPIKE_WINDOW_MS).toISOString()

  const { count, error } = await serviceClient
    .from('error_reports')
    .select('id', { count: 'exact', head: true })
    .eq('error_code', errorCode)
    .gte('created_at', oneHourAgo)

  if (error || !count || count < SPIKE_THRESHOLD) return

  // Spike detected — send immediate alert
  recentSpikeAlerts.set(errorCode, Date.now())

  const adminEmail = process.env.ADMIN_ALERT_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (adminEmail && apiKey) {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: 'alerts@farmersmarketing.app',
      to: adminEmail,
      subject: `[SPIKE] ${errorCode} — ${count} reports in the last hour`,
      html: `
        <h2 style="color:#dc2626;margin:0 0 12px">Error Spike Detected</h2>
        <p><strong>${errorCode}</strong> has been reported <strong>${count} times</strong> in the last hour.</p>
        <p>This exceeds the threshold of ${SPIKE_THRESHOLD} and may indicate a systemic issue.</p>
        <p style="margin-top:16px">
          <a href="https://farmersmarketing.app/admin/errors?errorCode=${encodeURIComponent(errorCode)}"
             style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none">
            View Reports
          </a>
        </p>
      `,
    })

    console.warn(`[SPIKE ALERT] ${errorCode}: ${count} reports in 1hr — admin notified`)
  }
}
