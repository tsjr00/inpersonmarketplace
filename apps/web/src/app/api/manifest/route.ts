import { NextRequest, NextResponse } from 'next/server'
import { defaultBranding } from '@/lib/branding/defaults'

/**
 * GET /api/manifest
 *
 * Dynamic PWA manifest that returns vertical-appropriate metadata
 * based on the requesting hostname.
 * - foodtruckn.app → Food Truck'n manifest (red theme, FT icons)
 * - farmersmarketing.app → Farmers Marketing manifest (green theme, FM icons)
 * - Unknown/staging → defaults to Farmers Marketing
 */

// Build hostname → verticalId lookup from branding config
const domainToVertical: Record<string, string> = {}
for (const [verticalId, branding] of Object.entries(defaultBranding)) {
  domainToVertical[branding.domain] = verticalId
}

interface ManifestConfig {
  name: string
  short_name: string
  description: string
  start_url: string
  theme_color: string
  icon_prefix: string
}

const manifests: Record<string, ManifestConfig> = {
  farmers_market: {
    name: 'Farmers Marketing',
    short_name: 'FarmMkt',
    description: 'Pre-order fresh produce and goods from local farmers and artisans',
    start_url: '/farmers_market',
    theme_color: defaultBranding.farmers_market.colors.primary,
    icon_prefix: 'fm',
  },
  food_trucks: {
    name: "Food Truck'n",
    short_name: "FoodTruck'n",
    description: 'Find food trucks near you. Pre-order and skip the line.',
    start_url: '/food_trucks',
    theme_color: defaultBranding.food_trucks.colors.primary,
    icon_prefix: 'ft',
  },
}

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const hostname = host.split(':')[0] // strip port for local dev

  const vertical = domainToVertical[hostname] || 'farmers_market'
  const config = manifests[vertical] || manifests.farmers_market

  const manifest = {
    name: config.name,
    short_name: config.short_name,
    description: config.description,
    start_url: config.start_url,
    display: 'standalone',
    theme_color: config.theme_color,
    background_color: '#ffffff',
    orientation: 'any',
    categories: ['shopping', 'food'],
    icons: [
      {
        src: `/icons/${config.icon_prefix}-icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: `/icons/${config.icon_prefix}-icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
