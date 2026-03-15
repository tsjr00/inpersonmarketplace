import { NextRequest, NextResponse } from 'next/server'
import { SUPPORTED_LOCALES, LOCALE_COOKIE, DEFAULT_LOCALE } from '@/lib/locale'

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
  return response
}
