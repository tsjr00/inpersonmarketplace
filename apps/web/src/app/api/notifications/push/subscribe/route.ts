import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/notifications/push/subscribe - Register a push subscription
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/notifications/push/subscribe', 'POST', async () => {
    const rateResult = checkRateLimit(`push-sub:${getClientIp(request)}`, rateLimits.submit)
    if (!rateResult.success) return rateLimitResponse(rateResult)

    crumb.auth('Checking user')
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate subscription shape
    const { endpoint, keys } = body
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    }
    if (!keys?.p256dh || !keys?.auth || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return NextResponse.json({ error: 'Missing subscription keys' }, { status: 400 })
    }

    crumb.supabase('upsert', 'push_subscriptions')
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        { onConflict: 'user_id,endpoint' }
      )

    if (error) {
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
    }

    // Auto-sync push_enabled preference so notification service sends push
    crumb.supabase('select', 'user_profiles', { field: 'notification_preferences' })
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('notification_preferences')
      .eq('user_id', user.id)
      .single()

    const currentPrefs = (profile?.notification_preferences as Record<string, unknown>) || {}
    if (!currentPrefs.push_enabled) {
      crumb.supabase('update', 'user_profiles', { field: 'notification_preferences.push_enabled' })
      await supabase
        .from('user_profiles')
        .update({
          notification_preferences: { ...currentPrefs, push_enabled: true }
        })
        .eq('user_id', user.id)
    }

    return NextResponse.json({ success: true })
  })
}

/**
 * DELETE /api/notifications/push/subscribe - Remove a push subscription
 */
export async function DELETE(request: NextRequest) {
  return withErrorTracing('/api/notifications/push/subscribe', 'DELETE', async () => {
    const rateResult = checkRateLimit(`push-unsub:${getClientIp(request)}`, rateLimits.submit)
    if (!rateResult.success) return rateLimitResponse(rateResult)

    crumb.auth('Checking user')
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint } = body
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    }

    crumb.supabase('delete', 'push_subscriptions')
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)

    if (error) {
      return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 })
    }

    // Sync push_enabled if no subscriptions remain on any device
    crumb.supabase('select', 'push_subscriptions', { operation: 'count' })
    const { count } = await supabase
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (count === 0) {
      crumb.supabase('select', 'user_profiles', { field: 'notification_preferences' })
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('notification_preferences')
        .eq('user_id', user.id)
        .single()

      const currentPrefs = (profile?.notification_preferences as Record<string, unknown>) || {}
      if (currentPrefs.push_enabled) {
        crumb.supabase('update', 'user_profiles', { field: 'notification_preferences.push_enabled' })
        await supabase
          .from('user_profiles')
          .update({
            notification_preferences: { ...currentPrefs, push_enabled: false }
          })
          .eq('user_id', user.id)
      }
    }

    return NextResponse.json({ success: true })
  })
}
