import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { verifyAdminScope } from '@/lib/auth/admin'

/**
 * GET /api/admin/event-ratings
 *
 * Lists event_ratings rows with joins to catering_requests (event name)
 * and user_profiles (reviewer display name). Filterable by status.
 *
 * PATCH /api/admin/event-ratings
 *
 * Updates an event_rating status (approve / hide). Records the
 * moderating admin and timestamp.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/event-ratings', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin-event-ratings:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')

    const scope = await verifyAdminScope(vertical)
    if (!scope?.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const statusFilter = searchParams.get('status')

    const serviceClient = createServiceClient()

    // ⚠ Do NOT try to embed user_profiles here. event_ratings.user_id references
    // auth.users(id) (migration 116:16, and SCHEMA_SNAPSHOT "event_ratings" FK
    // table) — there is NO foreign key between event_ratings and user_profiles,
    // so PostgREST cannot join them and the whole query 500s. It previously read
    // `user:user_profiles!event_ratings_user_id_fkey(...)`, naming a constraint
    // that points at auth.users; the admin page showed "Failed to load event
    // ratings" on EVERY load, empty or not (owner testing 2026-08-06).
    // Reviewer names are resolved in a second query below, keyed user_id → user_id.
    let query = serviceClient
      .from('event_ratings')
      .select(`
        id,
        user_id,
        rating,
        comment,
        status,
        created_at,
        updated_at,
        moderated_at,
        catering_requests!inner (
          id,
          company_name,
          event_token,
          event_date,
          city,
          state,
          vertical_id,
          status
        )
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }
    if (scope.effectiveVerticalId) {
      query = query.eq('catering_requests.vertical_id', scope.effectiveVerticalId)
    }

    const { data: ratings, error: queryError } = await query

    if (queryError) {
      console.error('[/api/admin/event-ratings] query error:', queryError)
      return NextResponse.json({ error: 'Failed to fetch event ratings' }, { status: 500 })
    }

    // Count by status for the filter tabs
    const { data: allRows } = await observed(serviceClient
      .from('event_ratings')
      .select('status'), { table: 'event_ratings' })

    const counts: Record<string, number> = { pending: 0, approved: 0, hidden: 0, total: 0 }
    for (const r of allRows || []) {
      const s = r.status as string
      counts[s] = (counts[s] || 0) + 1
      counts.total++
    }

    // Reviewer names, resolved separately (see the note on the query above).
    // user_profiles.user_id is the auth user id, which is what event_ratings
    // stores — do NOT match on user_profiles.id, a different column.
    const reviewerIds = [...new Set((ratings || []).map(r => r.user_id as string).filter(Boolean))]
    const reviewers = new Map<string, { display_name: string | null; email: string | null }>()
    if (reviewerIds.length > 0) {
      const { data: profiles } = await observed(serviceClient
        .from('user_profiles')
        .select('user_id, display_name, email')
        .in('user_id', reviewerIds), { table: 'user_profiles' })
      for (const p of profiles || []) {
        reviewers.set(p.user_id as string, {
          display_name: p.display_name as string | null,
          email: p.email as string | null,
        })
      }
    }

    const formatted = (ratings || []).map((r) => {
      const event = r.catering_requests as unknown as {
        id: string; company_name: string; event_token: string;
        event_date: string; city: string; state: string;
        vertical_id: string; status: string
      } | null
      const user = reviewers.get(r.user_id as string) ?? null

      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        created_at: r.created_at,
        moderated_at: r.moderated_at,
        event_name: event?.company_name || 'Unknown event',
        event_token: event?.event_token || null,
        event_date: event?.event_date || null,
        event_city: event?.city || null,
        event_state: event?.state || null,
        event_vertical: event?.vertical_id || null,
        event_status: event?.status || null,
        reviewer_name: user?.display_name || 'Anonymous',
        reviewer_email: user?.email || null,
      }
    })

    return NextResponse.json({
      ratings: formatted,
      counts,
    })
  })
}

export async function PATCH(request: NextRequest) {
  return withErrorTracing('/api/admin/event-ratings', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin-event-ratings-patch:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const scope = await verifyAdminScope(null)
    if (!scope?.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // PATCH is platform-admin only (moderation applies across verticals + the
    // update targets ratings by bare id with no vertical scoping). ADM-4: the
    // authorized check above passes single-vertical vertical admins via
    // verifyAdminScope's fallback, so without this the comment lied — a vertical
    // admin could moderate ANY vertical's public ratings. Enforce it.
    if (!scope.isPlatformAdmin) {
      return NextResponse.json({ error: 'Rating moderation is restricted to platform admins' }, { status: 403 })
    }

    let id: string
    let newStatus: string
    try {
      const body = await request.json()
      id = body.id
      newStatus = body.status

      if (!id || !newStatus) {
        return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
      }
      if (!['approved', 'hidden', 'pending'].includes(newStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Get admin user ID for the moderated_by field
    const { createClient } = await import('@/lib/supabase/server')
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()

    const updateData: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'approved' || newStatus === 'hidden') {
      updateData.moderated_at = new Date().toISOString()
      updateData.moderated_by = user?.id || null
    } else {
      updateData.moderated_at = null
      updateData.moderated_by = null
    }

    const { data: updated, error: updateError } = await serviceClient
      .from('event_ratings')
      .update(updateData)
      .eq('id', id)
      .select('id, status, moderated_at')
      .single()

    if (updateError) {
      console.error('[/api/admin/event-ratings] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update rating' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      rating: updated,
    })
  })
}
