import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

// POST /api/admin/login — rate-limited admin login
// M8 FIX: Prevents brute-force attacks on admin credentials
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/login', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin-login:${clientIp}`, rateLimits.auth)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', data.user.id)
      .single()

    const isAdmin = profile?.role === 'admin' ||
                    profile?.role === 'platform_admin' ||
                    profile?.roles?.includes('admin') ||
                    profile?.roles?.includes('platform_admin')

    if (!isAdmin) {
      await supabase.auth.signOut()
      return NextResponse.json({ error: 'Access denied. Admin privileges required.' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
    })
  })
}
