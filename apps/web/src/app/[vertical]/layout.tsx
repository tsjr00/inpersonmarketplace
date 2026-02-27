import type { Metadata } from 'next'
import { HeaderWrapper } from '@/components/layout/HeaderWrapper'
import { CartProviderWrapper } from '@/components/cart/CartProviderWrapper'
import { getVerticalCSSVars } from '@/lib/design-tokens'

// Force dynamic rendering to ensure header always reflects current user
// This prevents caching issues when users switch accounts or duplicate tabs
export const dynamic = 'force-dynamic'

interface VerticalLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

const verticalMeta: Record<string, { title: string; description: string; icon: string }> = {
  food_trucks: {
    title: "Food Truck'n",
    description: 'Order ahead from local food trucks near you.',
    icon: '/logos/food-truckn-logo.png',
  },
  farmers_market: {
    title: 'Farmers Marketing',
    description: 'Shop local farmers, artisans, and cottage vendors.',
    icon: '/logos/farmersmarketing-full-logo.png',
  },
  fire_works: {
    title: 'Fastwrks',
    description: 'Find fireworks vendors near you.',
    icon: '/logos/fastwrks-logo.png',
  },
}

const defaultMeta = {
  title: '815 Enterprises',
  description: 'Local marketplace platform.',
  icon: '/logos/logo-icon-color.png',
}

export async function generateMetadata({ params }: VerticalLayoutProps): Promise<Metadata> {
  const { vertical } = await params
  const meta = verticalMeta[vertical] || defaultMeta

  return {
    title: {
      default: meta.title,
      template: `%s | ${meta.title}`,
    },
    description: meta.description,
    icons: {
      icon: meta.icon,
      apple: meta.icon,
    },
  }
}

export default async function VerticalLayout({
  children,
  params
}: VerticalLayoutProps) {
  const { vertical } = await params
  const cssVars = getVerticalCSSVars(vertical)

  return (
    <CartProviderWrapper vertical={vertical}>
      <div style={{ minHeight: '100vh', background: 'var(--color-surface-base)', ...cssVars } as React.CSSProperties}>
        <HeaderWrapper vertical={vertical} />
        <main>{children}</main>
      </div>
    </CartProviderWrapper>
  )
}
