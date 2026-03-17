import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/buyer-interests', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`buyer-interest:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    crumb.validate('Validating buyer interest submission')

    const body = await request.json()
    const { email, phone, zip_code, vertical } = body

    // Must have at least email or phone
    if (!email && !phone) {
      throw traced.validation('ERR_VALIDATION_001', 'Email or phone number is required')
    }

    // Basic email format check
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw traced.validation('ERR_VALIDATION_002', 'Invalid email format')
    }

    // Basic phone check (at least 10 digits)
    if (phone && phone.replace(/\D/g, '').length < 10) {
      throw traced.validation('ERR_VALIDATION_003', 'Invalid phone number')
    }

    const verticalId = vertical || 'food_trucks'

    crumb.supabase('insert', 'buyer_interests')
    const serviceClient = await createServiceClient()

    const { error } = await serviceClient
      .from('buyer_interests')
      .insert({
        email: email || null,
        phone: phone ? phone.replace(/\D/g, '') : null,
        zip_code: zip_code || null,
        vertical_id: verticalId,
        source: 'browse_empty',
      })

    if (error) {
      // Duplicate email — not an error, just acknowledge
      if (error.code === '23505') {
        return NextResponse.json({ success: true, message: "You're already on the list!" })
      }
      throw traced.fromSupabase(error, { table: 'buyer_interests', operation: 'insert' })
    }

    return NextResponse.json({ success: true, message: "We'll notify you when vendors are in your area!" })
  })
}
