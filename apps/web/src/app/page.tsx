import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'
import { createClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import Link from 'next/link'
import Image from 'next/image'

export default async function HomePage() {
  const domainConfig = await getServerDomainConfig()

  // Umbrella domain: show company landing page
  if (domainConfig.isUmbrella) {
    return <UmbrellaHome />
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

// Umbrella domain landing page (815enterprises.com)
function UmbrellaHome() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Navigation */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 40px',
        backgroundColor: 'white',
        borderBottom: '1px solid #eee'
      }}>
        <div style={{
          fontSize: 24,
          fontWeight: 'bold',
          color: '#333'
        }}>
          815 Enterprises
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <a href="#about" style={{ color: '#666', textDecoration: 'none' }}>About</a>
          <a href="#platforms" style={{ color: '#666', textDecoration: 'none' }}>Our Platforms</a>
          <a href="#contact" style={{ color: '#666', textDecoration: 'none' }}>Contact</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        padding: '100px 40px',
        textAlign: 'center',
        backgroundColor: 'white'
      }}>
        <h1 style={{
          fontSize: 48,
          fontWeight: 'bold',
          marginBottom: 20,
          color: '#222'
        }}>
          815 Enterprises
        </h1>
        <p style={{
          fontSize: 20,
          color: '#666',
          maxWidth: 600,
          margin: '0 auto',
          lineHeight: 1.6
        }}>
          Building marketplace platforms that connect local vendors with their communities.
        </p>
      </section>

      {/* About Section */}
      <section id="about" style={{
        padding: '80px 40px',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 32,
            marginBottom: 20,
            color: '#333'
          }}>
            About Us
          </h2>
          <p style={{
            fontSize: 18,
            color: '#555',
            lineHeight: 1.8
          }}>
            815 Enterprises develops specialized marketplace platforms for in-person businesses.
            We help local vendors reach more customers through pre-ordering and streamlined
            market-day operations.
          </p>
        </div>
      </section>

      {/* Platforms Section */}
      <section id="platforms" style={{
        padding: '80px 40px',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 32,
            marginBottom: 40,
            textAlign: 'center',
            color: '#333'
          }}>
            Our Platforms
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 30
          }}>
            {/* FastWrks Card */}
            <a
              href="https://fastwrks.com"
              style={{
                display: 'block',
                padding: 30,
                backgroundColor: '#1a1a2e',
                borderRadius: 12,
                textDecoration: 'none',
                transition: 'transform 0.2s'
              }}
            >
              <h3 style={{
                color: '#ff6b35',
                fontSize: 24,
                marginBottom: 10
              }}>
                FastWrks
              </h3>
              <p style={{ color: '#ccc', lineHeight: 1.6 }}>
                Local fireworks marketplace connecting vendors with customers
                for seasonal celebrations.
              </p>
              <span style={{
                display: 'inline-block',
                marginTop: 15,
                color: '#ff6b35',
                fontWeight: 600
              }}>
                Visit fastwrks.com →
              </span>
            </a>

            {/* Farmers Marketing Card */}
            <a
              href="https://farmersmarketing.app"
              style={{
                display: 'block',
                padding: 30,
                backgroundColor: '#f5f0e6',
                borderRadius: 12,
                textDecoration: 'none',
                border: '2px solid #2d4a5e',
                transition: 'transform 0.2s'
              }}
            >
              <h3 style={{
                color: '#2d4a5e',
                fontSize: 24,
                marginBottom: 10
              }}>
                Farmers Marketing
              </h3>
              <p style={{ color: '#555', lineHeight: 1.6 }}>
                Pre-order platform for farmers markets, connecting local
                farmers and artisans with their community.
              </p>
              <span style={{
                display: 'inline-block',
                marginTop: 15,
                color: '#2d4a5e',
                fontWeight: 600
              }}>
                Visit farmersmarketing.app →
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" style={{
        padding: '80px 40px',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{
            fontSize: 32,
            marginBottom: 20,
            color: '#333'
          }}>
            Contact
          </h2>
          <p style={{
            fontSize: 18,
            color: '#555',
            marginBottom: 30
          }}>
            Interested in partnering with us or learning more?
          </p>
          <a
            href="mailto:contact@815enterprises.com"
            style={{
              display: 'inline-block',
              padding: '15px 30px',
              backgroundColor: '#333',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 8,
              fontWeight: 600
            }}
          >
            Get in Touch
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '30px 40px',
        backgroundColor: '#222',
        color: '#888',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: 15 }}>
          <a
            href="/admin"
            style={{
              color: '#666',
              textDecoration: 'none',
              fontSize: 14
            }}
          >
            Admin Login
          </a>
        </div>
        <p style={{ fontSize: 14 }}>
          © 2026 815 Enterprises. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
