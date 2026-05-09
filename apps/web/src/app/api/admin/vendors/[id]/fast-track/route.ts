import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { TRIAL_SYSTEM_ENABLED } from '@/lib/vendor-limits'
import { logPublicActivityEvent } from '@/lib/marketing/activity-events'

/**
 * POST /api/admin/vendors/[id]/fast-track
 *
 * Admin override that approves ALL THREE onboarding gates and stamps
 * `onboarding_completed_at` in a single action. Use case: admin meets a
 * vendor in person at an onboarding event, has seen all paperwork, and
 * wants to skip the per-gate review flow.
 *
 * Body: { notes?: string }
 *   - notes: optional admin reason; appended to existing verification notes
 *     with an "Admin fast-track override" prefix so the audit trail is clear.
 *
 * Effect:
 *   - vendor_verifications.status                  = 'approved'  (Gate 1)
 *   - vendor_verifications.category_verifications  = all current categories
 *                                                    set to 'approved'
 *                                                    (Gate 2; preserves docs)
 *   - vendor_verifications.coi_status              = 'approved'  (Gate 3)
 *   - vendor_verifications.coi_verified_at         = NOW
 *   - vendor_verifications.coi_verified_by         = admin's user_profile.id
 *   - vendor_verifications.onboarding_completed_at = NOW
 *   - vendor_profiles.status                       = 'approved'
 *   - vendor_profiles.approved_at                  = NOW
 *   - vendor_profiles trial fields                 = set if eligible (mirror /approve)
 *
 * Single notification: vendor_approved or vendor_approved_trial (matches /approve).
 * Public activity event 'new_vendor' logged on first-time approval.
 *
 * Returns 400 if onboarding is already complete (idempotency guard).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendors/[id]/fast-track', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: vendorId } = await params

    crumb.auth('Checking admin auth for fast-track')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Admin role check (platform admin OR vertical admin for this vendor's vertical)
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id, role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    let isAdmin = hasAdminRole(userProfile || {})
    if (!isAdmin) {
      const { data: vendorRow } = await supabase
        .from('vendor_profiles')
        .select('vertical_id')
        .eq('id', vendorId)
        .single()
      if (vendorRow) {
        const { data: va } = await supabase
          .from('vertical_admins')
          .select('id')
          .eq('user_id', user.id)
          .eq('vertical_id', vendorRow.vertical_id)
          .single()
        isAdmin = !!va
      }
    }
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const adminNotes = typeof body?.notes === 'string' ? body.notes.trim() : ''

    const serviceClient = createServiceClient()

    // Read current state — both vendor_profiles + vendor_verifications
    crumb.supabase('select', 'vendor_verifications')
    const { data: verification } = await serviceClient
      .from('vendor_verifications')
      .select('status, category_verifications, coi_status, onboarding_completed_at, notes')
      .eq('vendor_profile_id', vendorId)
      .maybeSingle()

    if (!verification) {
      return NextResponse.json({ error: 'Verification record not found' }, { status: 404 })
    }

    if (verification.onboarding_completed_at) {
      return NextResponse.json(
        { error: 'Vendor onboarding is already complete — fast-track is not applicable.' },
        { status: 400 }
      )
    }

    crumb.supabase('select', 'vendor_profiles')
    const { data: existingVendor } = await serviceClient
      .from('vendor_profiles')
      .select('vertical_id, trial_started_at, status, user_id, profile_data')
      .eq('id', vendorId)
      .maybeSingle()

    if (!existingVendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    const now = new Date().toISOString()

    // ── Build new category_verifications: every existing category → 'approved' ──
    // Preserves any docs / doc_type / prior notes; only overrides status + reviewer.
    const existingCats = (verification.category_verifications || {}) as Record<string, Record<string, unknown>>
    const updatedCats: Record<string, Record<string, unknown>> = {}
    for (const [cat, prior] of Object.entries(existingCats)) {
      updatedCats[cat] = {
        ...prior,
        status: 'approved',
        reviewed_at: now,
        reviewed_by: user.id,
      }
    }

    // ── Build verification notes: preserve prior + append override marker ──
    const overrideNote = adminNotes
      ? `Admin fast-track override: ${adminNotes}`
      : 'Admin fast-track override'
    const newNotes = verification.notes
      ? `${verification.notes}\n\n${overrideNote}`
      : overrideNote

    // ── Update vendor_verifications: all 3 gates + onboarding_completed_at ──
    crumb.supabase('update', 'vendor_verifications')
    const { error: verifUpdateError } = await serviceClient
      .from('vendor_verifications')
      .update({
        status: 'approved',
        category_verifications: updatedCats,
        coi_status: 'approved',
        coi_verified_at: now,
        coi_verified_by: userProfile!.id,
        onboarding_completed_at: now,
        notes: newNotes,
        reviewed_by: userProfile!.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('vendor_profile_id', vendorId)

    if (verifUpdateError) {
      throw traced.fromSupabase(verifUpdateError, {
        table: 'vendor_verifications',
        operation: 'update',
      })
    }

    // ── Update vendor_profiles directly: status + approved_at + trial fields ──
    // Note: sync_verification_status() trigger only fires for status='submitted'
    // → 'approved'. Vendors in 'pending' or other states need this explicit update.
    // Trial logic mirrors the /approve endpoint exactly.
    const isTrialEligible = TRIAL_SYSTEM_ENABLED && !existingVendor.trial_started_at
    const profileUpdate: Record<string, unknown> = {
      status: 'approved',
      approved_at: now,
      updated_at: now,
    }
    if (isTrialEligible) {
      const trialEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      const graceEnd = new Date(trialEnd.getTime() + 14 * 24 * 60 * 60 * 1000)
      profileUpdate.tier = 'free'
      profileUpdate.subscription_status = 'trialing'
      profileUpdate.trial_started_at = now
      profileUpdate.trial_ends_at = trialEnd.toISOString()
      profileUpdate.trial_grace_ends_at = graceEnd.toISOString()
      profileUpdate.tier_started_at = now
    }

    crumb.supabase('update', 'vendor_profiles')
    const { error: profileUpdateError } = await serviceClient
      .from('vendor_profiles')
      .update(profileUpdate)
      .eq('id', vendorId)

    if (profileUpdateError) {
      throw traced.fromSupabase(profileUpdateError, {
        table: 'vendor_profiles',
        operation: 'update',
      })
    }

    // ── Notify vendor (single notification, mirrors /approve) ──
    const profileData = existingVendor.profile_data as Record<string, unknown> | null
    const businessName =
      (profileData?.business_name as string) ||
      (profileData?.farm_name as string) ||
      'Your business'
    const vendorEmail = profileData?.email as string | undefined

    if (existingVendor.user_id) {
      const notifyOpts = {
        vertical: existingVendor.vertical_id,
        ...(vendorEmail ? { userEmail: vendorEmail } : {}),
      }
      if (isTrialEligible) {
        await sendNotification(
          existingVendor.user_id,
          'vendor_approved_trial',
          {
            vendorName: businessName,
            vendorId,
            trialTier: 'Free',
            trialDays: 90,
          },
          notifyOpts
        )
      } else {
        await sendNotification(
          existingVendor.user_id,
          'vendor_approved',
          { vendorName: businessName, vendorId },
          notifyOpts
        )
      }
    }

    // ── Public activity event for social proof (mirrors /verify Gate 1 approval) ──
    if (existingVendor.vertical_id) {
      await logPublicActivityEvent({
        vertical_id: existingVendor.vertical_id,
        event_type: 'new_vendor',
        vendor_display_name: businessName,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Vendor fast-tracked: all 3 gates approved + onboarding complete',
      onboarding_completed_at: now,
      trial_granted: isTrialEligible,
    })
  })
}
