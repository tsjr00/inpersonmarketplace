import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

interface Certification {
  type: string
  label: string
  registration_number: string
  state: string
  expires_at?: string
  verified?: boolean
}

// PUT - Update vendor certifications
export async function PUT(request: Request) {
  return withErrorTracing('/api/vendor/profile/certifications', 'PUT', async () => {
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

    // Validate each certification
    const validTypes = ['cottage_goods', 'organic', 'regenerative', 'gap_certified', 'other']
    for (const cert of certifications) {
      if (!cert.type || !validTypes.includes(cert.type)) {
        throw traced.validation('ERR_VALIDATION_001', `Invalid certification type: ${cert.type}`)
      }
      if (!cert.registration_number || cert.registration_number.trim() === '') {
        throw traced.validation('ERR_VALIDATION_001', 'Registration number is required')
      }
      if (!cert.state || cert.state.length !== 2) {
        throw traced.validation('ERR_VALIDATION_001', 'Valid 2-letter state code is required')
      }
      if (cert.type === 'other' && (!cert.label || cert.label.trim() === '')) {
        throw traced.validation('ERR_VALIDATION_001', 'Label is required for "other" certification type')
      }
    }

    // Get vendor profile
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    // Sanitize certifications (remove any admin-only fields that might have been tampered with)
    const sanitizedCertifications = certifications.map(cert => ({
      type: cert.type,
      label: cert.label,
      registration_number: cert.registration_number.trim(),
      state: cert.state.toUpperCase(),
      expires_at: cert.expires_at || null,
      verified: false // Always set to false - only admins can verify
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
export async function GET() {
  return withErrorTracing('/api/vendor/profile/certifications', 'GET', async () => {
    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get vendor profile with certifications
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('certifications')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    return NextResponse.json({
      certifications: vendorProfile.certifications || []
    })
  })
}
