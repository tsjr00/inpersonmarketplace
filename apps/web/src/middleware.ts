import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// C-5: Valid verticals allowlist — blocks invalid vertical slugs at the edge
const VALID_VERTICALS = new Set(['farmers_market', 'food_trucks', 'fire_works'])

// Top-level routes that are NOT verticals (skip allowlist check for these)
const NON_VERTICAL_PREFIXES = new Set([
  'api', 'admin', '_next', 'about', 'browse', 'contact', 'dashboard',
  'login', 'privacy', 'signup', 'support', 'terms', 'vendor-signup', 'test-components',
  'robots.txt', 'sitemap.xml', 'llms.txt',
])

// Paths that contain sensitive user data — prevent caching by proxies/CDNs/browser
const SENSITIVE_PATHS = ['/admin', '/dashboard', '/vendor/dashboard', '/buyer/orders', '/settings']

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)

  const path = request.nextUrl.pathname
  const segments = path.split('/').filter(Boolean)
  const firstSegment = segments[0]

  // C-5: Vertical allowlist — if first segment could be a vertical but isn't valid, 404
  if (firstSegment && !NON_VERTICAL_PREFIXES.has(firstSegment) && !VALID_VERTICALS.has(firstSegment)) {
    // Not a known route prefix and not a valid vertical — rewrite to 404
    return NextResponse.rewrite(new URL('/not-found', request.url))
  }

  if (SENSITIVE_PATHS.some(p => path.includes(p))) {
    response.headers.set('Cache-Control', 'no-store, max-age=0')
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
