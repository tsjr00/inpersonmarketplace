import type { Metadata } from 'next'
import { HeaderWrapper } from '@/components/layout/HeaderWrapper'
import { CartProviderWrapper } from '@/components/cart/CartProviderWrapper'
import { getVerticalCSSVars } from '@/lib/design-tokens'
import { webSiteJsonLd } from '@/lib/marketing/json-ld'

// Force dynamic rendering to ensure header always reflects current user
// This prevents caching issues when users switch accounts or duplicate tabs
export const dynamic = 'force-dynamic'

interface VerticalLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

const verticalMeta: Record<string, { title: string; description: string; icon: string; domain: string }> = {
  food_trucks: {
    title: "Food Truck'n",
    description: 'Find food trucks near you. Pre-order online, skip the line, and pick up hot and ready.',
    icon: '/logos/food-truckn-logo.png',
    domain: 'https://foodtruckn.app',
  },
  farmers_market: {
    title: 'Farmers Marketing',
    description: 'Order from farmers markets near you. Pre-order local produce and artisan goods online.',
    icon: '/logos/farmersmarketing-full-logo.png',
    domain: 'https://farmersmarketing.app',
  },
  fire_works: {
    title: 'Fastwrks',
    description: 'Find fireworks vendors near you.',
    icon: '/logos/fastwrks-logo.png',
    domain: 'https://fireworksstand.com',
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
  const meta = verticalMeta[vertical]

  const websiteSchema = meta ? webSiteJsonLd({
    name: meta.title,
    url: meta.domain,
    description: meta.description,
  }) : null

  return (
    <CartProviderWrapper vertical={vertical}>
      <div style={{ minHeight: '100vh', background: 'var(--color-surface-base)', ...cssVars } as React.CSSProperties}>
        {websiteSchema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
          />
        )}
        <HeaderWrapper vertical={vertical} />
        <main>{children}</main>
      </div>
    </CartProviderWrapper>
  )
}
