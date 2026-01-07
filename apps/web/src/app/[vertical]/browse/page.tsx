import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import SearchFilter from './SearchFilter'

interface BrowsePageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ category?: string; search?: string }>
}

export default async function BrowsePage({ params, searchParams }: BrowsePageProps) {
  const { vertical } = await params
  const { category, search } = await searchParams
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Build query for published listings from approved vendors
  let query = supabase
    .from('listings')
    .select(`
      id,
      title,
      description,
      price_cents,
      quantity,
      category,
      image_urls,
      created_at,
      vendor_profile_id,
      vendor_profiles!inner (
        id,
        profile_data,
        status
      )
    `)
    .eq('vertical_id', vertical)
    .eq('status', 'published')
    .eq('vendor_profiles.status', 'approved')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Apply category filter
  if (category) {
    query = query.eq('category', category)
  }

  // Apply search filter
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
  }

  const { data: listings } = await query

  // Get unique categories for filter
  const { data: categories } = await supabase
    .from('listings')
    .select('category')
    .eq('vertical_id', vertical)
    .eq('status', 'published')
    .is('deleted_at', null)
    .not('category', 'is', null)

  const uniqueCategories = [...new Set(categories?.map(c => c.category).filter(Boolean))]

  // Check if user is logged in (for header)
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
        borderBottom: `1px solid ${branding.colors.secondary}`,
        backgroundColor: branding.colors.background
      }}>
        <Link
          href={`/${vertical}`}
          style={{
            fontSize: 24,
            fontWeight: 'bold',
            color: branding.colors.primary,
            textDecoration: 'none'
          }}
        >
          {branding.brand_name}
        </Link>

        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <Link
            href={`/${vertical}/browse`}
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
              href={`/${vertical}/dashboard`}
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
                href={`/${vertical}/login`}
                style={{
                  color: branding.colors.primary,
                  textDecoration: 'none',
                  fontWeight: 600
                }}
              >
                Login
              </Link>
              <Link
                href={`/${vertical}/signup`}
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

      {/* Page Content */}
      <div style={{ padding: 40 }}>
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <h1 style={{
            color: branding.colors.primary,
            marginBottom: 10,
            fontSize: 36
          }}>
            Browse {branding.brand_name}
          </h1>
          <p style={{ color: branding.colors.secondary, fontSize: 18 }}>
            Discover products from verified vendors
          </p>
        </div>

        {/* Search & Filter */}
        <SearchFilter
          vertical={vertical}
          categories={uniqueCategories as string[]}
          currentCategory={category}
          currentSearch={search}
          branding={branding}
        />

        {/* Results Count */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: branding.colors.secondary }}>
            {listings?.length || 0} listing{listings?.length !== 1 ? 's' : ''} found
            {category && ` in ${category}`}
            {search && ` matching "${search}"`}
          </p>
        </div>

        {/* Listings Grid */}
        {listings && listings.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 25
          }}>
            {listings.map((listing) => {
              // vendor_profiles comes as object from !inner join
              const vendorProfile = listing.vendor_profiles as unknown as Record<string, unknown> | null
              const vendorData = vendorProfile?.profile_data as Record<string, unknown> | null
              const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'
              const listingId = listing.id as string
              const listingTitle = listing.title as string
              const listingDesc = (listing.description as string) || 'No description'
              const listingCategory = listing.category as string | null
              const listingPrice = ((listing.price_cents as number) || 0) / 100

              return (
                <Link
                  key={listingId}
                  href={`/${vertical}/listing/${listingId}`}
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
                  {/* Image Placeholder */}
                  <div style={{
                    height: 150,
                    backgroundColor: '#f0f0f0',
                    borderRadius: 6,
                    marginBottom: 15,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#999'
                  }}>
                    <span style={{ fontSize: 40 }}>📦</span>
                  </div>

                  {/* Category Badge */}
                  {listingCategory && (
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      backgroundColor: branding.colors.secondary + '20',
                      color: branding.colors.secondary,
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 10
                    }}>
                      {listingCategory}
                    </span>
                  )}

                  {/* Title */}
                  <h3 style={{
                    marginBottom: 8,
                    marginTop: 0,
                    color: branding.colors.primary,
                    fontSize: 18
                  }}>
                    {listingTitle}
                  </h3>

                  {/* Description */}
                  <p style={{
                    fontSize: 14,
                    color: '#666',
                    marginBottom: 15,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.4
                  }}>
                    {listingDesc}
                  </p>

                  {/* Price */}
                  <div style={{
                    fontSize: 22,
                    fontWeight: 'bold',
                    color: branding.colors.primary,
                    marginBottom: 10
                  }}>
                    ${listingPrice.toFixed(2)}
                  </div>

                  {/* Vendor Name */}
                  <div style={{
                    fontSize: 13,
                    color: '#888',
                    borderTop: '1px solid #eee',
                    paddingTop: 10
                  }}>
                    by {vendorName}
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div style={{
            padding: 60,
            backgroundColor: 'white',
            color: '#333',
            borderRadius: 8,
            textAlign: 'center'
          }}>
            <h3 style={{ marginBottom: 15, color: '#666' }}>No Listings Found</h3>
            <p style={{ color: '#999', marginBottom: 20 }}>
              {search || category
                ? 'Try adjusting your search or filters'
                : `Be the first to list on ${branding.brand_name}!`
              }
            </p>
            {(search || category) && (
              <Link
                href={`/${vertical}/browse`}
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  backgroundColor: branding.colors.primary,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontWeight: 600
                }}
              >
                Clear Filters
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
