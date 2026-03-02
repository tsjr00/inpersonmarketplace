import { Metadata } from 'next'
import { defaultBranding } from '@/lib/branding'

interface HowItWorksLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: HowItWorksLayoutProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'

  return {
    title: `How It Works | ${branding.brand_name}`,
    description: isFT
      ? 'Learn how to order from food trucks online, skip the line at pickup, and get your food hot and ready. Step-by-step guide for food truck customers and operators.'
      : 'Learn how to order from farmers markets online, pre-order local produce, and pick up at your neighborhood market. Step-by-step guide for shoppers and vendors.',
  }
}

export default function HowItWorksLayout({ children }: HowItWorksLayoutProps) {
  return <>{children}</>
}
