import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createClient as createRawClient } from '@supabase/supabase-js'
import { withErrorTracing } from '@/lib/errors'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import {
  checkScheduleConflicts,
  checkLowStockEvents,
  checkPriceAnomalies,
  checkGhostListings,
  checkInventoryVelocity,
  type QualityFinding,
} from '@/lib/quality-checks'
import { sendNotification } from '@/lib/notifications'

/**
 * GET /api/admin/quality-checks?vertical=food_trucks
 * Returns scan history + all active findings (admin only).
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/quality-checks', 'GET', async () => {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    if (!hasAdminRole(profile || {})) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')

    const serviceClient = await createServiceClient()

    // Fetch scan history (last 20 runs)
    const { data: scanHistory, error: scanError } = await serviceClient
      .from('vendor_quality_scan_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20)

    if (scanError) {
      return NextResponse.json({ error: 'Failed to fetch scan history' }, { status: 500 })
    }

    // Fetch all active findings with vendor info
    let findingsQuery = serviceClient
      .from('vendor_quality_findings')
      .select(`
        id, vendor_profile_id, vertical_id, check_type, severity,
        title, message, details, reference_key, status, created_at, dismissed_at,
        vendor_profiles!inner (
          id, profile_data, vertical_id
        )
      `)
      .eq('status', 'active')
      .order('severity', { ascending: true })
      .order('created_at', { ascending: false })

    if (vertical) {
      findingsQuery = findingsQuery.eq('vertical_id', vertical)
    }

    const { data: findings, error: findingsError } = await findingsQuery

    if (findingsError) {
      return NextResponse.json({ error: 'Failed to fetch findings' }, { status: 500 })
    }

    // Enrich findings with vendor names
    const enrichedFindings = (findings || []).map(f => {
      const vp = f.vendor_profiles as any
      const profileData = vp?.profile_data as Record<string, unknown> | null
      const vendorName = (profileData?.business_name as string) ||
        (profileData?.farm_name as string) || 'Unknown Vendor'
      return {
        ...f,
        vendorName,
        vendor_profiles: undefined, // Don't send full profile to frontend
      }
    })

    // Summary stats
    const byCheck: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}
    for (const f of enrichedFindings) {
      byCheck[f.check_type] = (byCheck[f.check_type] || 0) + 1
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1
    }

    return NextResponse.json({
      scanHistory: scanHistory || [],
      findings: enrichedFindings,
      summary: {
        totalActive: enrichedFindings.length,
        byCheck,
        bySeverity,
      },
    })
  })
}

/**
 * POST /api/admin/quality-checks
 * Manually trigger a quality check scan (admin only).
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/quality-checks', 'POST', async () => {
    // Rate limit
    const ip = getClientIp(request)
    const rateCheck = checkRateLimit(`admin-quality-run:${ip}`, rateLimits.admin)
    if (!rateCheck.success) return rateLimitResponse(rateCheck)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    if (!hasAdminRole(profile || {})) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Use service role for writes
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const serviceSupabase = createRawClient(supabaseUrl, supabaseServiceKey)

    // Create scan log
    const { data: scanLog, error: scanError } = await serviceSupabase
      .from('vendor_quality_scan_log')
      .insert({ status: 'running' })
      .select('id')
      .single()

    if (scanError || !scanLog) {
      return NextResponse.json({ error: 'Failed to create scan log' }, { status: 500 })
    }

    const batchId = scanLog.id

    try {
      // Supersede old active findings
      await serviceSupabase
        .from('vendor_quality_findings')
        .update({ status: 'superseded' })
        .eq('status', 'active')

      // Run all 5 checks
      const [
        scheduleConflicts,
        lowStockEvents,
        priceAnomalies,
        ghostListings,
        inventoryVelocity,
      ] = await Promise.all([
        checkScheduleConflicts(serviceSupabase),
        checkLowStockEvents(serviceSupabase),
        checkPriceAnomalies(serviceSupabase),
        checkGhostListings(serviceSupabase),
        checkInventoryVelocity(serviceSupabase),
      ])

      const allFindings: QualityFinding[] = [
        ...scheduleConflicts,
        ...lowStockEvents,
        ...priceAnomalies,
        ...ghostListings,
        ...inventoryVelocity,
      ]

      // Check dismissals
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentDismissals } = await serviceSupabase
        .from('vendor_quality_findings')
        .select('vendor_profile_id, check_type, reference_key')
        .eq('status', 'dismissed')
        .gte('dismissed_at', sevenDaysAgo)

      const dismissedKeys = new Set(
        (recentDismissals || []).map(
          d => `${d.vendor_profile_id}:${d.check_type}:${d.reference_key}`
        )
      )

      const filteredFindings = allFindings.filter(
        f => !dismissedKeys.has(`${f.vendor_profile_id}:${f.check_type}:${f.reference_key}`)
      )

      // Insert findings
      let findingsCreated = 0
      if (filteredFindings.length > 0) {
        const rows = filteredFindings.map(f => ({
          ...f,
          batch_id: batchId,
          status: 'active',
        }))

        const { error: insertError } = await serviceSupabase
          .from('vendor_quality_findings')
          .insert(rows)

        if (!insertError) {
          findingsCreated = rows.length
        }
      }

      // Send notifications grouped per vendor
      const vendorFindings = new Map<string, { vertical: string; count: number; findings: QualityFinding[] }>()
      for (const f of filteredFindings) {
        const existing = vendorFindings.get(f.vendor_profile_id)
        if (existing) {
          existing.count++
          existing.findings.push(f)
        } else {
          vendorFindings.set(f.vendor_profile_id, {
            vertical: f.vertical_id,
            count: 1,
            findings: [f],
          })
        }
      }

      const vendorIds = Array.from(vendorFindings.keys())
      let vendorsNotified = 0

      if (vendorIds.length > 0) {
        const { data: vendors } = await serviceSupabase
          .from('vendor_profiles')
          .select('id, user_id')
          .in('id', vendorIds)

        for (const vendor of vendors || []) {
          if (!vendor.user_id) continue
          const vf = vendorFindings.get(vendor.id)
          if (!vf) continue

          const severityIcon: Record<string, string> = {
            action_required: '[!]',
            heads_up: '[i]',
            suggestion: '[~]',
          }
          const summary = vf.findings
            .slice(0, 5)
            .map(f => `${severityIcon[f.severity] || '-'} ${f.title}`)
            .join('\n')

          await sendNotification(vendor.user_id, 'vendor_quality_alert', {
            findingsCount: vf.count,
            findingsSummary: summary,
          }, { vertical: vf.vertical })

          vendorsNotified++
        }
      }

      // Finalize scan log
      const findingsByCheck: Record<string, number> = {
        schedule_conflict: scheduleConflicts.length,
        low_stock_event: lowStockEvents.length,
        price_anomaly: priceAnomalies.length,
        ghost_listing: ghostListings.length,
        inventory_velocity: inventoryVelocity.length,
      }

      await serviceSupabase
        .from('vendor_quality_scan_log')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          vendors_scanned: vendorFindings.size,
          findings_created: findingsCreated,
          findings_by_check: findingsByCheck,
        })
        .eq('id', batchId)

      return NextResponse.json({
        success: true,
        batchId,
        findingsCreated,
        vendorsNotified,
        findingsByCheck,
      })
    } catch (error) {
      await serviceSupabase
        .from('vendor_quality_scan_log')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', batchId)

      return NextResponse.json({
        error: 'Quality checks failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, { status: 500 })
    }
  })
}
