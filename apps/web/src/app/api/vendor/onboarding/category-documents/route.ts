import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { CATEGORIES, type Category } from '@/lib/constants'
import {
  requiresDocuments,
  getCategoryRequirement,
  FOOD_TRUCK_DOC_TYPES,
  type DocType,
  type FoodTruckDocType,
} from '@/lib/onboarding/category-requirements'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

/**
 * POST /api/vendor/onboarding/category-documents
 *
 * Upload documents for Gate 2 authorization.
 * FM vendors: per-category permits (FormData: document, category, doc_type)
 * FT vendors: universal permits (FormData: document, category=permitDocType, doc_type=permitDocType)
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/onboarding/category-documents', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`onboarding-cat-docs:${clientIp}`, { limit: 20, windowSeconds: 60 })
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // H12 FIX: Add vertical filter for multi-vertical safety
    const vertical = request.nextUrl.searchParams.get('vertical')
    crumb.supabase('select', 'vendor_profiles')
    let vpQuery = supabase.from('vendor_profiles').select('id, vertical_id').eq('user_id', user.id)
    if (vertical) vpQuery = vpQuery.eq('vertical_id', vertical)
    const { data: vendor } = await vpQuery.single()

    if (!vendor) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    const formData = await request.formData()
    const file = formData.get('document') as File
    const category = formData.get('category') as string
    const docType = formData.get('doc_type') as string

    if (!file) {
      throw traced.validation('ERR_VALIDATION_001', 'No file provided')
    }

    const isFoodTruck = vendor.vertical_id === 'food_trucks'

    // Validate category/permit type based on vertical
    if (isFoodTruck) {
      if (!category || !FOOD_TRUCK_DOC_TYPES.includes(category as FoodTruckDocType)) {
        throw traced.validation('ERR_VALIDATION_001', 'Invalid permit type')
      }
      // For food trucks, doc_type = category (the permit IS the doc type)
      if (!docType || docType !== category) {
        throw traced.validation('ERR_VALIDATION_001', 'Document type must match permit type')
      }
    } else {
      if (!category || !CATEGORIES.includes(category as Category)) {
        throw traced.validation('ERR_VALIDATION_001', 'Invalid category')
      }
      if (!requiresDocuments(category as Category)) {
        throw traced.validation('ERR_VALIDATION_001', `Category "${category}" does not require documents`)
      }
      const requirement = getCategoryRequirement(category as Category)
      if (!docType || !requirement.acceptedDocTypes.includes(docType as DocType)) {
        throw traced.validation(
          'ERR_VALIDATION_001',
          `Invalid document type for ${category}. Accepted: ${requirement.acceptedDocTypes.join(', ')}`
        )
      }
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      throw traced.validation('ERR_VALIDATION_001', 'File must be PDF, JPG, or PNG')
    }
    if (file.size > MAX_FILE_SIZE) {
      throw traced.validation('ERR_VALIDATION_001', 'File must be under 10MB')
    }

    // Upload to storage
    const fileExt = file.type === 'application/pdf' ? 'pdf'
      : file.type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${Date.now()}.${fileExt}`
    const storagePath = isFoodTruck
      ? `permit-docs/${vendor.id}/${category}/${fileName}`
      : `category-docs/${vendor.id}/${category.replace(/\s+/g, '-').toLowerCase()}/${fileName}`

    crumb.logic('Uploading document')
    const { error: uploadError } = await supabase.storage
      .from('vendor-documents')
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      throw traced.fromSupabase(uploadError, { table: 'storage', operation: 'insert' })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('vendor-documents')
      .getPublicUrl(storagePath)

    const newDoc = {
      url: publicUrl,
      path: storagePath,
      filename: file.name,
      type: file.type,
      doc_type: docType,
      uploaded_at: new Date().toISOString(),
    }

    // Update category_verifications JSONB
    crumb.supabase('select', 'vendor_verifications')
    const { data: verification } = await supabase
      .from('vendor_verifications')
      .select('category_verifications')
      .eq('vendor_profile_id', vendor.id)
      .single()

    const catVerifications = (verification?.category_verifications || {}) as Record<string, unknown>
    const existingCat = (catVerifications[category] || {}) as Record<string, unknown>
    const existingDocs = Array.isArray(existingCat.documents) ? existingCat.documents : []

    catVerifications[category] = {
      ...existingCat,
      status: 'pending',
      doc_type: docType,
      documents: [...existingDocs, newDoc],
      submitted_at: new Date().toISOString(),
    }

    crumb.supabase('update', 'vendor_verifications')
    const { error: updateError } = await supabase
      .from('vendor_verifications')
      .update({
        category_verifications: catVerifications,
        updated_at: new Date().toISOString(),
      })
      .eq('vendor_profile_id', vendor.id)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_verifications', operation: 'update' })
    }

    return NextResponse.json({ success: true, category, document: newDoc })
  })
}
