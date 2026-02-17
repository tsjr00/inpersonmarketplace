import { createClient } from '@/lib/supabase/client'
import type { Listing, ListingStatus } from '@/lib/supabase/types'

export interface CreateListingData {
  vendor_profile_id: string
  vertical_id: string
  listing_data: Record<string, unknown>
  address?: string
  city?: string
  state?: string
  zip?: string
  latitude?: number
  longitude?: number
  available_from?: string
  available_to?: string
  quantity_amount?: number
  quantity_unit?: string
  status?: ListingStatus
}

export async function createListing(data: CreateListingData): Promise<Listing | null> {
  const supabase = createClient()

  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      ...data,
      status: data.status || 'draft',
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating listing:', error)
    return null
  }

  return listing
}

export async function getListing(id: string): Promise<Listing | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) {
    console.error('Error fetching listing:', error)
    return null
  }

  return data
}

export async function getListingsByVertical(
  verticalId: string,
  options?: {
    status?: ListingStatus
    city?: string
    limit?: number
  }
): Promise<Listing[]> {
  const supabase = createClient()

  let query = supabase
    .from('listings')
    .select('*')
    .eq('vertical_id', verticalId)
    .is('deleted_at', null)

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.city) {
    query = query.ilike('city', `%${options.city}%`)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching listings:', error)
    return []
  }

  return data || []
}

export async function getListingsByVendor(vendorProfileId: string): Promise<Listing[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('vendor_profile_id', vendorProfileId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching vendor listings:', error)
    return []
  }

  return data || []
}

export async function updateListing(
  id: string,
  updates: Partial<Omit<Listing, 'id' | 'created_at' | 'updated_at'>>
): Promise<Listing | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('listings')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating listing:', error)
    return null
  }

  return data
}

export async function publishListing(id: string): Promise<boolean> {
  const result = await updateListing(id, { status: 'published' })
  return result !== null
}

export async function archiveListing(id: string): Promise<boolean> {
  const result = await updateListing(id, { status: 'archived' })
  return result !== null
}
