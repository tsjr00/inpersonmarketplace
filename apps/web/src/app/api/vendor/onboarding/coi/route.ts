import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

/**
 * POST /api/vendor/onboarding/coi
 *
 * Upload Certificate of Insurance for Gate 3 verification.
 * Accepts FormData with 'document' file field.
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/onboarding/coi', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`onboarding-coi:${clientIp}`, { limit: 10, windowSeconds: 60 })
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    crumb.supabase('select', 'vendor_profiles')
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    const formData = await request.formData()
    const file = formData.get('document') as File

    if (!file) {
      throw traced.validation('ERR_VALIDATION_001', 'No file provided')
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
    const filePath = `coi/${vendor.id}/${fileName}`

    crumb.logic('Uploading COI document')
    const { error: uploadError } = await supabase.storage
      .from('vendor-documents')
      .upload(filePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      throw traced.fromSupabase(uploadError, { table: 'storage', operation: 'insert' })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('vendor-documents')
      .getPublicUrl(filePath)

    const newDoc = {
      url: publicUrl,
      path: filePath,
      filename: file.name,
      type: file.type,
      uploaded_at: new Date().toISOString(),
    }

    // Update COI documents and set status to pending
    crumb.supabase('select', 'vendor_verifications')
    const { data: verification } = await supabase
      .from('vendor_verifications')
      .select('coi_documents')
      .eq('vendor_profile_id', vendor.id)
      .single()

    const existingDocs = Array.isArray(verification?.coi_documents) ? verification.coi_documents : []

    crumb.supabase('update', 'vendor_verifications')
    const { error: updateError } = await supabase
      .from('vendor_verifications')
      .update({
        coi_documents: [...existingDocs, newDoc],
        coi_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('vendor_profile_id', vendor.id)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_verifications', operation: 'update' })
    }

    return NextResponse.json({ success: true, document: newDoc })
  })
}
