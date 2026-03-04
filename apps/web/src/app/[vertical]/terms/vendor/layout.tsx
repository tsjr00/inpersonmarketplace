import { Metadata } from 'next'
import { defaultBranding } from '@/lib/branding'

interface VendorTermsLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: VendorTermsLayoutProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  return {
    title: `Vendor Service Agreement | ${branding.brand_name}`,
    description: `Vendor Service Agreement for ${branding.brand_name} vendors.`,
    robots: { index: false, follow: false },
  }
}

export default function VendorTermsLayout({ children }: VendorTermsLayoutProps) {
  return <>{children}</>
}
