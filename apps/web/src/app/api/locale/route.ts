import { NextRequest, NextResponse } from 'next/server'
import { SUPPORTED_LOCALES, LOCALE_COOKIE, DEFAULT_LOCALE } from '@/lib/locale'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const locale = SUPPORTED_LOCALES.includes(body.locale) ? body.locale : DEFAULT_LOCALE

  const response = NextResponse.json({ locale })
  // httpOnly cookie for server components (getLocale via next/headers)
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })
  // Readable cookie for client components (getClientLocale via document.cookie)
  response.cookies.set(`${LOCALE_COOKIE}_client`, locale, {
    path: '/',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  // Persist locale to user profile for notification translation (Option B)
  // Best-effort: don't fail the response if DB update fails
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Read current notification_preferences, merge in locale
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('notification_preferences')
        .eq('user_id', user.id)
        .single()
      const currentPrefs = (profile?.notification_preferences as Record<string, unknown>) || {}
      await supabase
        .from('user_profiles')
        .update({ notification_preferences: { ...currentPrefs, locale } })
        .eq('user_id', user.id)
    }
  } catch {
    // Non-critical: cookies are the primary locale mechanism
  }

  return response
}
