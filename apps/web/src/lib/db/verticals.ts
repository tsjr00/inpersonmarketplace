import { createClient } from '@/lib/supabase/client'
import type { Vertical, VerticalConfig } from '@/lib/supabase/types'

export async function getVerticals(): Promise<Vertical[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('verticals')
    .select('*')
    .eq('is_active', true)
    .order('name_public')

  if (error) {
    console.error('Error fetching verticals:', error)
    return []
  }

  return data || []
}

export async function getVerticalById(verticalId: string): Promise<Vertical | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('verticals')
    .select('*')
    .eq('vertical_id', verticalId)
    .eq('is_active', true)
    .single()

  if (error) {
    console.error('Error fetching vertical:', error)
    return null
  }

  return data
}

export async function getVerticalConfig(verticalId: string): Promise<VerticalConfig | null> {
  const vertical = await getVerticalById(verticalId)
  return vertical?.config || null
}

export async function getVendorFields(verticalId: string) {
  const config = await getVerticalConfig(verticalId)
  return config?.vendor_fields || []
}

export async function getListingFields(verticalId: string) {
  const config = await getVerticalConfig(verticalId)
  return config?.listing_fields || []
}

export async function getBuyerFields(verticalId: string) {
  const config = await getVerticalConfig(verticalId)
  return config?.buyer_fields || []
}
