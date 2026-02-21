import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Paths that contain sensitive user data — prevent caching by proxies/CDNs/browser
const SENSITIVE_PATHS = ['/admin', '/dashboard', '/vendor/dashboard', '/buyer/orders', '/settings']

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)

  const path = request.nextUrl.pathname
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
