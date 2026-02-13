import { VerticalBranding } from './types'

// Fallback branding for each vertical (used if database unavailable)
// Safe to import in client components
export const defaultBranding: Record<string, VerticalBranding> = {
  fireworks: {
    domain: 'fireworksstand.com',
    brand_name: 'Fireworks Stand',
    tagline: 'Your Premier Fireworks Marketplace',
    logo_path: '/logos/fastwrks-logo.png',
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
  food_trucks: {
    domain: 'streeteats.app',
    brand_name: 'Street Eats',
    tagline: 'Skip the Line. Eat Local.',
    logo_path: '/logos/street-eats-logo.svg',
    favicon: '/logos/street-eats-logo.svg',
    colors: {
      primary: '#e85d04',
      secondary: '#dc2f02',
      accent: '#f48c06',
      background: '#fff8f0',
      text: '#2d2d2d'
    },
    meta: {
      title: 'Street Eats | Local Food Trucks Near You',
      description: 'Find food trucks near you. Pre-order your favorites online, skip the line, and pick up hot and ready. Support local food truck operators and chefs.',
      keywords: 'food trucks, food truck near me, street food, order ahead, food truck park, local food trucks, pre-order food, food truck menu'
    }
  },
  farmers_market: {
    domain: 'farmersmarket.app',
    brand_name: 'Fresh Market',
    tagline: 'Farm Fresh, Locally Grown',
    logo_path: '/logos/logo-full-color.png',
    favicon: '/branding/farmers-favicon.ico',
    colors: {
      primary: '#2d5016',
      secondary: '#6b8e23',
      accent: '#9acd32',
      background: '#f5f5dc',
      text: '#2d2d2d'
    },
    meta: {
      title: 'Fresh Market | Local Farmers Markets & Farm Fresh Food',
      description: 'Discover fresh, local food from farmers markets near you. Browse products from verified vendors, pre-order online, and pick up at your neighborhood market. Support local farmers and artisans.',
      keywords: 'farmers market, local food, fresh produce, farm fresh, local vendors, organic food, farmers market near me, local farmers, artisan food, farm to table, buy local, fresh vegetables, local meat, local bakery'
    }
  }
}
