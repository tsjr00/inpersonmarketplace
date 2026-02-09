import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

/**
 * GET /api/admin/vendor-activity/settings
 *
 * Get activity monitoring settings
 *
 * Query params:
 * - vertical: Get settings for a specific vertical (defaults to first found)
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/vendor-activity/settings', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is admin
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const verticalId = searchParams.get('vertical')

    try {
      let query = supabase
        .from('vendor_activity_settings')
        .select('*')

      if (verticalId) {
        query = query.eq('vertical_id', verticalId)
      }

      const { data: settings, error } = await query

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Also get recent scan logs
      const { data: scanLogs } = await supabase
        .from('vendor_activity_scan_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10)

      return NextResponse.json({
        settings: settings || [],
        recentScans: scanLogs || []
      })

    } catch (error) {
      console.error('[VENDOR-ACTIVITY-SETTINGS] Error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({
        error: 'Failed to fetch settings',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  })
}

/**
 * PUT /api/admin/vendor-activity/settings
 *
 * Update activity monitoring settings for a vertical
 *
 * Body:
 * - verticalId: string (required)
 * - monitoringEnabled: boolean
 * - daysNoLoginThreshold: number
 * - daysNoOrdersThreshold: number
 * - daysNoListingActivityThreshold: number
 * - daysIncompleteOnboardingThreshold: number
 * - checkNoLogin: boolean
 * - checkNoOrders: boolean
 * - checkNoListingActivity: boolean
 * - checkNoPublishedListings: boolean
 * - checkIncompleteOnboarding: boolean
 */
export async function PUT(request: NextRequest) {
  return withErrorTracing('/api/admin/vendor-activity/settings', 'PUT', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is admin
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { verticalId, ...updates } = body

    if (!verticalId) {
      return NextResponse.json({ error: 'verticalId is required' }, { status: 400 })
    }

    try {
      // Map camelCase to snake_case
      const dbUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: user.id
      }

      if (updates.monitoringEnabled !== undefined) {
        dbUpdates.monitoring_enabled = updates.monitoringEnabled
      }
      if (updates.daysNoLoginThreshold !== undefined) {
        dbUpdates.days_no_login_threshold = updates.daysNoLoginThreshold
      }
      if (updates.daysNoOrdersThreshold !== undefined) {
        dbUpdates.days_no_orders_threshold = updates.daysNoOrdersThreshold
      }
      if (updates.daysNoListingActivityThreshold !== undefined) {
        dbUpdates.days_no_listing_activity_threshold = updates.daysNoListingActivityThreshold
      }
      if (updates.daysIncompleteOnboardingThreshold !== undefined) {
        dbUpdates.days_incomplete_onboarding_threshold = updates.daysIncompleteOnboardingThreshold
      }
      if (updates.checkNoLogin !== undefined) {
        dbUpdates.check_no_login = updates.checkNoLogin
      }
      if (updates.checkNoOrders !== undefined) {
        dbUpdates.check_no_orders = updates.checkNoOrders
      }
      if (updates.checkNoListingActivity !== undefined) {
        dbUpdates.check_no_listing_activity = updates.checkNoListingActivity
      }
      if (updates.checkNoPublishedListings !== undefined) {
        dbUpdates.check_no_published_listings = updates.checkNoPublishedListings
      }
      if (updates.checkIncompleteOnboarding !== undefined) {
        dbUpdates.check_incomplete_onboarding = updates.checkIncompleteOnboarding
      }

      // Upsert settings
      const { data: settings, error } = await supabase
        .from('vendor_activity_settings')
        .upsert({
          vertical_id: verticalId,
          ...dbUpdates
        }, {
          onConflict: 'vertical_id'
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        settings
      })

    } catch (error) {
      console.error('[VENDOR-ACTIVITY-SETTINGS] Error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({
        error: 'Failed to update settings',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  })
}
