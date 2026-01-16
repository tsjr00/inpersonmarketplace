import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'

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

  // Get user profile to check for admin role and buyer tier
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles, buyer_tier, buyer_tier_expires_at')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
  const buyerTier = (userProfile?.buyer_tier as string) || 'free'
  const isPremiumBuyer = buyerTier === 'premium'

  // Get recent orders count (as buyer)
  const { count: orderCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_user_id', user.id)

  return (
    <div style={{
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: 40
    }}>
      {/* Page Title */}
      <h1 style={{
        color: branding.colors.primary,
        margin: 0,
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: `2px solid ${branding.colors.primary}`
      }}>
        {branding.brand_name} Dashboard
      </h1>

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

        {/* Upgrade to Premium Card - only show for free tier */}
        {!isPremiumBuyer && (
          <div style={{
            marginTop: 20,
            padding: 24,
            backgroundColor: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #93c5fd',
            borderRadius: 12
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 20
            }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8
                }}>
                  <span style={{ fontSize: 24 }}>⭐</span>
                  <h3 style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#1e40af'
                  }}>
                    Upgrade to Premium
                  </h3>
                </div>
                <p style={{
                  margin: '0 0 16px 0',
                  color: '#1e3a8a',
                  fontSize: 15
                }}>
                  Get exclusive benefits for just <strong>$9.99/month</strong> or <strong>$81.50/year</strong>{' '}
                  <span style={{
                    backgroundColor: '#059669',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    Save 32%
                  </span>
                </p>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>✓</span>
                    <span style={{ fontSize: 14, color: '#374151' }}>Early access to new listings</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>✓</span>
                    <span style={{ fontSize: 14, color: '#374151' }}>Priority customer support</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>✓</span>
                    <span style={{ fontSize: 14, color: '#374151' }}>Order history & insights</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>✓</span>
                    <span style={{ fontSize: 14, color: '#374151' }}>Premium member badge</span>
                  </div>
                </div>
              </div>

              <Link
                href={`/${vertical}/buyer/upgrade`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '14px 28px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 16,
                  minHeight: 48,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.3)'
                }}
              >
                Upgrade Now →
              </Link>
            </div>
          </div>
        )}

        {/* Premium Member Badge - show for premium buyers */}
        {isPremiumBuyer && (
          <div style={{
            marginTop: 20,
            padding: 16,
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{ fontSize: 24 }}>⭐</span>
            <div>
              <div style={{
                fontWeight: 600,
                color: '#166534',
                fontSize: 15
              }}>
                Premium Member
              </div>
              <div style={{ fontSize: 13, color: '#166534' }}>
                Enjoying early access, priority support, and exclusive benefits
              </div>
            </div>
          </div>
        )}
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

      {/* ========== ADMIN SECTION ========== */}
      {isAdmin && (
        <section style={{ marginBottom: 30 }}>
          <h2 style={{
            fontSize: 20,
            fontWeight: 600,
            marginBottom: 15,
            color: '#7c3aed',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span>🔧</span> Admin
          </h2>

          <Link
            href="/admin"
            style={{
              display: 'block',
              padding: 20,
              backgroundColor: '#f5f3ff',
              color: '#333',
              border: '1px solid #c4b5fd',
              borderRadius: 8,
              textDecoration: 'none',
              maxWidth: 300
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
              Admin Dashboard
            </h3>
            <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
              Manage vendors, listings, and users
            </p>
          </Link>
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
