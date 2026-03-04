import { Metadata } from 'next'
import { defaultBranding } from '@/lib/branding'

interface PartnerTermsLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: PartnerTermsLayoutProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  return {
    title: `Vendor Partner Agreement | ${branding.brand_name}`,
    description: `Vendor Partner Agreement for approved ${branding.brand_name} vendors.`,
    robots: { index: false, follow: false },
  }
}

export default function PartnerTermsLayout({ children }: PartnerTermsLayoutProps) {
  return <>{children}</>
}
