import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Get all feedback (admin only)
export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    if (profileError || !userProfile || (userProfile.role !== 'admin' && !userProfile.roles?.includes('admin'))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')
    const category = searchParams.get('category')
    const status = searchParams.get('status')

    let query = supabase
      .from('shopper_feedback')
      .select('*')
      .order('created_at', { ascending: false })

    if (vertical) {
      query = query.eq('vertical_id', vertical)
    }
    if (category) {
      query = query.eq('category', category)
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data: feedback, error: fetchError } = await query

    if (fetchError) {
      console.error('[/api/admin/feedback] Error fetching feedback:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 })
    }

    // Get user emails for feedback items
    const userIds = [...new Set((feedback || []).map(f => f.user_id))]
    let userMap: Record<string, string> = {}

    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('user_profiles')
        .select('user_id, email')
        .in('user_id', userIds)

      if (users) {
        users.forEach(u => {
          userMap[u.user_id] = u.email || 'Unknown'
        })
      }
    }

    // Transform to include user email
    const transformedFeedback = (feedback || []).map(f => ({
      ...f,
      user_email: userMap[f.user_id] || 'Unknown'
    }))

    // Get counts by status
    const counts = {
      new: (feedback || []).filter(f => f.status === 'new').length,
      in_review: (feedback || []).filter(f => f.status === 'in_review').length,
      resolved: (feedback || []).filter(f => f.status === 'resolved').length,
      closed: (feedback || []).filter(f => f.status === 'closed').length,
      total: (feedback || []).length
    }

    return NextResponse.json({ feedback: transformedFeedback, counts })

  } catch (error) {
    console.error('[/api/admin/feedback] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update feedback status/notes (admin only)
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    if (profileError || !userProfile || (userProfile.role !== 'admin' && !userProfile.roles?.includes('admin'))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { id, status, admin_notes } = body

    if (!id) {
      return NextResponse.json({ error: 'Feedback ID required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (status) {
      const validStatuses = ['new', 'in_review', 'resolved', 'closed']
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updateData.status = status
      if (status === 'resolved' || status === 'closed') {
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = user.id
      }
    }
    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes
    }

    const { data: feedback, error: updateError } = await supabase
      .from('shopper_feedback')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[/api/admin/feedback] Error updating feedback:', updateError)
      return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 })
    }

    return NextResponse.json({ success: true, feedback })

  } catch (error) {
    console.error('[/api/admin/feedback] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
