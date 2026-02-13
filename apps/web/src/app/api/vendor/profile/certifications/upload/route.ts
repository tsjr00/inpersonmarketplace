import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

/**
 * POST /api/vendor/profile/certifications/upload
 *
 * Upload a certification document (permit, license, registration).
 * Accepts FormData with 'document' file field.
 * Returns the public URL for storage in the certifications JSONB.
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/profile/certifications/upload', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-cert-upload:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Auth
    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get vendor profile
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendor, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendor) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('document') as File

    if (!file) {
      throw traced.validation('ERR_VALIDATION_001', 'No file provided')
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw traced.validation(
        'ERR_VALIDATION_001',
        'File must be PDF, JPG, or PNG'
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw traced.validation(
        'ERR_VALIDATION_001',
        'File must be under 10MB'
      )
    }

    // Upload to Supabase Storage
    const fileExt = file.type === 'application/pdf' ? 'pdf'
      : file.type === 'image/png' ? 'png'
      : 'jpg'
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `certifications/${vendor.id}/${fileName}`

    crumb.logic('Uploading document to storage')
    const { error: uploadError } = await supabase.storage
      .from('vendor-documents')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Document upload error:', uploadError)
      throw traced.fromSupabase(uploadError, { table: 'storage', operation: 'insert' })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('vendor-documents')
      .getPublicUrl(filePath)

    return NextResponse.json({
      success: true,
      documentUrl: publicUrl
    })
  })
}
