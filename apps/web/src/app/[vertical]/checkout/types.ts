export interface CheckoutItem {
  itemType?: 'listing' | 'market_box' | undefined
  listingId: string | null
  quantity: number
  title: string
  price_cents: number
  vendor_name: string
  vendor_profile_id?: string | undefined
  available: boolean
  available_quantity: number | null
  market_id?: string | undefined
  market_name?: string | undefined
  market_type?: string | undefined
  market_city?: string | undefined
  market_state?: string | undefined
  // Pickup scheduling fields
  schedule_id?: string | null | undefined
  pickup_date?: string | null | undefined  // YYYY-MM-DD format
  pickup_display?: {
    date_formatted: string
    time_formatted: string | null
    day_name: string | null
  } | null | undefined
  // Catering / advance ordering
  advance_order_days?: number | undefined
  // Market box fields
  offeringId?: string | null | undefined
  offeringName?: string | null | undefined
  termWeeks?: number | null | undefined
  startDate?: string | null | undefined
  termPriceCents?: number | null | undefined
  pickupDayOfWeek?: number | null | undefined
  pickupStartTime?: string | null | undefined
  pickupEndTime?: string | null | undefined
  pickupFrequency?: string | null | undefined
}

export interface SuggestedProduct {
  id: string
  title: string
  price_cents: number
  image_urls?: string[] | null  // Legacy — kept for backward compat
  listing_images?: { url: string; is_primary: boolean; display_order: number }[] | null
  vendor_profile_id: string
  vendor_profiles?: {
    id: string
    business_name?: string
    tier?: string
  }
}

export interface PaymentMethod {
  id: 'stripe' | 'venmo' | 'cashapp' | 'paypal' | 'cash'
  name: string
  icon: string
  description: string
}

export interface VendorPaymentInfo {
  vendor_profile_id: string
  vendor_name: string
  venmo_username: string | null
  cashapp_cashtag: string | null
  paypal_username: string | null
  accepts_cash_at_pickup: boolean
}
