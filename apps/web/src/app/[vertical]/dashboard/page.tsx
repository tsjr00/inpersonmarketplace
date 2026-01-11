import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import LogoutButton from './LogoutButton'

interface DashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding from defaults
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile for THIS vertical (if exists)
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  const isVendor = !!vendorProfile
  const isApprovedVendor = vendorProfile?.status === 'approved'

  // Get recent orders count (as buyer)
  const { count: orderCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_user_id', user.id)

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: 40
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: `2px solid ${branding.colors.primary}`
      }}>
        <h1 style={{ color: branding.colors.primary, margin: 0 }}>
          {branding.brand_name} Dashboard
        </h1>
        <LogoutButton vertical={vertical} branding={branding} />
      </div>

      {/* Welcome Section */}
      <div style={{
        padding: 20,
        backgroundColor: 'white',
        color: '#333',
        border: `1px solid ${branding.colors.secondary}`,
        borderRadius: 8,
        marginBottom: 30
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 5 }}>
          Welcome back, {user.user_metadata?.full_name || user.email?.split('@')[0]}!
        </h2>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>{user.email}</p>
      </div>

      {/* ========== SHOPPER SECTION ========== */}
      <section style={{ marginBottom: 30 }}>
        <h2 style={{
          fontSize: 20,
          fontWeight: 600,
          marginBottom: 15,
          color: branding.colors.primary,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>🛒</span> Shopper
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 15
        }}>
          {/* Browse Products Card */}
          <Link
            href={`/${vertical}/browse`}
            style={{
              display: 'block',
              padding: 20,
              backgroundColor: 'white',
              color: '#333',
              border: `1px solid ${branding.colors.secondary}`,
              borderRadius: 8,
              textDecoration: 'none'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
              Browse Products
            </h3>
            <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
              Discover fresh products from local vendors
            </p>
          </Link>

          {/* My Orders Card */}
          <Link
            href={`/${vertical}/buyer/orders`}
            style={{
              display: 'block',
              padding: 20,
              backgroundColor: 'white',
              color: '#333',
              border: `1px solid ${branding.colors.secondary}`,
              borderRadius: 8,
              textDecoration: 'none'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
              My Orders
            </h3>
            <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
              {orderCount || 0} order{orderCount !== 1 ? 's' : ''} placed
            </p>
          </Link>
        </div>
      </section>

      {/* ========== VENDOR SECTION ========== */}
      {isVendor && (
        <section style={{ marginBottom: 30 }}>
          <h2 style={{
            fontSize: 20,
            fontWeight: 600,
            marginBottom: 15,
            color: branding.colors.accent || '#2563eb',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span>🏪</span> Vendor
          </h2>

          {isApprovedVendor ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 15
            }}>
              {/* Vendor Dashboard Card */}
              <Link
                href={`/${vertical}/vendor/dashboard`}
                style={{
                  display: 'block',
                  padding: 20,
                  backgroundColor: '#eff6ff',
                  color: '#333',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  textDecoration: 'none'
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
                  Vendor Dashboard
                </h3>
                <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
                  Manage listings, orders, and payments
                </p>
              </Link>

              {/* My Listings Card */}
              <Link
                href={`/${vertical}/vendor/listings`}
                style={{
                  display: 'block',
                  padding: 20,
                  backgroundColor: 'white',
                  color: '#333',
                  border: `1px solid ${branding.colors.secondary}`,
                  borderRadius: 8,
                  textDecoration: 'none'
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
                  My Listings
                </h3>
                <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
                  View and manage your products
                </p>
              </Link>
            </div>
          ) : (
            <div>
              {/* Pending Approval Notice */}
              <div style={{
                padding: 15,
                backgroundColor: '#fefce8',
                color: '#333',
                border: '1px solid #fde047',
                borderRadius: 8,
                marginBottom: 15
              }}>
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600, color: '#854d0e' }}>
                  ⏳ Pending Approval
                </h3>
                <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
                  Your vendor application is being reviewed. We&apos;ll notify you once approved.
                </p>
              </div>

              {/* Draft Listings Section */}
              <p style={{ margin: '0 0 12px 0', color: '#666', fontSize: 14 }}>
                While you wait, you can prepare your listings:
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: 15
              }}>
                {/* Create Draft Listings Card */}
                <Link
                  href={`/${vertical}/vendor/listings/new`}
                  style={{
                    display: 'block',
                    padding: 20,
                    backgroundColor: 'white',
                    color: '#333',
                    border: '1px solid #fde047',
                    borderRadius: 8,
                    textDecoration: 'none'
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
                    Create Draft Listings
                  </h3>
                  <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
                    Start adding your products now
                  </p>
                </Link>

                {/* My Listings Card */}
                <Link
                  href={`/${vertical}/vendor/listings`}
                  style={{
                    display: 'block',
                    padding: 20,
                    backgroundColor: 'white',
                    color: '#333',
                    border: '1px solid #fde047',
                    borderRadius: 8,
                    textDecoration: 'none'
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
                    My Listings
                  </h3>
                  <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
                    View and edit your draft listings
                  </p>
                </Link>
              </div>

              <p style={{ margin: '12px 0 0 0', color: '#92400e', fontSize: 13, fontStyle: 'italic' }}>
                Listings will be saved as drafts and can be published once your account is approved.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ========== BECOME A VENDOR (small, at bottom) ========== */}
      {!isVendor && (
        <section style={{
          borderTop: '1px solid #e5e7eb',
          paddingTop: 20,
          marginTop: 20
        }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Interested in selling?{' '}
            <Link
              href={`/${vertical}/vendor-signup`}
              style={{
                color: branding.colors.primary,
                textDecoration: 'none',
                fontWeight: 500
              }}
            >
              Become a vendor →
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}
