import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { verifyAdminScope } from '@/lib/auth/admin'

/**
 * GET /api/admin/error-logs
 *
 * Protocol 8 dashboard data — aggregated error_logs grouped by
 * (error_code, route, severity) with counts and time bounds.
 * Replaces the manual SQL query that admins paste into Supabase.
 *
 * Query params:
 *   days — lookback window (default 7, max 90)
 *   severity — filter to a specific severity level
 *   error_code — filter to a specific error code prefix
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/error-logs', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin-error-logs:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const scope = await verifyAdminScope(null)
    if (!scope?.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10) || 7, 1), 90)
    const severityFilter = searchParams.get('severity')
    const errorCodeFilter = searchParams.get('error_code')

    const serviceClient = createServiceClient()

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    let query = serviceClient
      .from('error_logs')
      .select('error_code, route, severity, created_at')
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false })

    if (severityFilter) {
      query = query.eq('severity', severityFilter)
    }
    if (errorCodeFilter) {
      query = query.ilike('error_code', `${errorCodeFilter}%`)
    }

    const { data: rows, error: queryError } = await query

    if (queryError) {
      console.error('[/api/admin/error-logs] query error:', queryError)
      return NextResponse.json({ error: 'Failed to fetch error logs' }, { status: 500 })
    }

    // Aggregate in JS (Supabase client doesn't support GROUP BY directly)
    const groups = new Map<string, {
      error_code: string
      route: string
      severity: string
      count: number
      first_seen: string
      last_seen: string
    }>()

    for (const row of rows || []) {
      const key = `${row.error_code}|${row.route}|${row.severity}`
      const existing = groups.get(key)
      const ts = row.created_at as string
      if (existing) {
        existing.count++
        if (ts < existing.first_seen) existing.first_seen = ts
        if (ts > existing.last_seen) existing.last_seen = ts
      } else {
        groups.set(key, {
          error_code: row.error_code as string,
          route: row.route as string,
          severity: row.severity as string,
          count: 1,
          first_seen: ts,
          last_seen: ts,
        })
      }
    }

    const aggregated = [...groups.values()]
      .sort((a, b) => b.count - a.count)

    // Summary counts by severity
    const bySeverity: Record<string, number> = {}
    for (const g of aggregated) {
      bySeverity[g.severity] = (bySeverity[g.severity] || 0) + g.count
    }

    return NextResponse.json({
      groups: aggregated,
      total_entries: rows?.length || 0,
      unique_groups: aggregated.length,
      by_severity: bySeverity,
      window_days: days,
    })
  })
}
