import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding/defaults'
import PickupSignsClient from './PickupSignsClient'

interface PageProps {
  params: Promise<{ vertical: string }>
}

/**
 * /[vertical]/vendor/pickup-signs — the standardized, branded "APP ORDER
 * PICKUP" sign vendors print (8.5×11 / 11×17) to mark the separate pickup
 * line for in-app orders (owner, 2026-08-28). Server side only resolves who
 * the vendor is and which brand; the sign itself is a print-styled client
 * component.
 */
export default async function PickupSignsPage({ params }: PageProps) {
  const { vertical } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, profile_data')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .maybeSingle()
  if (!vendorProfile) redirect(`/${vertical}/vendor-signup`)

  const pd = (vendorProfile.profile_data ?? {}) as Record<string, unknown>
  const businessName = (pd.business_name as string) || (pd.farm_name as string) || 'Your business'
  const brand = defaultBranding[vertical] ?? defaultBranding.farmers_market!

  return (
    <PickupSignsClient
      vertical={vertical}
      brandName={brand.brand_name}
      tagline={brand.tagline}
      logoPath={brand.logo_path}
      primary={brand.colors.primary}
      businessName={businessName}
    />
  )
}
