import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { VALID_VERTICALS } from '@/lib/validation/vertical'
import { LOCALE_COOKIE, isValidLocale } from '@/lib/locale'

// Top-level routes that are NOT verticals (skip allowlist check for these)
const NON_VERTICAL_PREFIXES = new Set([
  'api', 'admin', '_next', 'about', 'browse', 'contact', 'dashboard',
  'events', 'login', 'privacy', 'signup', 'support', 'terms', 'vendor-signup', 'test-components',
  'robots.txt', 'sitemap.xml', 'llms.txt',
])

// Paths that contain sensitive user data — prevent caching by proxies/CDNs/browser
const SENSITIVE_PATHS = ['/admin', '/dashboard', '/vendor/dashboard', '/buyer/orders', '/settings']

// Domain ↔ vertical mapping for cross-domain redirect enforcement
// Each vertical has a canonical domain. If a vertical path is accessed on the wrong domain, redirect.
const VERTICAL_DOMAINS: Record<string, string> = {
  food_trucks: 'foodtruckn.app',
  farmers_market: 'farmersmarketing.app',
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const path = request.nextUrl.pathname
  const segments = path.split('/').filter(Boolean)
  const firstSegment = segments[0]

  // Domain enforcement: redirect cross-domain vertical access to the correct domain
  // Only applies on production custom domains (skip localhost, Vercel preview URLs)
  const isProductionDomain = Object.values(VERTICAL_DOMAINS).some(d => host === d || host === `www.${d}`)
  if (isProductionDomain && firstSegment && VERTICAL_DOMAINS[firstSegment]) {
    const correctDomain = VERTICAL_DOMAINS[firstSegment]
    if (!host.includes(correctDomain)) {
      const redirectUrl = new URL(path, `https://${correctDomain}`)
      redirectUrl.search = request.nextUrl.search
      return NextResponse.redirect(redirectUrl, 308)
    }
  }

  const response = await updateSession(request)

  // C-5: Vertical allowlist — if first segment could be a vertical but isn't valid, 404
  if (firstSegment && !NON_VERTICAL_PREFIXES.has(firstSegment) && !VALID_VERTICALS.has(firstSegment)) {
    // Not a known route prefix and not a valid vertical — rewrite to 404
    return NextResponse.rewrite(new URL('/not-found', request.url))
  }

  if (SENSITIVE_PATHS.some(p => path.includes(p))) {
    response.headers.set('Cache-Control', 'no-store, max-age=0')
  }

  // Sync locale: if httpOnly cookie exists but client-readable cookie doesn't, copy it
  const localeCookie = request.cookies.get(LOCALE_COOKIE)?.value
  const clientCookie = request.cookies.get(`${LOCALE_COOKIE}_client`)?.value
  if (localeCookie && isValidLocale(localeCookie) && localeCookie !== clientCookie) {
    response.cookies.set(`${LOCALE_COOKIE}_client`, localeCookie, {
      path: '/',
      httpOnly: false,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public assets (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
