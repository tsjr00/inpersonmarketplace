// Terminology keys used across all verticals
export type TerminologyKey =
  // Vertical identity
  | 'display_name'
  // Core nouns
  | 'vendor' | 'vendors' | 'vendor_person' | 'vendor_people'
  | 'listing' | 'listings' | 'product' | 'products'
  | 'market' | 'markets' | 'traditional_market' | 'traditional_markets'
  | 'private_pickup' | 'private_pickups'
  | 'market_box' | 'market_boxes'
  | 'market_day' | 'market_hours'
  // CTAs & nav labels
  | 'browse_products_cta' | 'find_markets_cta' | 'find_vendors_cta'
  | 'vendor_signup_cta' | 'my_listings_nav' | 'create_listing_cta'
  | 'vendor_dashboard_nav' | 'suggest_market_cta'
  // Descriptive phrases
  | 'product_examples' | 'vendor_location'
  // Trust indicators
  | 'trust_vendors' | 'trust_pickup' | 'trust_payments'

export type VerticalTerminology = Record<TerminologyKey, string>

export interface FeatureBlock {
  title: string
  description: string
}

export interface VerticalContent {
  hero: {
    headline_line1: string
    headline_line2: string
    subtitle: string
  }
  how_it_works: {
    step1_title: string
    step1_text: string
    step2_title: string
    step2_text: string
    step3_title: string
    step3_text: string
    step4_title: string
    step4_text: string
  }
  vendor_pitch: {
    headline: string
    subtitle: string
    benefits: string[]
    cta: string
    description: string
  }
  features: {
    verified: FeatureBlock
    local: FeatureBlock
    no_soldout: FeatureBlock
    schedule: FeatureBlock
    mobile: FeatureBlock
    updates: FeatureBlock
  }
  platform: {
    why_choose_headline: string
    why_choose_subtitle: string
  }
  features_page: {
    hero_subtitle: string
    shopper_preorder_desc: string
    shopper_skip_lines_desc: string
    vendor_pickup_desc: string
    get_started_step1: string
  }
}

export interface VerticalTerminologyConfig {
  vertical_id: string
  terminology: VerticalTerminology
  content: VerticalContent
}
