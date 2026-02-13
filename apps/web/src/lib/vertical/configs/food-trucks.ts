import type { VerticalTerminologyConfig } from '../types'

export const foodTrucksConfig: VerticalTerminologyConfig = {
  vertical_id: 'food_trucks',

  terminology: {
    // Vertical identity
    display_name: 'Food Trucks',

    // Core nouns
    vendor: 'Food Truck',
    vendors: 'Food Trucks',
    vendor_person: 'Operator',
    vendor_people: 'food truck operators and chefs',
    listing: 'Menu Item',
    listings: 'Menu Items',
    product: 'Dish',
    products: 'Menu',
    market: 'Location',
    markets: 'Locations',
    traditional_market: 'Food Truck Park',
    traditional_markets: 'Food Truck Parks',
    private_pickup: 'Regular Stop',
    private_pickups: 'Regular Stops',
    market_box: 'Meal Plan',
    market_boxes: 'Meal Plans',
    market_day: 'Service time',
    market_hours: 'Operating Hours',

    // Descriptive phrases
    product_examples: 'tacos, BBQ, and street food',
    vendor_location: 'kitchen or commissary',

    // CTAs & nav labels
    browse_products_cta: 'Browse Menus',
    find_markets_cta: 'Find Truck Parks',
    find_vendors_cta: 'Find Food Trucks',
    vendor_signup_cta: 'List Your Food Truck',
    my_listings_nav: 'My Menu',
    create_listing_cta: 'Add Menu Item',
    vendor_dashboard_nav: 'Truck Dashboard',
    suggest_market_cta: 'Suggest a Location',

    // Trust indicators
    trust_vendors: 'Verified Trucks',
    trust_pickup: 'Skip the Line',
    trust_payments: 'Secure Payments',
  },

  content: {
    hero: {
      headline_line1: 'Skip the Line.',
      headline_line2: 'Eat Local.',
      subtitle: 'Find food trucks near you. Pre-order your favorites online and skip the line at pickup.',
    },
    how_it_works: {
      step1_title: 'Discover',
      step1_text: 'Find food trucks near you. Browse menus from local operators serving your favorite cuisines.',
      step2_title: 'Order Ahead',
      step2_text: 'Pick your truck. Add dishes to your cart. Complete your order with secure checkout.',
      step3_title: 'Skip the Line',
      step3_text: 'Head to the truck. Your pre-order is hot and ready when you arrive. No waiting.',
      step4_title: 'Enjoy',
      step4_text: 'Grab your food and go, or hang out and discover other trucks while you\'re there.',
    },
    vendor_pitch: {
      headline: 'Grow Your Food Truck Business',
      subtitle: 'Join food truck operators already taking pre-orders through our platform.',
      benefits: [
        'Accept pre-orders before service time',
        'Know demand ahead of time, reduce waste',
        'Manage your menu and orders from your phone',
        'Credit card fees built into pricing',
        'Build a loyal following of regulars',
        'Get discovered by hungry locals nearby',
      ],
      cta: 'List Your Food Truck',
      description: 'Everything you need in one place — manage your menu, track orders, and grow your customer base. Designed to support food trucks of all sizes.',
    },
    features: {
      verified: {
        title: 'Verified Trucks',
        description: 'Every truck is verified before joining. Order with confidence knowing you\'re buying from legitimate, licensed food operators.',
      },
      local: {
        title: 'Local Focus',
        description: 'Search from 10 to 100 miles to find what\'s nearest to you. Always focused on your most local trucks first.',
      },
      no_soldout: {
        title: 'Skip the Line',
        description: 'Pre-order your favorites and skip the wait. Your food is ready when you arrive.',
      },
      schedule: {
        title: 'Your Time, Your Way',
        description: 'Pre-order and pick up on your schedule. No more standing in long lines during lunch rush.',
      },
      mobile: {
        title: 'Mobile Friendly',
        description: 'Order from your phone in seconds. Add to your home screen for instant access — no app store needed.',
      },
      updates: {
        title: 'Order Updates',
        description: 'Real-time notifications when your order is confirmed and ready for pickup.',
      },
    },
    platform: {
      why_choose_headline: 'Why Choose Our Platform',
      why_choose_subtitle: 'Built for foodies and food trucks who value quality, convenience, and community',
    },
    features_page: {
      hero_subtitle: 'Pre-order from your favorite food trucks, skip the lines, and pick up when your food is ready.',
      shopper_preorder_desc: 'Pre-order your favorite dishes before the rush. Your food is prepared fresh and waiting for you.',
      shopper_skip_lines_desc: 'Walk past the line and head straight to the pickup window. Your order is ready when you arrive.',
      vendor_pickup_desc: 'Set your own pickup locations and times. Customers choose what works for them.',
      get_started_step1: 'Find food trucks near you',
    },
  },
}
