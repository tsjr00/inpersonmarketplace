import { NextRequest, NextResponse } from 'next/server'
import { defaultBranding } from '@/lib/branding/defaults'

/**
 * GET /api/apple-touch-icon
 *
 * Returns a redirect to the correct apple-touch-icon based on the requesting hostname.
 * - foodtruckn.app → /icons/ft-icon-192.png
 * - farmersmarketing.app → /icons/fm-icon-192.png
 * - Unknown/staging → defaults to FM icon
 */

// Map domain → icon prefix using same pattern as manifest endpoint
const ICON_PREFIXES: Record<string, string> = {
  farmers_market: 'fm',
  food_trucks: 'ft',
}

const domainToVertical: Record<string, string> = {}
for (const [verticalId, branding] of Object.entries(defaultBranding)) {
  domainToVertical[branding.domain] = verticalId
}

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const hostname = host.split(':')[0]

  // Staging URLs contain the vertical in the subdomain/path
  // e.g., inpersonmarketplace-git-staging-...vercel.app
  // For staging, default to FM; production domains resolve correctly
  const vertical = domainToVertical[hostname] || 'farmers_market'
  const prefix = ICON_PREFIXES[vertical] || 'fm'
  const iconPath = `/icons/${prefix}-icon-192.png`

  return NextResponse.redirect(new URL(iconPath, request.url), {
    status: 302,
    headers: {
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
