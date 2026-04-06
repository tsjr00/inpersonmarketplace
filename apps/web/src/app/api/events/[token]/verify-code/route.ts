import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/events/[token]/verify-code
 *
 * Verify an access code for company-paid/hybrid event ordering.
 * Returns { valid: true } if the code matches, { valid: false } otherwise.
 * Rate limited to prevent brute-force guessing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/verify-code', 'POST', async () => {
    const clientIp = getClientIp(request)
    // Tight rate limit — 5 attempts per minute to prevent brute force
    const rateLimitResult = await checkRateLimit(`event-verify-code:${clientIp}`, rateLimits.auth)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await params
    const body = await request.json()
    const { code } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, error: 'Access code is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: event } = await supabase
      .from('catering_requests')
      .select('access_code, payment_model, company_max_per_attendee_cents')
      .eq('event_token', token)
      .in('status', ['approved', 'ready', 'active'])
      .single()

    if (!event || !event.access_code) {
      return NextResponse.json({ valid: false, error: 'Event not found' }, { status: 404 })
    }

    const valid = code.toUpperCase().trim() === event.access_code.toUpperCase()

    if (!valid) {
      return NextResponse.json({ valid: false })
    }

    return NextResponse.json({
      valid: true,
      payment_model: event.payment_model,
      company_max_per_attendee_cents: event.company_max_per_attendee_cents,
    })
  })
}
