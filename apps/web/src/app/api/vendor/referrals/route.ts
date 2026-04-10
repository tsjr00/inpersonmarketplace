import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/referrals', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-referrals:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Multi-vertical safe vendor profile lookup via shared utility
    const vertical = request.nextUrl.searchParams.get('vertical')
    const { profile: vendorProfile } = await getVendorProfileForVertical<{
      id: string
      referral_code: string | null
      deleted_at: string | null
    }>(supabase, user.id, vertical, 'id, referral_code, deleted_at')

    if (!vendorProfile || vendorProfile.deleted_at !== null) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Get referral credits for this vendor (as referrer)
    const { data: referralCredits } = await supabase
      .from('vendor_referral_credits')
      .select(`
        id,
        credit_amount_cents,
        status,
        created_at,
        earned_at,
        applied_at,
        expires_at,
        referred_vendor:vendor_profiles!vendor_referral_credits_referred_vendor_id_fkey (
          id,
          profile_data
        )
      `)
      .eq('referrer_vendor_id', vendorProfile.id)
      .order('created_at', { ascending: false })

    // Calculate summary stats
    const credits = referralCredits || []

    const pendingCount = credits.filter(c => c.status === 'pending').length
    const earnedCredits = credits.filter(c => c.status === 'earned')
    const appliedCredits = credits.filter(c => c.status === 'applied')

    const availableBalanceCents = earnedCredits.reduce((sum, c) => sum + c.credit_amount_cents, 0)
    const pendingBalanceCents = credits
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.credit_amount_cents, 0)

    // Calculate year-to-date earned
    const yearStart = new Date()
    yearStart.setMonth(0, 1)
    yearStart.setHours(0, 0, 0, 0)

    const yearEarnedCents = credits
      .filter(c =>
        (c.status === 'earned' || c.status === 'applied') &&
        c.earned_at &&
        new Date(c.earned_at) >= yearStart
      )
      .reduce((sum, c) => sum + c.credit_amount_cents, 0)

    const annualCapCents = 10000 // $100/year
    const remainingCapCents = Math.max(0, annualCapCents - yearEarnedCents)

    // Format referrals for display
    const referrals = credits.map(c => {
      const vendorData = c.referred_vendor as { profile_data?: Record<string, unknown> } | null
      const profileData = vendorData?.profile_data || {}

      return {
        id: c.id,
        vendorName: profileData.farm_name || profileData.business_name || 'New Vendor',
        status: c.status,
        creditAmountCents: c.credit_amount_cents,
        createdAt: c.created_at,
        earnedAt: c.earned_at,
        appliedAt: c.applied_at,
        expiresAt: c.expires_at,
      }
    })

    return NextResponse.json({
      referralCode: vendorProfile.referral_code,
      summary: {
        pendingCount,
        earnedCount: earnedCredits.length,
        appliedCount: appliedCredits.length,
        availableBalanceCents,
        pendingBalanceCents,
        yearEarnedCents,
        annualCapCents,
        remainingCapCents,
      },
      referrals,
    })
  })
}
