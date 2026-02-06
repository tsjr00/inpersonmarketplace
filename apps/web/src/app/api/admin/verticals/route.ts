import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

  const supabase = await createClient()

  // Verify admin authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('roles')
    .eq('user_id', user.id)
    .single()

  if (!profile?.roles?.includes('admin') && !profile?.roles?.includes('platform_admin')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Get verticals from defaultBranding
  // In the future, this could come from a database table
  const verticals = Object.entries(defaultBranding).map(([id, branding]) => ({
    id,
    name: branding.brand_name,
    domain: branding.domain
  }))

  return NextResponse.json({ verticals })
}
