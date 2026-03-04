import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

const VALID_AGREEMENT_TYPES = ['platform_user', 'vendor_service', 'vendor_partner'] as const

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/user/accept-agreement', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`accept-agreement:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()
    const { agreement_type, agreement_version, vertical_id } = body

    if (!agreement_type || !VALID_AGREEMENT_TYPES.includes(agreement_type)) {
      return NextResponse.json(
        { error: 'Invalid agreement_type. Must be one of: platform_user, vendor_service, vendor_partner' },
        { status: 400 }
      )
    }

    if (!agreement_version || typeof agreement_version !== 'string') {
      return NextResponse.json(
        { error: 'agreement_version is required' },
        { status: 400 }
      )
    }

    // Insert acceptance record
    const { data, error } = await supabase
      .from('user_agreement_acceptances')
      .insert({
        user_id: user.id,
        agreement_type,
        agreement_version,
        ip_address: clientIp,
        user_agent: request.headers.get('user-agent') || null,
        vertical_id: vertical_id || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to record agreement acceptance:', error)
      return NextResponse.json(
        { error: 'Failed to record agreement acceptance' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, id: data.id })
  })
}
