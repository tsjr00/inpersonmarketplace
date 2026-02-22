export interface CheckoutItem {
  itemType?: 'listing' | 'market_box'
  listingId: string | null
  quantity: number
  title: string
  price_cents: number
  vendor_name: string
  vendor_profile_id?: string
  available: boolean
  available_quantity: number | null
  market_id?: string
  market_name?: string
  market_type?: string
  market_city?: string
  market_state?: string
  // Pickup scheduling fields
  schedule_id?: string | null
  pickup_date?: string | null  // YYYY-MM-DD format
  pickup_display?: {
    date_formatted: string
    time_formatted: string | null
    day_name: string | null
  } | null
  // Market box fields
  offeringId?: string | null
  offeringName?: string | null
  termWeeks?: number | null
  startDate?: string | null
  termPriceCents?: number | null
  pickupDayOfWeek?: number | null
  pickupStartTime?: string | null
  pickupEndTime?: string | null
}

export interface SuggestedProduct {
  id: string
  title: string
  price_cents: number
  image_urls?: string[] | null
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
