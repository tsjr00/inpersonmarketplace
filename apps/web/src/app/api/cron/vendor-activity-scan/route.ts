import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'

interface ScanResult {
  scan_id: string
  vendors_scanned: number
  new_flags: number
  auto_resolved: number
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const buf = Buffer.from(a)
    timingSafeEqual(buf, buf)
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Cron endpoint to scan vendor activity and flag inactive vendors
 *
 * Called by Vercel Cron nightly (configured in vercel.json)
 *
 * Query params:
 * - vertical: Optional vertical ID to scan (defaults to all)
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/vendor-activity-scan', 'GET', async () => {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[VENDOR-ACTIVITY-SCAN] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const expectedAuth = `Bearer ${cronSecret}`
    if (!authHeader || !safeCompare(authHeader, expectedAuth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service role for admin operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[VENDOR-ACTIVITY-SCAN] Missing Supabase credentials')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get optional vertical filter
    const { searchParams } = new URL(request.url)
    const verticalId = searchParams.get('vertical') || null

    try {
      // Call the database function to run the scan
      const { data, error } = await supabase
        .rpc('scan_vendor_activity', { p_vertical_id: verticalId })
        .single()

      if (error) {
        console.error('[VENDOR-ACTIVITY-SCAN] Scan failed:', error.message)
        return NextResponse.json({
          error: 'Scan failed',
          details: error.message
        }, { status: 500 })
      }

      const result = data as ScanResult

      return NextResponse.json({
        success: true,
        scanId: result.scan_id,
        vendorsScanned: result.vendors_scanned,
        newFlags: result.new_flags,
        autoResolved: result.auto_resolved,
        verticalId: verticalId || 'all'
      })

    } catch (error) {
      console.error('[VENDOR-ACTIVITY-SCAN] Error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({
        error: 'Failed to run vendor activity scan',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  })
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
