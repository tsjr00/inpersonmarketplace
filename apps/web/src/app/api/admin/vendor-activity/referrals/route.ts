import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { hasAdminRole } from '@/lib/auth/admin'

/**
 * GET /api/admin/vendor-activity/referrals
 *
 * Get referral statistics and top referrers for admin dashboard
 *
 * Query params:
 * - vertical: Filter by vertical ID
 * - limit: Number of top referrers to return (default 20)
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/vendor-activity/referrals', 'GET', async () => {
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
      .is('deleted_at', null)
      .single()

    const isAdmin = hasAdminRole(userProfile || {})
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const verticalId = searchParams.get('vertical')
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    try {
      // Get overall stats
      const { data: allCredits } = await supabase
        .from('vendor_referral_credits')
        .select('status, credit_amount_cents')

      const stats = {
        totalReferrals: allCredits?.length || 0,
        pendingCount: 0,
        earnedCount: 0,
        appliedCount: 0,
        expiredCount: 0,
        voidedCount: 0,
        totalPendingCents: 0,
        totalEarnedCents: 0,
        totalAppliedCents: 0,
      }

      allCredits?.forEach(credit => {
        const amount = credit.credit_amount_cents || 0
        switch (credit.status) {
          case 'pending':
            stats.pendingCount++
            stats.totalPendingCents += amount
            break
          case 'earned':
            stats.earnedCount++
            stats.totalEarnedCents += amount
            break
          case 'applied':
            stats.appliedCount++
            stats.totalAppliedCents += amount
            break
          case 'expired':
            stats.expiredCount++
            break
          case 'voided':
            stats.voidedCount++
            break
        }
      })

      // Get top referrers with their referral counts
      // First get all credits grouped by referrer
      const { data: creditsByReferrer } = await supabase
        .from('vendor_referral_credits')
        .select(`
          referrer_vendor_id,
          status,
          credit_amount_cents,
          referrer:vendor_profiles!vendor_referral_credits_referrer_vendor_id_fkey (
            id,
            vertical_id,
            profile_data,
            user_profiles!vendor_profiles_user_id_fkey (
              email
            )
          )
        `)
        .in('status', ['earned', 'applied', 'pending'])

      // Aggregate by referrer
      const referrerMap = new Map<string, {
        vendorId: string
        verticalId: string
        businessName: string
        email: string | null
        totalReferrals: number
        earnedReferrals: number
        pendingReferrals: number
        totalEarnedCents: number
        totalPendingCents: number
      }>()

      creditsByReferrer?.forEach(credit => {
        const referrer = credit.referrer as any
        if (!referrer) return

        // Filter by vertical if specified
        if (verticalId && referrer.vertical_id !== verticalId) return

        const profileData = referrer.profile_data as Record<string, unknown> | null
        const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Unknown'
        const email = referrer.user_profiles?.email || (profileData?.email as string) || null

        const existing = referrerMap.get(referrer.id) || {
          vendorId: referrer.id,
          verticalId: referrer.vertical_id,
          businessName,
          email,
          totalReferrals: 0,
          earnedReferrals: 0,
          pendingReferrals: 0,
          totalEarnedCents: 0,
          totalPendingCents: 0,
        }

        existing.totalReferrals++
        if (credit.status === 'earned' || credit.status === 'applied') {
          existing.earnedReferrals++
          existing.totalEarnedCents += credit.credit_amount_cents || 0
        } else if (credit.status === 'pending') {
          existing.pendingReferrals++
          existing.totalPendingCents += credit.credit_amount_cents || 0
        }

        referrerMap.set(referrer.id, existing)
      })

      // Sort by total earned referrals, then by pending
      const topReferrers = Array.from(referrerMap.values())
        .sort((a, b) => {
          if (b.earnedReferrals !== a.earnedReferrals) {
            return b.earnedReferrals - a.earnedReferrals
          }
          return b.pendingReferrals - a.pendingReferrals
        })
        .slice(0, limit)

      // Get recent referrals for activity feed
      const { data: recentReferrals } = await supabase
        .from('vendor_referral_credits')
        .select(`
          id,
          status,
          credit_amount_cents,
          created_at,
          earned_at,
          applied_at,
          referrer:vendor_profiles!vendor_referral_credits_referrer_vendor_id_fkey (
            id,
            profile_data
          ),
          referred:vendor_profiles!vendor_referral_credits_referred_vendor_id_fkey (
            id,
            profile_data
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20)

      const formattedRecentReferrals = recentReferrals?.map(ref => {
        const referrer = ref.referrer as any
        const referred = ref.referred as any
        const referrerData = referrer?.profile_data as Record<string, unknown> | null
        const referredData = referred?.profile_data as Record<string, unknown> | null

        return {
          id: ref.id,
          status: ref.status,
          creditAmountCents: ref.credit_amount_cents,
          createdAt: ref.created_at,
          earnedAt: ref.earned_at,
          appliedAt: ref.applied_at,
          referrerName: (referrerData?.business_name as string) || (referrerData?.farm_name as string) || 'Unknown',
          referredName: (referredData?.business_name as string) || (referredData?.farm_name as string) || 'Unknown',
        }
      })

      return NextResponse.json({
        stats,
        topReferrers,
        recentReferrals: formattedRecentReferrals || []
      })

    } catch (error) {
      console.error('[ADMIN-REFERRALS] Error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({
        error: 'Failed to fetch referral data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  })
}
