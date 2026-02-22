import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

// POST - Submit vendor feedback
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/feedback', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-feedback-post:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const body = await request.json()
      const { vertical, category, message, market_name, market_location, market_schedule } = body

      // Validate required fields
      if (!vertical || !category || !message) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }

      // Validate category
      const validCategories = ['suggest_market', 'technical_problem', 'feature_request', 'payment_issue', 'order_management', 'listing_help', 'general_feedback']
      if (!validCategories.includes(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
      }

      // Get vendor profile
      const { data: vendorProfile, error: vpError } = await supabase
        .from('vendor_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('vertical_id', vertical)
        .single()

      if (vpError || !vendorProfile) {
        return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
      }

      // For market suggestions, require market name and location
      if (category === 'suggest_market') {
        if (!market_name || !market_location) {
          return NextResponse.json({ error: 'Market name and location are required for market suggestions' }, { status: 400 })
        }
      }

      // Insert feedback
      const { data: feedback, error: insertError } = await supabase
        .from('vendor_feedback')
        .insert({
          vendor_profile_id: vendorProfile.id,
          user_id: user.id,
          vertical_id: vertical,
          category,
          message: message.trim(),
          market_name: market_name?.trim() || null,
          market_location: market_location?.trim() || null,
          market_schedule: market_schedule?.trim() || null,
          status: 'new'
        })
        .select()
        .single()

      if (insertError) {
        console.error('[/api/vendor/feedback] Error submitting feedback:', insertError)
        return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        feedback: {
          id: feedback.id,
          category: feedback.category,
          created_at: feedback.created_at
        },
        message: 'Thank you for your feedback! We appreciate you helping us improve the platform.'
      }, { status: 201 })

    } catch (error) {
      console.error('[/api/vendor/feedback] Unexpected error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}

// GET - Get vendor's own feedback history
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/feedback', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-feedback-get:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { searchParams } = new URL(request.url)
      const vertical = searchParams.get('vertical')

      let query = supabase
        .from('vendor_feedback')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (vertical) {
        query = query.eq('vertical_id', vertical)
      }

      const { data: feedback, error: fetchError } = await query

      if (fetchError) {
        console.error('[/api/vendor/feedback] Error fetching feedback:', fetchError)
        return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 })
      }

      return NextResponse.json({ feedback: feedback || [] })

    } catch (error) {
      console.error('[/api/vendor/feedback] Unexpected error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
