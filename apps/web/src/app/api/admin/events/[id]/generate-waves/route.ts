import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { generateEventWaves } from '@/lib/events/wave-generation'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST - Generate waves for an event
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing(
    '/api/admin/events/[id]/generate-waves',
    'POST',
    async () => {
      const clientIp = getClientIp(request)
      const rateLimitResult = await checkRateLimit(
        `admin:${clientIp}`,
        rateLimits.admin
      )
      if (!rateLimitResult.success) {
        return rateLimitResponse(rateLimitResult)
      }

      // Auth: admin only
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role, roles')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single()

      if (!hasAdminRole(userProfile || {})) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }

      const { id: eventId } = await context.params
      const serviceClient = createServiceClient()

      // Fetch the catering request with its market
      const { data: request_data, error: fetchError } = await serviceClient
        .from('catering_requests')
        .select('id, market_id, event_start_time, event_end_time, status')
        .eq('id', eventId)
        .single()

      if (fetchError || !request_data) {
        return NextResponse.json(
          { error: 'Event not found' },
          { status: 404 }
        )
      }

      if (!request_data.market_id) {
        return NextResponse.json(
          { error: 'Event must be approved (market created) before generating waves' },
          { status: 400 }
        )
      }

      // Default times if not set on the request
      const startTime = request_data.event_start_time || '11:00:00'
      const endTime = request_data.event_end_time || '14:00:00'

      const result = await generateEventWaves(serviceClient, {
        marketId: request_data.market_id,
        eventStartTime: startTime,
        eventEndTime: endTime,
      })

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        )
      }

      return NextResponse.json({
        ok: true,
        waves_created: result.wavesCreated,
        capacity_per_wave: result.capacityPerWave,
      })
    }
  )
}
