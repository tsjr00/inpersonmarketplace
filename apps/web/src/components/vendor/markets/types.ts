export type Schedule = {
  id?: string
  day_of_week: number
  start_time: string
  end_time: string
  active?: boolean
}

export type Market = {
  id: string
  name: string
  market_type: string
  address: string
  city: string
  state: string
  zip: string
  latitude?: number | null
  longitude?: number | null
  day_of_week?: number
  start_time?: string
  end_time?: string
  season_start?: string
  season_end?: string
  event_start_date?: string | null
  event_end_date?: string | null
  event_url?: string | null
  expires_at?: string | null
  cutoff_hours?: number | null
  isHomeMarket?: boolean
  canUse?: boolean
  homeMarketRestricted?: boolean
  hasAttendance?: boolean
  schedules?: Schedule[]
}

export type MarketSuggestion = {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  description?: string
  website?: string
  approval_status: 'pending' | 'approved' | 'rejected'
  rejection_reason?: string
  submitted_at: string
  schedules?: Schedule[]
}

export type MarketLimits = {
  traditionalMarkets: number
  privatePickupLocations: number
  pickupWindowsPerLocation: number
  currentFixedMarketCount: number
  currentPrivatePickupCount: number
  canAddFixed: boolean
  canAddPrivatePickup: boolean
}

export type ErrorState = {
  error: string
  code?: string
  traceId?: string
  details?: string
} | null
