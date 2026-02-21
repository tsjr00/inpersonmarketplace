import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import {
  checkScheduleConflicts,
  checkLowStockEvents,
  checkPriceAnomalies,
  checkGhostListings,
  checkInventoryVelocity,
  type QualityFinding,
} from '@/lib/quality-checks'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const buf = Buffer.from(a)
    timingSafeEqual(buf, buf)
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Nightly vendor quality checks cron.
 *
 * Runs 5 checks against vendor data, creates findings, and sends
 * one grouped notification per vendor.
 *
 * Schedule: 0 10 * * * (10am UTC = 4am CT)
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/vendor-quality-checks', 'GET', async () => {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[VENDOR-QUALITY] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const expectedAuth = `Bearer ${cronSecret}`
    if (!authHeader || !safeCompare(authHeader, expectedAuth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[VENDOR-QUALITY] Missing Supabase credentials')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Step 1: Create scan log entry
    const { data: scanLog, error: scanError } = await supabase
      .from('vendor_quality_scan_log')
      .insert({ status: 'running' })
      .select('id')
      .single()

    if (scanError || !scanLog) {
      console.error('[VENDOR-QUALITY] Failed to create scan log:', scanError?.message)
      return NextResponse.json({ error: 'Failed to create scan log' }, { status: 500 })
    }

    const batchId = scanLog.id

    try {
      // Step 2: Mark all previous 'active' findings as 'superseded'
      await supabase
        .from('vendor_quality_findings')
        .update({ status: 'superseded' })
        .eq('status', 'active')

      // Step 3: Run all 5 checks in parallel
      const [
        scheduleConflicts,
        lowStockEvents,
        priceAnomalies,
        ghostListings,
        inventoryVelocity,
      ] = await Promise.all([
        checkScheduleConflicts(supabase),
        checkLowStockEvents(supabase),
        checkPriceAnomalies(supabase),
        checkGhostListings(supabase),
        checkInventoryVelocity(supabase),
      ])

      const allFindings: QualityFinding[] = [
        ...scheduleConflicts,
        ...lowStockEvents,
        ...priceAnomalies,
        ...ghostListings,
        ...inventoryVelocity,
      ]

      // Step 4: Check dismissals — skip findings the vendor dismissed within 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentDismissals } = await supabase
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

      // Step 5: Insert new findings
      let findingsCreated = 0
      if (filteredFindings.length > 0) {
        const rows = filteredFindings.map(f => ({
          ...f,
          batch_id: batchId,
          status: 'active',
        }))

        const { error: insertError } = await supabase
          .from('vendor_quality_findings')
          .insert(rows)

        if (insertError) {
          console.error('[VENDOR-QUALITY] Insert findings failed:', insertError.message)
        } else {
          findingsCreated = rows.length
        }
      }

      // Step 6: Group findings per vendor, send one notification each
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

      // Get vendor user_ids for notification
      const vendorIds = Array.from(vendorFindings.keys())
      let vendorsNotified = 0

      if (vendorIds.length > 0) {
        const { data: vendors } = await supabase
          .from('vendor_profiles')
          .select('id, user_id')
          .in('id', vendorIds)

        for (const vendor of vendors || []) {
          if (!vendor.user_id) continue
          const vf = vendorFindings.get(vendor.id)
          if (!vf) continue

          // Build summary
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

      // Step 7: Finalize scan log
      const findingsByCheck: Record<string, number> = {
        schedule_conflict: scheduleConflicts.length,
        low_stock_event: lowStockEvents.length,
        price_anomaly: priceAnomalies.length,
        ghost_listing: ghostListings.length,
        inventory_velocity: inventoryVelocity.length,
      }

      await supabase
        .from('vendor_quality_scan_log')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          vendors_scanned: vendorFindings.size,
          findings_created: findingsCreated,
          findings_by_check: findingsByCheck,
        })
        .eq('id', batchId)

      console.log(`[VENDOR-QUALITY] Completed: ${findingsCreated} findings for ${vendorsNotified} vendors`)

      return NextResponse.json({
        success: true,
        batchId,
        findingsCreated,
        vendorsNotified,
        findingsByCheck,
      })
    } catch (error) {
      // Mark scan as failed
      await supabase
        .from('vendor_quality_scan_log')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', batchId)

      console.error('[VENDOR-QUALITY] Error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({
        error: 'Quality checks failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, { status: 500 })
    }
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
