import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET /api/admin/errors
 *
 * Returns error reports for vertical admin review.
 * Supports filtering by status, error code, and escalation level.
 *
 * Query params:
 *   - verticalId: Filter by vertical (required for vertical admins)
 *   - status: Filter by status (pending, acknowledged, escalated, etc.)
 *   - escalationLevel: Filter by escalation level (vertical_admin, platform_admin)
 *   - errorCode: Filter by specific error code
 *   - limit: Number of results (default 50)
 *   - offset: Pagination offset
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/errors', 'GET', async () => {
    const supabase = await createClient()

    // Check auth
    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const verticalId = searchParams.get('verticalId')
    const status = searchParams.get('status')
    const escalationLevel = searchParams.get('escalationLevel')
    const errorCode = searchParams.get('errorCode')
    const showAll = searchParams.get('showAll') === 'true' // Platform admin can see all
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    crumb.logic('Fetching error reports', { verticalId, status, escalationLevel })

    // Check if user is platform admin or vertical admin
    crumb.supabase('select', 'user_profiles')
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('roles')
      .eq('user_id', user.id)
      .single()

    const isPlatformAdmin = profile?.roles?.includes('admin')

    // If not platform admin, verify they're a vertical admin for the requested vertical
    if (!isPlatformAdmin) {
      if (!verticalId) {
        throw traced.auth('ERR_AUTH_002', 'Vertical ID required for vertical admins')
      }

      crumb.supabase('select', 'vertical_admins')
      const { data: verticalAdmin } = await supabase
        .from('vertical_admins')
        .select('id')
        .eq('user_id', user.id)
        .eq('vertical_id', verticalId)
        .single()

      if (!verticalAdmin) {
        throw traced.auth('ERR_AUTH_002', 'Not authorized for this vertical')
      }
    }

    // Build query - includes vertical name via FK relationship
    // Note: no FK relationship to error_logs, so that's fetched separately in detail view
    crumb.supabase('select', 'error_reports')
    let query = supabase
      .from('error_reports')
      .select(`
        id,
        error_code,
        trace_id,
        vertical_id,
        page_url,
        user_description,
        reporter_email,
        status,
        escalation_level,
        vertical_admin_notes,
        platform_admin_notes,
        escalated_at,
        resolved_at,
        created_at,
        updated_at,
        verticals(vertical_id, name_public)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    // Platform admins with showAll=true see ALL reports (including null vertical_id)
    // Otherwise, filter by vertical
    if (isPlatformAdmin && showAll) {
      // Don't filter by vertical - show everything
    } else if (verticalId) {
      query = query.eq('vertical_id', verticalId)
    }

    if (status) {
      query = query.eq('status', status)
    }
    if (escalationLevel) {
      query = query.eq('escalation_level', escalationLevel)
    }
    if (errorCode) {
      query = query.eq('error_code', errorCode)
    }

    // If not platform admin, only show vertical_admin level (not escalated)
    if (!isPlatformAdmin) {
      query = query.eq('escalation_level', 'vertical_admin')
    }

    const { data: reports, error, count } = await query

    if (error) {
      throw traced.fromSupabase(error, {
        table: 'error_reports',
        operation: 'select',
      })
    }

    crumb.logic('Error reports fetched', { count: reports?.length || 0 })

    // Transform reports to match frontend interface
    // verticals: { vertical_id, name_public } -> { id, name, slug }
    const transformedReports = (reports || []).map(report => {
      const vertical = report.verticals as unknown as { vertical_id: string; name_public: string } | null
      return {
        ...report,
        verticals: vertical ? {
          id: vertical.vertical_id,
          name: vertical.name_public,
          slug: vertical.vertical_id,
        } : null,
      }
    })

    // Get error frequency summary - apply same filters as main query for consistency
    crumb.supabase('select', 'error_reports', { summary: true })
    let frequencyQuery = supabase
      .from('error_reports')
      .select('error_code')
      .not('error_code', 'is', null)

    // Apply same filters as main query
    if (!(isPlatformAdmin && showAll) && verticalId) {
      frequencyQuery = frequencyQuery.eq('vertical_id', verticalId)
    }
    if (!isPlatformAdmin) {
      frequencyQuery = frequencyQuery.eq('escalation_level', 'vertical_admin')
    }

    const { data: frequency } = await frequencyQuery

    // Count by error code
    const errorCounts: Record<string, number> = {}
    frequency?.forEach(row => {
      if (row.error_code) {
        errorCounts[row.error_code] = (errorCounts[row.error_code] || 0) + 1
      }
    })

    return NextResponse.json({
      reports: transformedReports,
      total: count || 0,
      limit,
      offset,
      errorCounts,
      isPlatformAdmin,
    })
  })
}
