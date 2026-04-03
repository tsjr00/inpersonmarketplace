import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { spacing, typography, radius, containers } from '@/lib/design-tokens'
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
} from '@/components/landing'

// FM landing page watermelon palette (landing-only)
const FM_WATERMELON = '#FF6B6B'
const FM_GREEN = '#4CAF50'

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

  const isFM = vertical === 'farmers_market'
  const isFT = vertical === 'food_trucks'

  return (
    <>
      {/* Safe: JSON-LD structured data — server-rendered, no user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <main>
        {/* Hero Section */}
        <Hero vertical={vertical} stats={stats} locale={locale} />

        {/* Trust Statistics — FM + other (FT renders stats inline inside Hero) */}
        {!isFT && (
          <TrustStats vertical={vertical} stats={stats} locale={locale} />
        )}

        {/* === FM-SPECIFIC SECTIONS === */}
        {isFM && (
          <>
            {/* Section 4: Action Buttons — 3 watermelon buttons */}
            <section
              className="flex justify-center"
              style={{
                backgroundColor: '#ffffff',
                paddingTop: spacing.sm,
                paddingBottom: spacing.lg,
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
                <div
                  className="flex flex-col sm:flex-row justify-center items-center"
                  style={{ gap: spacing.xs }}
                >
                  {[
                    { label: 'Browse Products', href: `/${vertical}/browse` },
                    { label: 'Find Vendors', href: `/${vertical}/browse?view=vendors` },
                    { label: 'Find Markets', href: `/${vertical}/browse?view=markets` },
                  ].map((cta) => (
                    <Link
                      key={cta.label}
                      href={cta.href}
                      className="inline-flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: FM_WATERMELON,
                        color: '#ffffff',
                        padding: `${spacing.sm} ${spacing.lg}`,
                        borderRadius: radius.full,
                        fontSize: typography.sizes.base,
                        fontWeight: typography.weights.semibold,
                        minWidth: '200px',
                        border: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cta.label}
                    </Link>
                  ))}
                </div>
              </div>
            </section>

            {/* Section 5: FM2 image + local impact text */}
            <section
              style={{
                backgroundColor: '#ffffff',
                paddingBottom: spacing.xl,
              }}
            >
              <Image
                src="/images/landing/fm-local-products.jpg"
                alt="Local products at a farmers market — fresh vegetables in wooden crates"
                width={1200}
                height={600}
                sizes="100vw"
                style={{
                  width: '100%',
                  height: 'auto',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <div
                className="flex justify-center"
                style={{
                  paddingTop: spacing.lg,
                  paddingLeft: 'clamp(20px, 5vw, 60px)',
                  paddingRight: 'clamp(20px, 5vw, 60px)',
                }}
              >
                <p
                  className="text-center"
                  style={{
                    fontSize: typography.sizes.base,
                    lineHeight: typography.leading.relaxed,
                    color: '#4b5563',
                    maxWidth: '640px',
                  }}
                >
                  Every dollar spent locally circulates back into your neighborhood, supporting the growers, makers, and families who make your community vibrant. We&apos;re here to make that connection easier.
                </p>
              </div>
            </section>
          </>
        )}

        {/* Non-FM, non-FT sections (HowItWorks, FeaturedMarkets) */}
        {!isFT && !isFM && (
          <>
            <HowItWorks vertical={vertical} locale={locale} />
            <FeaturedMarkets vertical={vertical} locale={locale} />
          </>
        )}

        {/* Platform Features */}
        <Features vertical={vertical} locale={locale} />

        {/* FM: Event CTA Banner */}
        {isFM && (
          <section
            className="flex justify-center"
            style={{
              backgroundColor: FM_WATERMELON,
              padding: `${spacing.xl} 0`,
            }}
          >
            <div
              className="w-full text-center"
              style={{
                maxWidth: containers.lg,
                paddingLeft: 'clamp(20px, 5vw, 60px)',
                paddingRight: 'clamp(20px, 5vw, 60px)',
              }}
            >
              <h2
                style={{
                  fontSize: typography.sizes['2xl'],
                  fontWeight: typography.weights.bold,
                  color: '#ffffff',
                  marginBottom: spacing.md,
                }}
              >
                Bring the Market to Your Event!
              </h2>
              <Link
                href={`/${vertical}/events`}
                className="inline-flex items-center justify-center transition-all"
                style={{
                  backgroundColor: FM_GREEN,
                  color: '#ffffff',
                  padding: `${spacing.sm} ${spacing.xl}`,
                  borderRadius: radius.full,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  border: 'none',
                }}
              >
                Find Out More
              </Link>
            </div>
          </section>
        )}

        {/* FM: FM3 image + event description text */}
        {isFM && (
          <section
            style={{
              backgroundColor: '#ffffff',
              paddingBottom: spacing.xl,
            }}
          >
            <Image
              src="/images/landing/fm-market-scene.jpg"
              alt="Outdoor farmers market with vendor tents and artisan products"
              width={1200}
              height={600}
              sizes="100vw"
              style={{
                width: '100%',
                height: 'auto',
                objectFit: 'cover',
                display: 'block',
              }}
            />
            <div
              className="flex justify-center"
              style={{
                paddingTop: spacing.lg,
                paddingLeft: 'clamp(20px, 5vw, 60px)',
                paddingRight: 'clamp(20px, 5vw, 60px)',
              }}
            >
              <p
                className="text-center"
                style={{
                  fontSize: typography.sizes.base,
                  lineHeight: typography.leading.relaxed,
                  color: '#4b5563',
                  maxWidth: '640px',
                }}
              >
                We curate and coordinate local farmers, market vendors, and artisans for your events or venue. From baked goods and fresh flowers to artisan products, we build a custom market for your guests. You tell us what you want — we handle the rest.
              </p>
            </div>
          </section>
        )}

        {/* Vendor Pitch */}
        <VendorPitch vertical={vertical} locale={locale} />

        {/* Non-FM, non-FT extra sections */}
        {!isFT && !isFM && (
          <>
            <GetTheApp vertical={vertical} locale={locale} />
            <FinalCTA vertical={vertical} locale={locale} />
          </>
        )}

        {/* FT: Events strip */}
        {isFT && (
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
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.bold,
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
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: spacing.md,
                }}
              >
                <div style={{ maxWidth: 260 }}>
                  <div style={{ fontSize: 24, marginBottom: 6, textAlign: 'center' }}>🍽️</div>
                  <div style={{ fontSize: typography.sizes.sm, color: '#ffffff', fontWeight: typography.weights.medium, lineHeight: 1.6, textAlign: 'left' }}>
                    Feed your staff or clients from local food trucks. Great for meetings, lunches, or events.
                  </div>
                </div>
                <div style={{ maxWidth: 260 }}>
                  <div style={{ fontSize: 24, marginBottom: 6, textAlign: 'center' }}>✓</div>
                  <div style={{ fontSize: typography.sizes.sm, color: '#ffffff', fontWeight: typography.weights.medium, lineHeight: 1.6, textAlign: 'left' }}>
                    We match verified and insured trucks to your event. You just pick the date &amp; menu.
                  </div>
                </div>
                <div style={{ maxWidth: 260 }}>
                  <div style={{ fontSize: 24, marginBottom: 6, textAlign: 'center' }}>📋</div>
                  <div style={{ fontSize: typography.sizes.sm, color: '#ffffff', fontWeight: typography.weights.medium, lineHeight: 1.6, textAlign: 'left' }}>
                    No long lines. Our ordering system keeps service organized, fast &amp; fresh.
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
