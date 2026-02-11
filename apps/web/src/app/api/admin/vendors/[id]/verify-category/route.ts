import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'
import { CATEGORIES } from '@/lib/constants'

/**
 * POST /api/admin/vendors/[id]/verify-category
 *
 * Admin approves or rejects per-category document verification (Gate 2).
 * Body: { category: string, action: 'approve' | 'reject', notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendors/[id]/verify-category', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: vendorId } = await params

    crumb.auth('Checking admin auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Verify admin role
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    let isAdmin = hasAdminRole(userProfile || {})
    if (!isAdmin) {
      const { data: vendor } = await supabase
        .from('vendor_profiles')
        .select('vertical_id')
        .eq('id', vendorId)
        .single()
      if (vendor) {
        const { data: va } = await supabase
          .from('vertical_admins')
          .select('id')
          .eq('user_id', user.id)
          .eq('vertical_id', vendor.vertical_id)
          .single()
        isAdmin = !!va
      }
    }
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { category, action, notes } = await request.json()

    if (!category || !CATEGORIES.includes(category)) {
      throw traced.validation('ERR_VALIDATION_001', 'Invalid category')
    }
    if (!action || !['approve', 'reject'].includes(action)) {
      throw traced.validation('ERR_VALIDATION_001', 'action must be "approve" or "reject"')
    }

    const serviceClient = createServiceClient()

    // Get current category_verifications
    crumb.supabase('select', 'vendor_verifications')
    const { data: verification } = await serviceClient
      .from('vendor_verifications')
      .select('category_verifications')
      .eq('vendor_profile_id', vendorId)
      .single()

    if (!verification) {
      return NextResponse.json({ error: 'Verification record not found' }, { status: 404 })
    }

    const catVerifications = (verification.category_verifications || {}) as Record<string, Record<string, unknown>>
    const existing = catVerifications[category] || {}

    catVerifications[category] = {
      ...existing,
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      notes: notes || null,
    }

    crumb.supabase('update', 'vendor_verifications')
    const { error: updateError } = await serviceClient
      .from('vendor_verifications')
      .update({
        category_verifications: catVerifications,
        updated_at: new Date().toISOString(),
      })
      .eq('vendor_profile_id', vendorId)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_verifications', operation: 'update' })
    }

    // Notify vendor
    const { data: vendor } = await serviceClient
      .from('vendor_profiles')
      .select('user_id, vertical_id')
      .eq('id', vendorId)
      .single()

    if (vendor?.user_id) {
      await sendNotification(
        vendor.user_id,
        action === 'approve' ? 'vendor_approved' : 'vendor_rejected',
        {},
        { vertical: vendor.vertical_id }
      )
    }

    return NextResponse.json({ success: true, category, status: action === 'approve' ? 'approved' : 'rejected' })
  })
}
