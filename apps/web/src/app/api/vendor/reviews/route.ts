import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

// GET /api/vendor/reviews - Get reviews for the vendor
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/reviews', 'GET', async () => {
    const supabase = await createClient()

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const vertical = searchParams.get('vertical')

    if (!vertical) {
      return NextResponse.json({ error: 'Vertical is required' }, { status: 400 })
    }

    // Get vendor profile
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id, average_rating, rating_count')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Get all reviews for this vendor
    const { data: reviews, error: reviewsError } = await supabase
      .from('order_ratings')
      .select(`
        id,
        rating,
        comment,
        created_at,
        order_id,
        orders (
          id,
          order_number,
          created_at
        )
      `)
      .eq('vendor_profile_id', vendorProfile.id)
      .order('created_at', { ascending: false })

    if (reviewsError) {
      console.error('Error fetching reviews:', reviewsError)
      return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
    }

    // Get count of unread reviews (created in last 7 days that haven't been "viewed")
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const newReviewsCount = (reviews || []).filter(r =>
      new Date(r.created_at) > sevenDaysAgo
    ).length

    return NextResponse.json({
      reviews: reviews || [],
      summary: {
        averageRating: vendorProfile.average_rating,
        totalReviews: vendorProfile.rating_count || 0,
        newReviewsCount
      }
    })
  })
}
