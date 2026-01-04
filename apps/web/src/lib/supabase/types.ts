// Database types for InPersonMarketplace
// These types match the schema defined in supabase/migrations/

export type UserRole = 'buyer' | 'vendor' | 'admin' | 'verifier'
export type VendorStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'suspended'
export type VerificationStatus = 'pending' | 'in_review' | 'approved' | 'rejected'
export type ListingStatus = 'draft' | 'published' | 'paused' | 'archived'
export type TransactionStatus = 'initiated' | 'accepted' | 'declined' | 'canceled' | 'fulfilled' | 'expired'
export type FulfillmentMode = 'pickup' | 'delivery' | 'meetup'
export type FulfillmentStatus = 'pending' | 'confirmed' | 'completed' | 'failed'

export interface UserProfile {
  id: string
  user_id: string
  email: string | null
  phone: string | null
  display_name: string | null
  roles: UserRole[]
  avatar_url: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Organization {
  id: string
  legal_name: string
  dba_name: string | null
  owner_user_id: string
  tax_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Vertical {
  id: string
  vertical_id: string
  name_public: string
  config: VerticalConfig
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VerticalConfig {
  vertical_id: string
  vertical_name_public: string
  nouns: {
    vendor_singular: string
    vendor_plural: string
    buyer_singular: string
    buyer_plural: string
    listing_singular: string
    listing_plural: string
    transaction_cta: string
  }
  seasonality: {
    mode: string
    windows: Array<{
      label: string
      start_mmdd?: string
      end_mmdd?: string
      days_of_week?: string[]
      start_time?: string
      end_time?: string
    }>
  }
  verification: {
    required: boolean
    method: string
    badges: {
      pending: string
      approved: string
      rejected: string
    }
  }
  location: {
    allowed_types: string[]
    public_map_pin_required: boolean
  }
  fulfillment: {
    modes: string[]
  }
  payment: {
    mode: string
    notes: string
  }
  vendor_fields: FieldDefinition[]
  listing_fields: FieldDefinition[]
  buyer_fields: FieldDefinition[]
  buyer_filters: FieldDefinition[]
  agreements: {
    vendor: string[]
    buyer: string[]
  }
}

export interface FieldDefinition {
  key: string
  label: string
  type: string
  required?: boolean
  options?: string[]
  default?: string
  accept?: string[]
  help_text?: string
}

export interface VendorProfile {
  id: string
  user_id: string | null
  organization_id: string | null
  vertical_id: string
  status: VendorStatus
  profile_data: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface VendorVerification {
  id: string
  vendor_profile_id: string
  status: VerificationStatus
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  notes: string | null
  documents: Array<{
    path: string
    type: string
    name: string
  }>
  created_at: string
  updated_at: string
}

export interface Listing {
  id: string
  vendor_profile_id: string
  vertical_id: string
  status: ListingStatus
  listing_data: Record<string, unknown>
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  latitude: number | null
  longitude: number | null
  available_from: string | null
  available_to: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ListingImage {
  id: string
  listing_id: string
  storage_path: string
  url: string | null
  alt_text: string | null
  display_order: number
  is_primary: boolean
  created_at: string
}

export interface Transaction {
  id: string
  listing_id: string
  vendor_profile_id: string
  buyer_user_id: string
  vertical_id: string
  status: TransactionStatus
  buyer_data: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Fulfillment {
  id: string
  transaction_id: string
  mode: FulfillmentMode
  status: FulfillmentStatus
  scheduled_at: string | null
  confirmed_at: string | null
  completed_at: string | null
  location_notes: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string | null
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}

// Database type for Supabase client
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: UserProfile
        Insert: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserProfile, 'id' | 'created_at'>>
      }
      organizations: {
        Row: Organization
        Insert: Omit<Organization, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Organization, 'id' | 'created_at'>>
      }
      verticals: {
        Row: Vertical
        Insert: Omit<Vertical, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Vertical, 'id' | 'created_at'>>
      }
      vendor_profiles: {
        Row: VendorProfile
        Insert: Omit<VendorProfile, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<VendorProfile, 'id' | 'created_at'>>
      }
      vendor_verifications: {
        Row: VendorVerification
        Insert: Omit<VendorVerification, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<VendorVerification, 'id' | 'created_at'>>
      }
      listings: {
        Row: Listing
        Insert: Omit<Listing, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Listing, 'id' | 'created_at'>>
      }
      listing_images: {
        Row: ListingImage
        Insert: Omit<ListingImage, 'id' | 'created_at'>
        Update: Partial<Omit<ListingImage, 'id' | 'created_at'>>
      }
      transactions: {
        Row: Transaction
        Insert: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Transaction, 'id' | 'created_at'>>
      }
      fulfillments: {
        Row: Fulfillment
        Insert: Omit<Fulfillment, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Fulfillment, 'id' | 'created_at'>>
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, 'id' | 'created_at'>
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>
      }
    }
  }
}
