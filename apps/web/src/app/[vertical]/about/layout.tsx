import { Metadata } from 'next'
import { defaultBranding } from '@/lib/branding'

interface AboutLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: AboutLayoutProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'

  return {
    title: `About Us | ${branding.brand_name}`,
    description: isFT
      ? 'About Food Truck\'n — connecting communities with local food trucks and street food vendors. Order online, skip the line, and support local food truck operators and chefs.'
      : 'About Local Market — connecting communities with local farmers, bakers, and artisans. Order from farmers markets online and support local producers in your neighborhood.',
  }
}

export default function AboutLayout({ children }: AboutLayoutProps) {
  return <>{children}</>
}
