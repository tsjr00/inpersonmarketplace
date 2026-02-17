import type { VerticalTerminologyConfig } from '../types'

export const farmersMarketConfig: VerticalTerminologyConfig = {
  vertical_id: 'farmers_market',

  terminology: {
    // Vertical identity
    display_name: 'Farmers Market',

    // Core nouns
    vendor: 'Vendor',
    vendors: 'Vendors',
    vendor_person: 'Farmer',
    vendor_people: 'farmers, bakers, and artisans',
    listing: 'Listing',
    listings: 'Listings',
    product: 'Product',
    products: 'Products',
    market: 'Market',
    markets: 'Markets',
    traditional_market: 'Farmers Market',
    traditional_markets: 'Farmers Markets',
    private_pickup: 'Private Pickup',
    private_pickups: 'Private Pickups',
    market_box: 'Market Box',
    market_boxes: 'Market Boxes',
    market_day: 'Market day',
    market_hours: 'Market Hours',

    // Descriptive phrases
    product_examples: 'fresh produce, baked goods, and artisan products',
    vendor_location: 'farm or shop',

    // Page-level text
    vendors_page_title: 'Local Vendors',
    vendors_page_subtitle: 'Discover farmers, bakers, and artisans selling at markets near you.',
    browse_page_subtitle: 'Discover products and market boxes from local vendors near you.',
    subscription_description: 'Market Boxes are 4-week subscription bundles curated by local vendors. Subscribe to get fresh selections delivered to your market pickup each week.',

    // Emojis
    no_results_vendor_emoji: '🧑‍🌾',
    no_results_market_emoji: '🧺',
    vendor_section_emoji: '🏪',
    market_icon_emoji: '🧺',
    vendor_icon_emoji: '🧑‍🌾',

    // CTAs & nav labels
    browse_products_cta: 'Browse Products',
    find_markets_cta: 'Find Markets',
    find_vendors_cta: 'Find Vendors',
    vendor_signup_cta: 'Become a Vendor',
    my_listings_nav: 'My Listings',
    create_listing_cta: 'Create New Listing',
    vendor_dashboard_nav: 'Vendor Dashboard',
    suggest_market_cta: 'Suggest a Farmers Market',

    // Trust indicators
    trust_vendors: 'Verified Vendors',
    trust_pickup: 'Local Pickup',
    trust_payments: 'Secure Payments',
  },

  content: {
    hero: {
      headline_line1: 'Fresh, Local Food &',
      headline_line2: 'Locally Made Products',
      subtitle: 'Browse products from local farmers and artisans. Pre-order online and pick up at your neighborhood market.',
    },
    how_it_works: {
      step1_title: 'Discover',
      step1_text: 'Find farmers markets and vendors near you. Browse fresh produce, baked goods, and artisan products.',
      step2_title: 'Shop & Order',
      step2_text: 'Choose your market. Add items to your cart. Complete your order with secure checkout (from one or more vendors).',
      step3_title: 'Pick Up Fresh',
      step3_text: 'Visit the market. Collect your pre-ordered items — your selections are set aside and waiting.',
      step4_title: 'Enjoy the Market',
      step4_text: 'Take your time browsing other vendors, meet friends, and enjoy being part of your local community.',
    },
    vendor_pitch: {
      headline: 'Grow Your Business',
      subtitle: 'Join local farmers, bakers, and artisans already selling through our platform.',
      benefits: [
        'Pre-sell products before market day',
        'Know what to bring, reduce waste',
        'Manage orders and inventory easily',
        'Credit card fees already built in',
        'Build a loyal VIP customer base',
        'Get discovered by local shoppers',
      ],
      cta: 'Become a Vendor',
      description: 'Everything you need in one place — manage listings, track orders, and grow your customer base. Designed to support vendors of all sizes, from weekend market stands to full-time operations.',
    },
    features: {
      verified: {
        title: 'Verified Vendors',
        description: 'Every vendor is verified before joining. Shop with confidence knowing you\'re buying from legitimate local sellers.',
      },
      local: {
        title: 'Local Focus',
        description: 'Search from 10 to 100 miles to find what\'s nearest to you. Built to serve both urban neighborhoods and rural communities — always focused on your most local vendors first.',
      },
      no_soldout: {
        title: 'No Sold-Out Items',
        description: 'Pre-order your favorites with confirmed availability from the vendor. Sleep in on market day and still get everything you want.',
      },
      schedule: {
        title: 'Your Time, Your Way',
        description: 'Pre-order and pick up on your schedule. Enjoy the market experience without the early morning rush.',
      },
      mobile: {
        title: 'Mobile Friendly',
        description: 'Shop from any device, whether you\'re on the go or browsing from home. No laptop needed — everything works beautifully from your phone.',
      },
      updates: {
        title: 'Order Updates',
        description: 'Stay informed with in-app, SMS, and email notifications. Opt into what you prefer and never miss an update.',
      },
    },
    platform: {
      why_choose_headline: 'Why Choose Our Platform',
      why_choose_subtitle: 'Built for shoppers and vendors who value quality, convenience, and community',
    },
    features_page: {
      hero_subtitle: 'Pre-order from your favorite farmers market vendors, skip the lines, and pick up on your schedule.',
      shopper_preorder_desc: 'Pre-order the best produce, baked goods, and artisan products before they sell out. Your items are reserved and waiting for you.',
      shopper_skip_lines_desc: 'Walk past the crowds and head straight to pickup. Spend your market time enjoying the atmosphere, not waiting.',
      vendor_pickup_desc: 'Offer pickup at farmers markets or set up private pickup locations. Flexibility for you and your customers.',
      get_started_step1: 'Browse local farmers markets',
    },
    featured_section: {
      headline: 'Discover Markets in Your Community',
      paragraph1: "Farmers markets are more than shopping \u2014 they\u2019re the heartbeat of local communities. For many family farms and small businesses, a weekly market stand is essential revenue that keeps their operations alive.",
      paragraph2: "Every dollar spent locally circulates back into your neighborhood, supporting the growers, makers, and families who make your community vibrant. We\u2019re here to make that connection easier.",
      link_text: 'Find markets near you',
    },
    trust_stats: {
      products_label: 'Products',
      vendors_label: 'Vendors',
      markets_label: 'Markets',
      tagline: 'Supporting local producers and artisans in your community',
      tagline_location: 'Supporting local producers and artisans in the {area} area',
    },
    get_the_app: {
      headline: 'Fresh & Local, Wherever You Go',
      subtitle: 'Browse vendors, place orders, and manage pickups right from your phone. Get notifications when your order is ready \u2014 all without leaving home.',
      features: [
        'Quick ordering from anywhere',
        'Real-time order notifications',
        'Easy vendor discovery',
        'Browse on the go from your phone',
      ],
      phone_products: [
        { name: 'Fresh Tomatoes', price: '$4.50', color: '#e74c3c' },
        { name: 'Local Honey', price: '$12.00', color: '#f39c12' },
        { name: 'Sourdough Bread', price: '$7.00', color: '#d4a574' },
        { name: 'Mixed Berries', price: '$6.00', color: '#8e44ad' },
      ],
    },
    final_cta: {
      subtitle: 'Join our growing community connecting local producers, artisans, and the neighbors who support them.',
    },
  },
}
