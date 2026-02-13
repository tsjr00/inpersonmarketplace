import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { formatDisplayPrice } from '@/lib/constants'
import { marketBoxJsonLd } from '@/lib/marketing/json-ld'
import MarketBoxDetailClient from './MarketBoxDetailClient'
import type { Metadata } from 'next'

interface MarketBoxPageProps {
  params: Promise<{ vertical: string; id: string }>
}

// Generate Open Graph metadata for social sharing
export async function generateMetadata({ params }: MarketBoxPageProps): Promise<Metadata> {
  const { vertical, id: offeringId } = await params
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Fetch market box offering with vendor info
  const { data: offering } = await supabase
    .from('market_box_offerings')
    .select(`
      name,
      description,
      image_urls,
      price_4week_cents,
      price_cents,
      vendor_profiles!inner (
        profile_data
      )
    `)
    .eq('id', offeringId)
    .eq('vertical_id', vertical)
    .eq('active', true)
    .single()

  if (!offering) {
    return {
      title: 'Market Box Not Found',
    }
  }

  // vendor_profiles comes back as an object from the inner join
  const vendorProfile = offering.vendor_profiles as unknown as { profile_data: Record<string, unknown> } | null
  const vendorData = vendorProfile?.profile_data
  const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'

  const imageUrls = offering.image_urls as string[] | null
  const primaryImage = imageUrls?.[0]

  const priceCents = offering.price_4week_cents || offering.price_cents
  const price = priceCents ? `${formatDisplayPrice(priceCents)}/month` : ''
  const title = `${offering.name}${price ? ` - ${price}` : ''}`
  const description = offering.description
    ? offering.description.slice(0, 160)
    : `Weekly subscription box from ${vendorName} on ${branding.brand_name}`

  return {
    title: `${offering.name} - ${branding.brand_name}`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: primaryImage ? [{ url: primaryImage, alt: offering.name }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: primaryImage ? [primaryImage] : [],
    },
  }
}

export default async function MarketBoxDetailPage({ params }: MarketBoxPageProps) {
  const { vertical, id: offeringId } = await params
  const supabase = await createClient()

  // Next.js deduplicates this query (same as generateMetadata)
  const { data: offering } = await supabase
    .from('market_box_offerings')
    .select(`
      name,
      description,
      image_urls,
      price_4week_cents,
      price_cents,
      vendor_profiles!inner (
        profile_data
      )
    `)
    .eq('id', offeringId)
    .eq('vertical_id', vertical)
    .eq('active', true)
    .single()

  let jsonLdScript = null
  if (offering) {
    const vendorProfile = offering.vendor_profiles as unknown as { profile_data: Record<string, unknown> } | null
    const vendorData = vendorProfile?.profile_data
    const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'
    const imageUrls = offering.image_urls as string[] | null
    const priceCents = offering.price_4week_cents || offering.price_cents

    const jsonLd = marketBoxJsonLd({
      name: offering.name,
      description: offering.description,
      imageUrl: imageUrls?.[0] || null,
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/${vertical}/market-box/${offeringId}`,
      priceCents: priceCents || 0,
      vendorName,
    })

    jsonLdScript = (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    )
  }

  return (
    <>
      {jsonLdScript}
      <MarketBoxDetailClient />
    </>
  )
}
