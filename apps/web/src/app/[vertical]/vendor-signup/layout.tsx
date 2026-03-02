import { Metadata } from 'next'
import { defaultBranding } from '@/lib/branding'

interface VendorSignupLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: VendorSignupLayoutProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'

  return {
    title: isFT
      ? `List Your Food Truck | ${branding.brand_name}`
      : `Become a Vendor | ${branding.brand_name}`,
    description: isFT
      ? 'Get your food truck listed on the top food truck ordering platform. Accept pre-orders online, manage your menu, and grow your customer base. Free to start.'
      : 'Sell at farmers markets online. Perfect for cottage food producers, home bakers, farmers, and artisans. Accept pre-orders, manage listings, and grow your business.',
  }
}

export default function VendorSignupLayout({ children }: VendorSignupLayoutProps) {
  return <>{children}</>
}
