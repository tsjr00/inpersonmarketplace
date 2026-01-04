import { createClient } from '@/lib/supabase/client'
import type { VendorProfile, VendorStatus } from '@/lib/supabase/types'

export interface CreateVendorData {
  user_id?: string
  organization_id?: string
  vertical_id: string
  profile_data: Record<string, unknown>
  status?: VendorStatus
}

export async function createVendorProfile(data: CreateVendorData): Promise<VendorProfile | null> {
  const supabase = createClient()

  const { data: vendor, error } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: data.user_id,
      organization_id: data.organization_id,
      vertical_id: data.vertical_id,
      profile_data: data.profile_data,
      status: data.status || 'draft',
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating vendor profile:', error)
    return null
  }

  return vendor
}

export async function getVendorProfile(id: string): Promise<VendorProfile | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) {
    console.error('Error fetching vendor profile:', error)
    return null
  }

  return data
}

export async function getVendorsByVertical(verticalId: string, status?: VendorStatus): Promise<VendorProfile[]> {
  const supabase = createClient()

  let query = supabase
    .from('vendor_profiles')
    .select('*')
    .eq('vertical_id', verticalId)
    .is('deleted_at', null)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching vendors:', error)
    return []
  }

  return data || []
}

export async function updateVendorProfile(
  id: string,
  updates: Partial<Pick<VendorProfile, 'profile_data' | 'status'>>
): Promise<VendorProfile | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('vendor_profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating vendor profile:', error)
    return null
  }

  return data
}

export async function submitVendorForVerification(id: string): Promise<boolean> {
  const supabase = createClient()

  // Update vendor status to submitted
  const { error: vendorError } = await supabase
    .from('vendor_profiles')
    .update({ status: 'submitted' })
    .eq('id', id)

  if (vendorError) {
    console.error('Error submitting vendor:', vendorError)
    return false
  }

  // Create verification record
  const { error: verificationError } = await supabase
    .from('vendor_verifications')
    .insert({
      vendor_profile_id: id,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    })

  if (verificationError) {
    console.error('Error creating verification:', verificationError)
    return false
  }

  return true
}
