import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'
import { crumb } from '@/lib/errors/breadcrumbs'
import {
  getCategoryRequirement,
  requiresDocuments,
} from '@/lib/onboarding/category-requirements'
import type { Category } from '@/lib/constants'

interface CategoryStatus {
  requirementLevel: string
  status: 'not_required' | 'not_submitted' | 'pending' | 'approved' | 'rejected'
  label: string
  documents: unknown[]
}

export async function GET() {
  return withErrorTracing('/api/vendor/onboarding/status', 'GET', async () => {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    crumb.logic('Fetching vendor profile')
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, status, user_id')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'No vendor profile found' }, { status: 404 })
    }

    crumb.logic('Fetching verification record')
    const { data: verification } = await supabase
      .from('vendor_verifications')
      .select('*')
      .eq('vendor_profile_id', vendor.id)
      .single()

    if (!verification) {
      return NextResponse.json({ error: 'No verification record found' }, { status: 404 })
    }

    // Gate 1: Vendor Approved (business docs reviewed by admin)
    const businessDocs = Array.isArray(verification.documents) ? verification.documents : []
    const gate1 = {
      businessDocsUploaded: businessDocs.length > 0,
      status: verification.status as string,
      notes: verification.notes as string | null,
      reviewedAt: verification.reviewed_at as string | null,
    }

    // Gate 2: Category Authorized (per-category doc verification)
    const requestedCategories = (verification.requested_categories || []) as string[]
    const categoryVerifications = (verification.category_verifications || {}) as Record<string, {
      status: string
      doc_type?: string
      documents?: unknown[]
      reviewed_at?: string
      notes?: string
    }>

    const categoryStatuses: Record<string, CategoryStatus> = {}
    for (const cat of requestedCategories) {
      const requirement = getCategoryRequirement(cat as Category)
      const catVerification = categoryVerifications[cat]

      if (!requiresDocuments(cat as Category)) {
        categoryStatuses[cat] = {
          requirementLevel: requirement.level,
          status: 'not_required',
          label: requirement.label,
          documents: [],
        }
      } else if (catVerification) {
        categoryStatuses[cat] = {
          requirementLevel: requirement.level,
          status: catVerification.status as CategoryStatus['status'],
          label: requirement.label,
          documents: catVerification.documents || [],
        }
      } else {
        categoryStatuses[cat] = {
          requirementLevel: requirement.level,
          status: 'not_submitted',
          label: requirement.label,
          documents: [],
        }
      }
    }

    const gate2 = {
      requestedCategories,
      categoryStatuses,
    }

    // Gate 3: Market Ready (COI verified)
    const coiDocuments = Array.isArray(verification.coi_documents) ? verification.coi_documents : []
    const gate3 = {
      coiStatus: (verification.coi_status || 'not_submitted') as string,
      coiDocuments,
      coiVerifiedAt: verification.coi_verified_at as string | null,
    }

    // Prohibited items acknowledgment
    const prohibitedItemsAcknowledged = !!verification.prohibited_items_acknowledged_at

    // Compute: can submit for approval?
    // All required docs uploaded + prohibited items acknowledged
    const allCategoryDocsSubmitted = requestedCategories.every((cat) => {
      if (!requiresDocuments(cat as Category)) return true
      const cv = categoryVerifications[cat]
      return cv && cv.documents && (cv.documents as unknown[]).length > 0
    })

    const canSubmitForApproval =
      businessDocs.length > 0 &&
      prohibitedItemsAcknowledged &&
      allCategoryDocsSubmitted

    // Compute: can publish listings?
    // All 3 gates passed
    const allCategoriesAuthorized = requestedCategories.every((cat) => {
      if (!requiresDocuments(cat as Category)) return true
      const cv = categoryVerifications[cat]
      return cv && cv.status === 'approved'
    })

    const canPublishListings =
      verification.status === 'approved' &&
      allCategoriesAuthorized &&
      verification.coi_status === 'approved'

    // Overall progress (0-100)
    let steps = 0
    let completed = 0

    // Step 1: Business docs uploaded
    steps++
    if (businessDocs.length > 0) completed++

    // Step 2: Prohibited items acknowledged
    steps++
    if (prohibitedItemsAcknowledged) completed++

    // Step 3: Category docs (one step per category that requires docs)
    const catsNeedingDocs = requestedCategories.filter((cat) => requiresDocuments(cat as Category))
    steps += catsNeedingDocs.length
    for (const cat of catsNeedingDocs) {
      const cv = categoryVerifications[cat]
      if (cv && cv.status === 'approved') completed++
    }

    // Step 4: Vendor approved
    steps++
    if (verification.status === 'approved') completed++

    // Step 5: COI uploaded & approved
    steps++
    if (verification.coi_status === 'approved') completed++

    const overallProgress = steps > 0 ? Math.round((completed / steps) * 100) : 0

    return NextResponse.json({
      gate1,
      gate2,
      gate3,
      prohibitedItemsAcknowledged,
      canSubmitForApproval,
      canPublishListings,
      overallProgress,
      onboardingCompletedAt: verification.onboarding_completed_at,
    })
  })
}
