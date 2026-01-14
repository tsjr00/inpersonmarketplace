import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'

interface VerticalHomePageProps {
  params: Promise<{ vertical: string }>
}

export default async function VerticalHomePage({ params }: VerticalHomePageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get listing count
  const { count } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vertical_id', vertical)
    .eq('status', 'published')
    .is('deleted_at', null)

  return (
    <div style={{
      backgroundColor: branding.colors.background,
      color: branding.colors.text
    }}>
      {/* Hero Section */}
      <section style={{
        padding: '80px 40px',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: 56,
          fontWeight: 'bold',
          marginBottom: 20,
          color: branding.colors.primary,
          lineHeight: 1.2
        }}>
          {branding.brand_name}
        </h1>

        <p style={{
          fontSize: 22,
          color: branding.colors.secondary,
          maxWidth: 600,
          margin: '0 auto 40px',
          lineHeight: 1.6
        }}>
          {branding.tagline}
        </p>

        <div style={{
          display: 'flex',
          gap: 15,
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <Link
            href={`/${vertical}/browse`}
            style={{
              padding: '18px 40px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 18
            }}
          >
            Browse {count || 0} Listings
          </Link>
          <Link
            href={`/${vertical}/vendor-signup`}
            style={{
              padding: '18px 40px',
              backgroundColor: 'transparent',
              color: branding.colors.primary,
              border: `2px solid ${branding.colors.primary}`,
              textDecoration: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 18
            }}
          >
            Become a Vendor
          </Link>
        </div>
      </section>

      {/* Quick Stats */}
      <section style={{
        padding: '60px 40px',
        backgroundColor: 'rgba(255,255,255,0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 60,
          flexWrap: 'wrap'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 48,
              fontWeight: 'bold',
              color: branding.colors.primary
            }}>
              {count || 0}
            </div>
            <div style={{ fontSize: 18, color: branding.colors.secondary }}>
              Active Listings
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 48,
              fontWeight: 'bold',
              color: branding.colors.primary
            }}>
              ✓
            </div>
            <div style={{ fontSize: 18, color: branding.colors.secondary }}>
              Verified Vendors
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 48,
              fontWeight: 'bold',
              color: branding.colors.primary
            }}>
              🛡️
            </div>
            <div style={{ fontSize: 18, color: branding.colors.secondary }}>
              Trusted Platform
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '30px 40px',
        borderTop: `1px solid ${branding.colors.secondary}`,
        textAlign: 'center',
        color: branding.colors.secondary
      }}>
        <p>© 2026 {branding.brand_name}. Part of FastWrks Marketplace.</p>
      </footer>
    </div>
  )
}
