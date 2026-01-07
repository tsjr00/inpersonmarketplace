import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'
import { createClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import Link from 'next/link'
import Image from 'next/image'

export default async function HomePage() {
  const domainConfig = await getServerDomainConfig()

  // Admin-only domain: redirect to /admin
  if (domainConfig.isAdmin) {
    redirect('/admin')
  }

  // Single-vertical domain: show that vertical's homepage
  if (domainConfig.verticalId) {
    return <SingleVerticalHome
      verticalId={domainConfig.verticalId}
      domainConfig={domainConfig}
    />
  }

  // Multi-vertical domain (localhost, staging): show marketplace selector
  return <MultiVerticalHome />
}

// Single vertical homepage (fastwrks.com, farmersmarketing.app)
async function SingleVerticalHome({
  verticalId,
  domainConfig
}: {
  verticalId: string
  domainConfig: { brandName: string; logoPath: string | null }
}) {
  const supabase = await createClient()
  const config = await getVerticalConfig(verticalId)
  const branding = config?.branding

  if (!branding) {
    return <div>Marketplace not found</div>
  }

  // Get listing count
  const { count } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vertical_id', verticalId)
    .eq('status', 'published')
    .is('deleted_at', null)

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text
    }}>
      {/* Navigation */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '15px 40px',
        borderBottom: `1px solid ${branding.colors.secondary}30`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          {domainConfig.logoPath && (
            <Image
              src={domainConfig.logoPath}
              alt={domainConfig.brandName}
              width={150}
              height={50}
              style={{ objectFit: 'contain' }}
            />
          )}
          {!domainConfig.logoPath && (
            <span style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: branding.colors.primary
            }}>
              {domainConfig.brandName}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <Link
            href="/browse"
            style={{
              color: branding.colors.text,
              textDecoration: 'none',
              fontWeight: 600
            }}
          >
            Browse
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              style={{
                padding: '8px 16px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600
              }}
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                style={{
                  color: branding.colors.primary,
                  textDecoration: 'none',
                  fontWeight: 600
                }}
              >
                Login
              </Link>
              <Link
                href="/signup"
                style={{
                  padding: '8px 16px',
                  backgroundColor: branding.colors.primary,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontWeight: 600
                }}
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        padding: '80px 40px',
        textAlign: 'center'
      }}>
        {domainConfig.logoPath && (
          <div style={{ marginBottom: 30 }}>
            <Image
              src={domainConfig.logoPath}
              alt={domainConfig.brandName}
              width={300}
              height={100}
              style={{ objectFit: 'contain' }}
            />
          </div>
        )}

        <h1 style={{
          fontSize: 48,
          fontWeight: 'bold',
          marginBottom: 20,
          color: branding.colors.primary,
          lineHeight: 1.2
        }}>
          {branding.tagline || `Welcome to ${domainConfig.brandName}`}
        </h1>

        <p style={{
          fontSize: 20,
          color: branding.colors.secondary,
          maxWidth: 600,
          margin: '0 auto 40px',
          lineHeight: 1.6
        }}>
          {branding.meta?.description || 'Find local vendors and products'}
        </p>

        <div style={{
          display: 'flex',
          gap: 20,
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <Link
            href="/browse"
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
            Start Shopping
          </Link>
          <Link
            href="/vendor-signup"
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
            Start Selling
          </Link>
        </div>
      </section>

      {/* Stats Section */}
      <section style={{
        padding: '60px 40px',
        backgroundColor: branding.colors.primary + '10'
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

      {/* CTA Section */}
      <section style={{
        padding: '80px 40px',
        backgroundColor: branding.colors.primary,
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: 36,
          fontWeight: 'bold',
          color: 'white',
          marginBottom: 20
        }}>
          Ready to Get Started?
        </h2>

        <p style={{
          fontSize: 18,
          color: 'rgba(255,255,255,0.9)',
          marginBottom: 40,
          maxWidth: 500,
          margin: '0 auto 40px'
        }}>
          Join our marketplace today
        </p>

        <div style={{
          display: 'flex',
          gap: 15,
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <Link
            href="/browse"
            style={{
              padding: '18px 40px',
              backgroundColor: 'white',
              color: branding.colors.primary,
              textDecoration: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 18
            }}
          >
            Browse Products
          </Link>
          <Link
            href="/vendor-signup"
            style={{
              padding: '18px 40px',
              backgroundColor: 'transparent',
              color: 'white',
              border: '2px solid white',
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

      {/* Footer */}
      <footer style={{
        padding: '30px 40px',
        borderTop: `1px solid ${branding.colors.secondary}30`,
        textAlign: 'center',
        color: branding.colors.secondary
      }}>
        <p>© 2026 {domainConfig.brandName}. All rights reserved.</p>
      </footer>
    </div>
  )
}

// Multi-vertical homepage (localhost, staging, umbrella)
async function MultiVerticalHome() {
  const supabase = await createClient()

  // Get all active verticals
  const { data: verticals } = await supabase
    .from('verticals')
    .select('*')
    .eq('is_active', true)

  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 40px',
        backgroundColor: 'white',
        borderBottom: '1px solid #eee'
      }}>
        <div style={{ fontSize: 24, fontWeight: 'bold' }}>
          Marketplace Platform
        </div>
        {user ? (
          <Link href="/admin" style={{ color: '#0070f3' }}>Admin</Link>
        ) : (
          <span style={{ color: '#666' }}>Development Mode</span>
        )}
      </nav>

      {/* Hero */}
      <section style={{ padding: '60px 40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 42, marginBottom: 20 }}>Choose Your Marketplace</h1>
        <p style={{ fontSize: 18, color: '#666', marginBottom: 40 }}>
          Select a marketplace to continue
        </p>
      </section>

      {/* Vertical Cards */}
      <section style={{
        padding: '0 40px 60px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: 30,
        maxWidth: 900,
        margin: '0 auto'
      }}>
        {verticals?.map((v: { vertical_id: string; name_public: string; config?: { branding?: { brand_name?: string; tagline?: string; colors?: { primary?: string; background?: string; secondary?: string } } } }) => {
          const branding = v.config?.branding
          return (
            <div key={v.vertical_id} style={{
              padding: 30,
              backgroundColor: branding?.colors?.background || 'white',
              border: `2px solid ${branding?.colors?.primary || '#ccc'}`,
              borderRadius: 12
            }}>
              <h2 style={{
                color: branding?.colors?.primary || '#333',
                marginBottom: 15
              }}>
                {branding?.brand_name || v.name_public}
              </h2>
              <p style={{
                color: branding?.colors?.secondary || '#666',
                marginBottom: 20
              }}>
                {branding?.tagline || 'Marketplace'}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link
                  href={`/${v.vertical_id}/browse`}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: branding?.colors?.primary || '#0070f3',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: 6,
                    textAlign: 'center',
                    fontWeight: 600
                  }}
                >
                  Shop
                </Link>
                <Link
                  href={`/${v.vertical_id}/vendor-signup`}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: `2px solid ${branding?.colors?.primary || '#0070f3'}`,
                    color: branding?.colors?.primary || '#0070f3',
                    textDecoration: 'none',
                    borderRadius: 6,
                    textAlign: 'center',
                    fontWeight: 600
                  }}
                >
                  Sell
                </Link>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
