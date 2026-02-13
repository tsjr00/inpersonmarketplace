import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/errors/report
 *
 * Allows users to report errors they encounter.
 * This creates an entry in error_reports for vertical admin review.
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

    return NextResponse.json({
      success: true,
      reportId: report.id,
      message: 'Thank you for reporting this error. Our team will investigate.',
    })
  })
}
