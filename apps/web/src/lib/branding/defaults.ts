import { VerticalBranding } from './types'

// Fallback branding for each vertical (used if database unavailable)
// Safe to import in client components
export const defaultBranding: Record<string, VerticalBranding> = {
  fire_works: {
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
    domain: 'foodtruckn.app',
    brand_name: "Food Truck'n",
    tagline: 'Skip the Line. Eat Local.',
    logo_path: '/logos/food-truckn-logo.png',
    favicon: '/logos/food-truckn-logo.png',
    colors: {
      primary: '#ff5757',
      secondary: '#ff3131',
      accent: '#ff3131',
      background: '#ffffff',
      text: '#1a1a1a'
    },
    meta: {
      title: "Food Truck'n | Order from Food Trucks Near You",
      description: 'Find food trucks near you and order online. Skip the line with pre-orders, browse menus, and pick up hot and ready. Chef Box meal subscriptions, food truck catering, and mobile food ordering made simple.',
      keywords: 'food truck near me, order from food truck online, food truck ordering app, skip the line food truck, food truck pre-order, food truck menu online, chef box meal subscription, food truck catering, street food ordering, food truck park near me, mobile food ordering, local food trucks, support local food trucks, taco truck near me, mexican food truck, bbq food truck, pizza food truck, burger food truck, indian food truck, thai food truck, halal food truck, food truck dallas, food truck houston, food truck austin, food truck san antonio, food truck festival, food truck business, sunday food truck'
    }
  },
  farmers_market: {
    domain: 'farmersmarketing.app',
    brand_name: 'Farmers Marketing',
    tagline: 'Farm Fresh, Locally Grown',
    logo_path: '/logos/farmersmarketing-full-logo.png',
    favicon: '/branding/farmers-favicon.ico',
    colors: {
      primary: '#2d5016',
      secondary: '#6b8e23',
      accent: '#9acd32',
      background: '#f5f5dc',
      text: '#2d2d2d'
    },
    meta: {
      title: 'Farmers Marketing | Order from Farmers Markets Near You Online',
      description: 'Order from farmers markets near you online. Pre-order fresh produce, baked goods, and artisan products from verified local vendors. Market Box subscriptions, farm to table marketplace, and local pickup. A modern CSA alternative.',
      keywords: 'farmers market near me, order from farmers market online, pre-order farmers market, buy local produce online, farm to table marketplace, market box subscription, CSA alternative, local farm produce, farmers market pickup, support local farmers, fresh produce delivery, farmers market online ordering, local vendors near me, artisan food marketplace, cottage food, cottage food law, texas cottage food, cottage food seller, homemade goods, farmers market sunday, farmers market today, farmers market dallas, farmers market houston, farmers market austin, local honey, handmade products, cottage food license, home baked goods'
    }
  }
}
