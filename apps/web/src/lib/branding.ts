export interface VerticalBranding {
  domain: string
  brand_name: string
  tagline: string
  logo_path: string
  favicon: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  meta: {
    title: string
    description: string
    keywords: string
  }
}

export interface VerticalConfig {
  vertical_id: string
  vertical_name_public: string
  branding: VerticalBranding
  nouns: {
    vendor_singular: string
    vendor_plural: string
    buyer_singular: string
    buyer_plural: string
    listing_singular: string
    listing_plural: string
    transaction_cta: string
  }
  vendor_fields: Array<{
    key: string
    label: string
    type: string
    required?: boolean
    options?: string[]
  }>
}

// Default branding for each vertical - used when config isn't available
export const defaultBranding: Record<string, VerticalBranding> = {
  fireworks: {
    domain: 'fireworksstand.com',
    brand_name: 'Fireworks Stand',
    tagline: 'Your Premier Fireworks Marketplace',
    logo_path: '/branding/fireworks-logo.svg',
    favicon: '/branding/fireworks-favicon.ico',
    colors: {
      primary: '#ff4500',
      secondary: '#ffa500',
      accent: '#ff6347',
      background: '#1a1a1a',
      text: '#ffffff'
    },
    meta: {
      title: 'Fireworks Stand - Buy & Sell Fireworks',
      description: 'Connect with licensed fireworks sellers in your area',
      keywords: 'fireworks, buy fireworks, fireworks stand, fireworks marketplace'
    }
  },
  farmers_market: {
    domain: 'farmersmarket.app',
    brand_name: 'Fresh Market',
    tagline: 'Farm Fresh, Locally Grown',
    logo_path: '/branding/farmers-logo.svg',
    favicon: '/branding/farmers-favicon.ico',
    colors: {
      primary: '#2d5016',
      secondary: '#6b8e23',
      accent: '#9acd32',
      background: '#f5f5dc',
      text: '#2d2d2d'
    },
    meta: {
      title: 'Fresh Market - Local Farmers & Producers',
      description: 'Buy fresh produce directly from local farmers',
      keywords: 'farmers market, fresh produce, local food, organic'
    }
  }
}

// Get branding for a vertical - uses defaults
export function getBrandingForVertical(verticalId: string, configBranding?: VerticalBranding | null): VerticalBranding {
  if (configBranding) return configBranding
  return defaultBranding[verticalId] || defaultBranding.fireworks
}

// Domain to vertical mapping
const domainMap: Record<string, string> = {
  'fireworksstand.com': 'fireworks',
  'www.fireworksstand.com': 'fireworks',
  'farmersmarket.app': 'farmers_market',
  'www.farmersmarket.app': 'farmers_market',
  'localhost:3002': 'fireworks',
  'inpersonmarketplace.vercel.app': 'fireworks',
}

export function getVerticalFromDomain(domain: string): string {
  return domainMap[domain] || 'fireworks'
}
