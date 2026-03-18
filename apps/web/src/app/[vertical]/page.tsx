import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { spacing, typography, containers } from '@/lib/design-tokens'
import { getLocale } from '@/lib/locale/server'
import {
  Hero,
  TrustStats,
  HowItWorks,
  FeaturedMarkets,
  VendorPitch,
  Features,
  FinalCTA,
  Footer,
  GetTheApp,
  DottedSeparator
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

  // Use real counts — show 0 honestly rather than fake data
  return {
    listingCount: listingCount || 0,
    vendorCount: vendorCount || 0,
    marketCount: marketCount || 0,
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

  // Fetch stats and locale
  const stats = await getVerticalStats(supabase, vertical)
  const locale = await getLocale()

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
      {/* Safe: JSON-LD structured data — server-rendered, no user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <main>
        {/* Hero Section — FT gets stats inline */}
        <Hero vertical={vertical} stats={stats} locale={locale} />

        {/* Trust Statistics — FM only (FT renders stats inline inside Hero) */}
        {vertical !== 'food_trucks' && (
          <TrustStats vertical={vertical} stats={stats} locale={locale} />
        )}

        {vertical !== 'food_trucks' && (
          <>
            {/* How It Works — FM only (consolidated into Features for FT) */}
            <HowItWorks vertical={vertical} locale={locale} />

            {/* Featured Markets — FM only (consolidated for FT) */}
            <FeaturedMarkets vertical={vertical} locale={locale} />
          </>
        )}

        {/* Platform Features */}
        <Features vertical={vertical} locale={locale} />

        {/* Private Events CTA — FT only */}
        {vertical === 'food_trucks' && (
          <section style={{
            padding: '48px 24px',
            backgroundColor: '#1a1a1a',
            color: 'white',
            textAlign: 'center',
          }}>
            <div style={{ maxWidth: 800, margin: '0 auto' }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px 0', color: '#ff5757' }}>
                🎪 Private Events &amp; Corporate Catering
              </h2>
              <p style={{ fontSize: 18, margin: '0 0 24px 0', lineHeight: 1.6, color: '#d1d5db' }}>
                Bring food trucks to your office, celebration, or company event.
                We handle the planning — you enjoy the food.
              </p>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 24,
                marginBottom: 32,
              }}>
                {[
                  { icon: '🍕', label: 'Tacos, BBQ, Asian, Pizza & more' },
                  { icon: '👥', label: 'Events from 10 to 5,000 guests' },
                  { icon: '📋', label: 'We match trucks to your needs' },
                  { icon: '📱', label: 'Guests pre-order online' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: '#e5e7eb' }}>
                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <a
                href={`/${vertical}/events`}
                style={{
                  display: 'inline-block',
                  padding: '14px 40px',
                  backgroundColor: '#ff5757',
                  color: 'white',
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Request a Quote
              </a>
            </div>
          </section>
        )}

        {/* Vendor Pitch */}
        <VendorPitch vertical={vertical} locale={locale} />

        {vertical !== 'food_trucks' && (
          <>
            {/* Get The App — FM only (simplified phone mockup is inside Features for FT) */}
            <GetTheApp vertical={vertical} locale={locale} />

            {/* Final CTA — FM only (consolidated for FT) */}
            <FinalCTA vertical={vertical} locale={locale} />
          </>
        )}

        {/* Events strip — thin section matching TrustStats style, FT only */}
        {vertical === 'food_trucks' && (
          <section
            className="flex justify-center"
            style={{
              backgroundColor: '#6b6b6b',
              padding: `${spacing.lg} 0`,
            }}
          >
            <div
              className="w-full"
              style={{
                maxWidth: containers.lg,
                paddingLeft: 'clamp(20px, 5vw, 60px)',
                paddingRight: 'clamp(20px, 5vw, 60px)',
              }}
            >
              <p
                className="text-center"
                style={{
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: spacing.md,
                  marginTop: 0,
                }}
              >
                Private Events &amp; Corporate Catering
              </p>
              <div
                className="grid grid-cols-3"
                style={{ gap: spacing.md, textAlign: 'center' }}
              >
                <div>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🍽️</div>
                  <div style={{ fontSize: typography.sizes.sm, color: '#ffffff', fontWeight: typography.weights.medium, lineHeight: 1.5 }}>
                    Feed your team with local food trucks — perfect for office lunches and company events
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>📋</div>
                  <div style={{ fontSize: typography.sizes.sm, color: '#ffffff', fontWeight: typography.weights.medium, lineHeight: 1.5 }}>
                    We match verified, insured trucks to your event — you just pick the date
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>📱</div>
                  <div style={{ fontSize: typography.sizes.sm, color: '#ffffff', fontWeight: typography.weights.medium, lineHeight: 1.5 }}>
                    Your guests pre-order online so food is ready when they arrive — no long lines
                  </div>
                </div>
              </div>
              <div className="text-center" style={{ marginTop: spacing.md }}>
                <a
                  href={`/${vertical}/events`}
                  style={{
                    display: 'inline-block',
                    padding: '10px 28px',
                    backgroundColor: 'transparent',
                    color: '#ffffff',
                    border: '2px solid #ffffff',
                    borderRadius: 6,
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    textDecoration: 'none',
                  }}
                >
                  Request a Quote
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <Footer vertical={vertical} locale={locale} />
      </main>
    </>
  )
}
