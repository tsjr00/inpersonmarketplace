import type { Metadata } from 'next'
import { HeaderWrapper } from '@/components/layout/HeaderWrapper'
import { CartProviderWrapper } from '@/components/cart/CartProviderWrapper'
import { getVerticalCSSVars } from '@/lib/design-tokens'
import { customIconCssVars, DASHBOARD_ICON_SET } from '@/components/dashboard/custom-icons'
import IconSetOverride from '@/components/dashboard/IconSetOverride'
import { webSiteJsonLd } from '@/lib/marketing/json-ld'

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
  title: 'Local Market',
  description: 'Local marketplace platform.',
  icon: '/logos/farmersmarketing-full-logo.png',
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
  // Custom-icons overlay (2026-10-09): the per-vertical drawn-icon files as CSS
  // variables, read by DashboardIcon; `data-icon-set` is the switch. The
  // staging override mounts only off production.
  const iconVars = customIconCssVars(vertical)
  const iconOverrideEnabled = process.env.VERCEL_ENV !== 'production'
  const meta = verticalMeta[vertical]

  const websiteSchema = meta ? webSiteJsonLd({
    name: meta.title,
    url: meta.domain,
    description: meta.description,
  }) : null

  return (
    <CartProviderWrapper vertical={vertical}>
      <div data-icon-set={DASHBOARD_ICON_SET} style={{ minHeight: '100vh', background: 'var(--color-surface-base)', ...cssVars, ...iconVars } as React.CSSProperties}>
        {iconOverrideEnabled && <IconSetOverride />}
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
