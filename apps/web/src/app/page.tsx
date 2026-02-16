import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import Image from 'next/image'

export default async function HomePage() {
  const domainConfig = await getServerDomainConfig()

  // Umbrella domain: show company landing page
  if (domainConfig.isUmbrella) {
    return <UmbrellaHome />
  }

  // Single-vertical domain: redirect to the vertical's homepage with new landing
  if (domainConfig.verticalId) {
    redirect(`/${domainConfig.verticalId}`)
  }

  // Multi-vertical domain (localhost, staging): show marketplace selector
  return <MultiVerticalHome />
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
        {user && (
          <Link href="/admin" style={{ color: '#0070f3' }}>Admin</Link>
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
          const dbBranding = v.config?.branding
          const fallback = defaultBranding[v.vertical_id]
          const brandName = dbBranding?.brand_name || fallback?.brand_name || v.name_public
          const tagline = dbBranding?.tagline || fallback?.tagline || 'Marketplace'
          const primary = dbBranding?.colors?.primary || fallback?.colors.primary || '#0070f3'
          const background = dbBranding?.colors?.background || fallback?.colors.background || 'white'
          const secondary = dbBranding?.colors?.secondary || fallback?.colors.text || '#666'
          const logoPath = fallback?.logo_path

          return (
            <div key={v.vertical_id} style={{
              padding: 30,
              backgroundColor: background,
              border: `2px solid ${primary}`,
              borderRadius: 12
            }}>
              {logoPath && (
                <div style={{ marginBottom: 15 }}>
                  <Image
                    src={logoPath}
                    alt={brandName}
                    width={180}
                    height={50}
                    style={{ objectFit: 'contain' }}
                  />
                </div>
              )}
              <h2 style={{
                color: primary,
                marginBottom: 15
              }}>
                {brandName}
              </h2>
              <p style={{
                color: secondary,
                marginBottom: 20
              }}>
                {tagline}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link
                  href={`/${v.vertical_id}/browse`}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: primary,
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
                    border: `2px solid ${primary}`,
                    color: primary,
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

            {/* Food Truck'n Card */}
            <a
              href="https://foodtruckn.app"
              style={{
                display: 'block',
                padding: 30,
                backgroundColor: '#fff8f0',
                borderRadius: 12,
                textDecoration: 'none',
                border: '2px solid #e85d04',
                transition: 'transform 0.2s'
              }}
            >
              <h3 style={{
                color: '#e85d04',
                fontSize: 24,
                marginBottom: 10
              }}>
                Food Truck&apos;n
              </h3>
              <p style={{ color: '#555', lineHeight: 1.6 }}>
                Find food trucks near you. Pre-order your favorites,
                skip the line, and support local food truck operators.
              </p>
              <span style={{
                display: 'inline-block',
                marginTop: 15,
                color: '#e85d04',
                fontWeight: 600
              }}>
                Visit foodtruckn.app →
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
          <Link
            href="/admin"
            style={{
              color: '#666',
              textDecoration: 'none',
              fontSize: 14
            }}
          >
            Admin Login
          </Link>
        </div>
        <p style={{ fontSize: 14 }}>
          © 2026 815 Enterprises. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
