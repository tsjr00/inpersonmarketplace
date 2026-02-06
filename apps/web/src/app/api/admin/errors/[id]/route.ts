import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb, getResolutionSummary } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/admin/errors/[id]
 *
 * Get a single error report with full context.
 * Includes error_logs data, resolution history, and similar reports.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

  return withErrorTracing('/api/admin/errors/[id]', 'GET', async () => {
    const { id } = await params
    const supabase = await createClient()

    // Check auth
    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get the error report (RLS will handle authorization)
    // Note: No embedded selects - verticals and user references need separate queries
    // because PostgREST can't join auth.users and verticals columns don't match
    crumb.supabase('select', 'error_reports')
    const { data: report, error } = await supabase
      .from('error_reports')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      throw traced.fromSupabase(error, {
        table: 'error_reports',
        operation: 'select',
      })
    }

    if (!report) {
      throw traced.notFound('ERR_NOT_FOUND', 'Error report not found')
    }

    // Get vertical name if we have a vertical_id
    let verticalInfo = null
    if (report.vertical_id) {
      crumb.supabase('select', 'verticals')
      const { data } = await supabase
        .from('verticals')
        .select('vertical_id, name_public')
        .eq('vertical_id', report.vertical_id)
        .single()
      if (data) {
        verticalInfo = {
          id: data.vertical_id,
          name: data.name_public,
          slug: data.vertical_id, // vertical_id IS the slug
        }
      }
    }

    // Get error_logs entry if we have a trace_id
    let errorLog = null
    if (report.trace_id) {
      crumb.supabase('select', 'error_logs')
      const { data } = await supabase
        .from('error_logs')
        .select('*')
        .eq('trace_id', report.trace_id)
        .single()
      errorLog = data
    }

    // Get resolution history for this error code
    let resolutionSummary = null
    if (report.error_code) {
      crumb.logic('Getting resolution summary', { errorCode: report.error_code })
      resolutionSummary = await getResolutionSummary(report.error_code)
    }

    // Get similar reports (same error code)
    // Note: No embedded verticals select - vertical_id is already the slug
    let similarReports: unknown[] = []
    if (report.error_code) {
      crumb.supabase('select', 'error_reports', { similar: true })
      const { data } = await supabase
        .from('error_reports')
        .select('id, status, vertical_id, created_at')
        .eq('error_code', report.error_code)
        .neq('id', id)
        .order('created_at', { ascending: false })
        .limit(10)
      similarReports = data || []
    }

    // Build enriched report that matches frontend interface
    const enrichedReport = {
      ...report,
      verticals: verticalInfo,
      error_logs: errorLog,
    }

    return NextResponse.json({
      report: enrichedReport,
      errorLog, // Keep separate for backwards compatibility
      resolutionSummary,
      similarReports,
    })
  })
}

/**
 * PATCH /api/admin/errors/[id]
 *
 * Update an error report. Actions include:
 *   - acknowledge: Mark as acknowledged
 *   - escalate: Escalate to platform admin
 *   - assign: Assign to an admin
 *   - resolve: Mark as resolved
 *   - addNotes: Add admin notes
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

  return withErrorTracing('/api/admin/errors/[id]', 'PATCH', async () => {
    const { id } = await params
    const supabase = await createClient()

    // Check auth
    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Parse request body
    const body = await request.json()
    const { action, notes, assignToUserId, resolutionId, status } = body

    crumb.logic('Validating action', { action })

    // Get current report (RLS will verify access)
    crumb.supabase('select', 'error_reports')
    const { data: currentReport, error: fetchError } = await supabase
      .from('error_reports')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !currentReport) {
      throw traced.notFound('ERR_NOT_FOUND', 'Error report not found')
    }

    // Check if user is platform admin
    crumb.supabase('select', 'user_profiles')
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('roles')
      .eq('user_id', user.id)
      .single()

    const isPlatformAdmin = profile?.roles?.includes('admin')

    // Build update based on action
    const updateData: Record<string, unknown> = {}

    switch (action) {
      case 'acknowledge':
        updateData.status = 'acknowledged'
        if (notes) updateData.vertical_admin_notes = notes
        break

      case 'escalate':
        if (currentReport.escalation_level === 'platform_admin') {
          throw traced.validation('ERR_VALIDATION_002', 'Already escalated to platform admin')
        }
        updateData.status = 'escalated'
        updateData.escalation_level = 'platform_admin'
        updateData.escalated_at = new Date().toISOString()
        updateData.escalated_by_user_id = user.id
        if (notes) updateData.vertical_admin_notes = notes
        break

      case 'assign':
        if (!assignToUserId) {
          throw traced.validation('ERR_VALIDATION_003', 'assignToUserId required')
        }
        updateData.assigned_to_user_id = assignToUserId
        updateData.status = 'in_progress'
        break

      case 'resolve':
        if (!isPlatformAdmin && currentReport.escalation_level === 'platform_admin') {
          throw traced.auth('ERR_AUTH_002', 'Only platform admin can resolve escalated reports')
        }
        updateData.status = 'resolved'
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by_user_id = user.id
        if (resolutionId) updateData.resolution_id = resolutionId
        if (notes) {
          if (isPlatformAdmin) {
            updateData.platform_admin_notes = notes
          } else {
            updateData.vertical_admin_notes = notes
          }
        }
        break

      case 'mark_duplicate':
        updateData.status = 'duplicate'
        if (notes) updateData.vertical_admin_notes = notes
        break

      case 'cannot_reproduce':
        updateData.status = 'cannot_reproduce'
        if (notes) updateData.vertical_admin_notes = notes
        break

      case 'addNotes':
        if (!notes) {
          throw traced.validation('ERR_VALIDATION_004', 'notes required')
        }
        if (isPlatformAdmin) {
          updateData.platform_admin_notes = notes
        } else {
          updateData.vertical_admin_notes = notes
        }
        break

      case 'updateStatus':
        if (!status) {
          throw traced.validation('ERR_VALIDATION_005', 'status required')
        }
        updateData.status = status
        break

      default:
        throw traced.validation('ERR_VALIDATION_006', `Unknown action: ${action}`)
    }

    // Apply update
    crumb.supabase('update', 'error_reports')
    const { data: updatedReport, error: updateError } = await supabase
      .from('error_reports')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      throw traced.fromSupabase(updateError, {
        table: 'error_reports',
        operation: 'update',
      })
    }

    crumb.logic('Error report updated', { action, status: updatedReport.status })

    return NextResponse.json({
      success: true,
      report: updatedReport,
    })
  })
}
