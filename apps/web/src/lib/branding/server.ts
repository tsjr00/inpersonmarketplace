// Server-only branding functions - DO NOT import in client components
import { createClient } from '../supabase/server'
import { VerticalBranding, VerticalConfig } from './types'
import { defaultBranding } from './defaults'

/**
 * Get vertical configuration from database
 * Falls back to default branding if database unavailable
 * SERVER ONLY - Do not call from client components
 */
export async function getVerticalConfig(verticalId: string): Promise<VerticalConfig | null> {
  try {
    const supabase = await createClient()

    const { data: vertical, error } = await supabase
      .from('verticals')
      .select('vertical_id, name_public, config')
      .eq('vertical_id', verticalId)
      .eq('is_active', true)
      .single()

    if (error || !vertical) {
      console.warn(`Failed to load vertical ${verticalId} from database, using fallback`)
      return getVerticalConfigFallback(verticalId)
    }

    // Extract branding from config
    const config = vertical.config as Record<string, unknown> | null
    const branding = config?.branding as VerticalBranding | undefined

    if (!branding) {
      console.warn(`No branding in database for ${verticalId}, using fallback`)
      return getVerticalConfigFallback(verticalId)
    }

    return {
      vertical_id: vertical.vertical_id,
      name_public: vertical.name_public,
      branding,
      vendor_fields: config?.vendor_fields as VerticalConfig['vendor_fields'],
      config: config || undefined
    }
  } catch (error) {
    console.error(`Error loading vertical config for ${verticalId}:`, error)
    return getVerticalConfigFallback(verticalId)
  }
}

/**
 * Fallback: Use default branding if database unavailable
 */
function getVerticalConfigFallback(verticalId: string): VerticalConfig | null {
  const branding = defaultBranding[verticalId]

  if (!branding) {
    return null
  }

  return {
    vertical_id: verticalId,
    name_public: verticalId === 'fireworks' ? 'Fireworks Marketplace' : 'Farmers Market',
    branding
  }
}

/**
 * Get branding by domain (for multi-domain routing)
 * SERVER ONLY - Do not call from client components
 */
export async function getBrandingByDomain(domain: string): Promise<{
  vertical_id: string
  branding: VerticalBranding
} | null> {
  try {
    const supabase = await createClient()

    const { data: verticals, error } = await supabase
      .from('verticals')
      .select('vertical_id, config')
      .eq('is_active', true)

    if (error || !verticals) {
      return getBrandingByDomainFallback(domain)
    }

    // Find vertical with matching domain in branding config
    for (const vertical of verticals) {
      const config = vertical.config as Record<string, unknown> | null
      const branding = config?.branding as VerticalBranding | undefined
      if (branding?.domain === domain) {
        return {
          vertical_id: vertical.vertical_id,
          branding
        }
      }
    }

    // No match found - use fallback
    return getBrandingByDomainFallback(domain)
  } catch (error) {
    console.error('Error loading branding by domain:', error)
    return getBrandingByDomainFallback(domain)
  }
}

/**
 * Fallback: Map domains to verticals when database unavailable
 */
function getBrandingByDomainFallback(domain: string): {
  vertical_id: string
  branding: VerticalBranding
} | null {
  const domainMap: Record<string, string> = {
    'fireworksstand.com': 'fireworks',
    'www.fireworksstand.com': 'fireworks',
    'farmersmarket.app': 'farmers_market',
    'www.farmersmarket.app': 'farmers_market',
    'localhost:3002': 'fireworks', // Default for dev
    'inpersonmarketplace.vercel.app': 'fireworks', // Default for staging
  }

  const verticalId = domainMap[domain]
  if (!verticalId) return null

  const branding = defaultBranding[verticalId]
  if (!branding) return null

  return {
    vertical_id: verticalId,
    branding
  }
}

/**
 * Get all active verticals (for homepage listing)
 * SERVER ONLY - Do not call from client components
 */
export async function getAllVerticals(): Promise<VerticalConfig[]> {
  try {
    const supabase = await createClient()

    const { data: verticals, error } = await supabase
      .from('verticals')
      .select('vertical_id, name_public, config')
      .eq('is_active', true)
      .order('vertical_id')

    if (error || !verticals) {
      console.warn('Failed to load verticals from database, using fallback')
      return getAllVerticalsFallback()
    }

    return verticals
      .map(v => {
        const config = v.config as Record<string, unknown> | null
        return {
          vertical_id: v.vertical_id,
          name_public: v.name_public,
          branding: config?.branding as VerticalBranding,
          vendor_fields: config?.vendor_fields as VerticalConfig['vendor_fields'],
          config: config || undefined
        }
      })
      .filter(v => v.branding != null) // Only include verticals with branding
  } catch (error) {
    console.error('Error loading all verticals:', error)
    return getAllVerticalsFallback()
  }
}

/**
 * Fallback: Return hardcoded verticals
 */
function getAllVerticalsFallback(): VerticalConfig[] {
  return [
    {
      vertical_id: 'fireworks',
      name_public: 'Fireworks Marketplace',
      branding: defaultBranding.fireworks
    },
    {
      vertical_id: 'farmers_market',
      name_public: 'Farmers Market',
      branding: defaultBranding.farmers_market
    }
  ]
}
