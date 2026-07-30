import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { FOOD_TRUCK_PERMIT_REQUIREMENTS } from '@/lib/onboarding/category-requirements'

interface Certification {
  type: string
  label: string
  registration_number: string
  state: string
  expires_at?: string
  verified?: boolean
  document_url?: string
}

// PUT - Update vendor certifications
export async function PUT(request: NextRequest) {
  return withErrorTracing('/api/vendor/profile/certifications', 'PUT', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-certifications-put:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const body = await request.json()
    const { certifications } = body as { certifications: Certification[] }

    // Validate certifications
    if (!Array.isArray(certifications)) {
      throw traced.validation('ERR_VALIDATION_001', 'Certifications must be an array')
    }

    // Limit to 4 certifications
    if (certifications.length > 4) {
      throw traced.validation('ERR_VALIDATION_001', 'Maximum of 4 certifications allowed')
    }

    // Validate each certification.
    // Types: FM voluntary certs + the FT permit taxonomy (mig-less; the FT cert
    // dropdown offers these) + 'other'. Tester finding 2026-07-28: the old list
    // was FM-only, so FT cert saves (e.g. 'mfu_permit') were rejected server-side
    // and silently never persisted.
    const validTypes = new Set<string>([
      'cottage_goods', 'organic', 'regenerative', 'gap_certified', 'other',
      ...FOOD_TRUCK_PERMIT_REQUIREMENTS.map((r) => r.docType as string),
    ])
    for (const cert of certifications) {
      if (!cert.type || !validTypes.has(cert.type)) {
        throw traced.validation('ERR_VALIDATION_001', `Invalid certification type: ${cert.type}`)
      }
      // registration_number + state are OPTIONAL (UI made them optional 2026-07-28
      // — many permits have neither). Only validate the state FORMAT when present.
      if (cert.state && cert.state.trim() !== '' && cert.state.trim().length !== 2) {
        throw traced.validation('ERR_VALIDATION_001', 'State must be a 2-letter code')
      }
      if (cert.type === 'other' && (!cert.label || cert.label.trim() === '')) {
        throw traced.validation('ERR_VALIDATION_001', 'Label is required for "other" certification type')
      }
    }

    // Multi-vertical safe vendor profile lookup via shared utility
    const vertical = request.nextUrl.searchParams.get('vertical')
    crumb.supabase('select', 'vendor_profiles')
    const { profile: vendorProfile, error: vpError } = await getVendorProfileForVertical(
      supabase,
      user.id,
      vertical
    )

    if (vpError || !vendorProfile) {
      throw traced.notFound('ERR_VENDOR_001', vpError || 'Vendor profile not found')
    }

    // Sanitize certifications (remove any admin-only fields that might have been tampered with)
    // Preserve document_url if it's a valid vendor-documents URL
    const sanitizedCertifications = certifications.map(cert => ({
      type: cert.type,
      label: cert.label,
      registration_number: (cert.registration_number || '').trim(),
      state: (cert.state || '').trim().toUpperCase(),
      expires_at: cert.expires_at || null,
      verified: false, // Always set to false - only admins can verify
      document_url: cert.document_url && typeof cert.document_url === 'string'
        && cert.document_url.includes('vendor-documents')
        ? cert.document_url
        : null
    }))

    // Update vendor profile with certifications
    crumb.supabase('update', 'vendor_profiles')
    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update({ certifications: sanitizedCertifications })
      .eq('id', vendorProfile.id)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_profiles', operation: 'update' })
    }

    return NextResponse.json({
      success: true,
      certifications: sanitizedCertifications
    })
  })
}

// GET - Get vendor certifications
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/profile/certifications', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-certifications-get:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get vendor profile with certifications — multi-vertical safe
    const vertical = request.nextUrl.searchParams.get('vertical')
    crumb.supabase('select', 'vendor_profiles')
    const { profile: vendorProfile, error: vpError } = await getVendorProfileForVertical<{
      certifications: unknown
      vertical_id: string
    }>(supabase, user.id, vertical, 'certifications')

    if (vpError || !vendorProfile) {
      throw traced.notFound('ERR_VENDOR_001', vpError || 'Vendor profile not found')
    }

    return NextResponse.json({
      certifications: vendorProfile.certifications || []
    })
  })
}
