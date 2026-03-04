import { Metadata } from 'next'
import { defaultBranding } from '@/lib/branding'

interface TermsLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: TermsLayoutProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  return {
    title: `Terms of Service & Privacy Policy | ${branding.brand_name}`,
    description: `Platform User Agreement and Privacy Policy for ${branding.brand_name}.`,
  }
}

export default function TermsLayout({ children }: TermsLayoutProps) {
  return <>{children}</>
}
