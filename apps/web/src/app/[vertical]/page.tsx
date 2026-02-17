import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import {
  Hero,
  TrustStats,
  HowItWorks,
  FeaturedMarkets,
  VendorPitch,
  Features,
  FinalCTA,
  Footer,
  GetTheApp
} from '@/components/landing'

interface VerticalHomePageProps {
  params: Promise<{ vertical: string }>
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: VerticalHomePageProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  const title = branding.meta.title
  const description = branding.meta.description
  const keywords = branding.meta.keywords

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'en_US',
      siteName: branding.brand_name,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    alternates: {
      canonical: `/${vertical}`,
    },
  }
}

// Fetch stats from database with fallback values for display
async function getVerticalStats(supabase: Awaited<ReturnType<typeof createClient>>, vertical: string) {
  // Get listing count
  const { count: listingCount } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vertical_id', vertical)
    .eq('status', 'published')
    .is('deleted_at', null)

  // Get vendor count
  const { count: vendorCount } = await supabase
    .from('vendor_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('vertical_id', vertical)
    .eq('status', 'approved')

  // Get market count
  const { count: marketCount } = await supabase
    .from('markets')
    .select('*', { count: 'exact', head: true })
    .eq('vertical_id', vertical)
    .eq('status', 'active')

  // Use real counts if available, otherwise use reasonable fallback values
  // Fallbacks ensure the page looks populated during early launch
  return {
    listingCount: (listingCount && listingCount > 0) ? listingCount : 50,
    vendorCount: (vendorCount && vendorCount > 0) ? vendorCount : 25,
    marketCount: (marketCount && marketCount > 0) ? marketCount : 5,
  }
}

export default async function VerticalHomePage({ params }: VerticalHomePageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Redirect logged-in users to their dashboard (2-3 click goal)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    redirect(`/${vertical}/dashboard`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Fetch stats only - FeaturedMarkets is now text-only per Tracy's decision
  const stats = await getVerticalStats(supabase, vertical)

  // Generate Schema.org structured data
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      // Organization
      {
        '@type': 'Organization',
        '@id': `https://${branding.domain}/#organization`,
        name: branding.brand_name,
        url: `https://${branding.domain}`,
        logo: {
          '@type': 'ImageObject',
          url: `https://${branding.domain}${branding.logo_path}`,
        },
        description: branding.meta.description,
      },
      // WebSite
      {
        '@type': 'WebSite',
        '@id': `https://${branding.domain}/#website`,
        url: `https://${branding.domain}`,
        name: branding.brand_name,
        publisher: {
          '@id': `https://${branding.domain}/#organization`,
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: `https://${branding.domain}/${vertical}/browse?search={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      // WebPage
      {
        '@type': 'WebPage',
        '@id': `https://${branding.domain}/${vertical}/#webpage`,
        url: `https://${branding.domain}/${vertical}`,
        name: branding.meta.title,
        description: branding.meta.description,
        isPartOf: {
          '@id': `https://${branding.domain}/#website`,
        },
        about: {
          '@id': `https://${branding.domain}/#organization`,
        },
      },
    ],
  }

  return (
    <>
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <main>
        {/* Hero Section */}
        <Hero vertical={vertical} />

        {/* Trust Statistics */}
        <TrustStats vertical={vertical} stats={stats} />

        {/* How It Works */}
        <HowItWorks vertical={vertical} />

        {/* Featured Markets - Text only section, no database needed */}
        <FeaturedMarkets vertical={vertical} />

        {/* Platform Features */}
        <Features vertical={vertical} />

        {/* Vendor Pitch */}
        <VendorPitch vertical={vertical} />

        {/* Get The App */}
        <GetTheApp vertical={vertical} />

        {/* Final CTA */}
        <FinalCTA vertical={vertical} />

        {/* Footer */}
        <Footer vertical={vertical} />
      </main>
    </>
  )
}
