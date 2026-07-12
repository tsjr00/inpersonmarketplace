# Build Instructions - Phase 9: Buyer Browse Experience

**Session Date:** January 6, 2026  
**Created by:** Chet (Claude Chat)  
**Phase:** 9 - Buyer Browse Experience  
**Prerequisites:** Phase 8 complete, listings migrations applied

---

## Objective

Enable customers to browse listings, search/filter products, view listing details, and see vendor profiles. This completes the marketplace discovery loop.

---

## Overview

**What buyers will be able to do:**
- Browse all active listings in a vertical
- Filter by category
- Search by title/description
- View listing details
- See vendor information
- View vendor's other listings

**Public access:**
- No login required to browse
- Login required for future features (reservations, favorites)

**Routes created:**
- `/[vertical]/browse` - Browse all listings
- `/[vertical]/listing/[id]` - View listing detail
- `/[vertical]/vendor/[id]/profile` - Public vendor profile

---

## Part 1: Create Browse Listings Page

**Create:** `src/app/[vertical]/browse/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import Link from 'next/link'
import SearchFilter from './SearchFilter'

interface BrowsePageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ category?: string; search?: string }>
}

export default async function BrowsePage({ params, searchParams }: BrowsePageProps) {
  const { vertical } = await params
  const { category, search } = await searchParams
  const supabase = createServerClient()

  // Get branding
  const config = await getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Build query for active listings
  let query = supabase
    .from('listings')
    .select(`
      listing_id,
      title,
      description,
      price_cents,
      quantity,
      category,
      image_urls,
      created_at,
      vendor_id,
      vendor_profiles!inner (
        vendor_id,
        profile_data,
        status
      )
    `)
    .eq('vertical_id', vertical)
    .eq('status', 'active')
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

  const { data: listings, error } = await query

  // Get unique categories for filter
  const { data: categories } = await supabase
    .from('listings')
    .select('category')
    .eq('vertical_id', vertical)
    .eq('status', 'active')
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
          categories={uniqueCategories}
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
            {listings.map((listing: any) => {
              const vendorData = listing.vendor_profiles?.profile_data as Record<string, any>
              const vendorName = vendorData?.business_name || vendorData?.farm_name || 'Vendor'

              return (
                <Link
                  key={listing.listing_id}
                  href={`/${vertical}/listing/${listing.listing_id}`}
                  style={{
                    display: 'block',
                    padding: 20,
                    backgroundColor: 'white',
                    color: '#333',
                    border: `1px solid ${branding.colors.secondary}`,
                    borderRadius: 8,
                    textDecoration: 'none',
                    transition: 'transform 0.2s, box-shadow 0.2s'
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
                    {listing.image_urls?.length > 0 ? (
                      <span>Image</span>
                    ) : (
                      <span style={{ fontSize: 40 }}>📦</span>
                    )}
                  </div>

                  {/* Category Badge */}
                  {listing.category && (
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
                      {listing.category}
                    </span>
                  )}

                  {/* Title */}
                  <h3 style={{ 
                    marginBottom: 8, 
                    color: branding.colors.primary,
                    fontSize: 18
                  }}>
                    {listing.title}
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
                    {listing.description || 'No description'}
                  </p>

                  {/* Price */}
                  <div style={{ 
                    fontSize: 22, 
                    fontWeight: 'bold',
                    color: branding.colors.primary,
                    marginBottom: 10
                  }}>
                    ${((listing.price_cents || 0) / 100).toFixed(2)}
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
```

---

## Part 2: Create Search/Filter Component

**Create:** `src/app/[vertical]/browse/SearchFilter.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VerticalBranding } from '@/lib/branding'

interface SearchFilterProps {
  vertical: string
  categories: string[]
  currentCategory?: string
  currentSearch?: string
  branding: VerticalBranding
}

export default function SearchFilter({
  vertical,
  categories,
  currentCategory,
  currentSearch,
  branding
}: SearchFilterProps) {
  const router = useRouter()
  const [search, setSearch] = useState(currentSearch || '')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (currentCategory) params.set('category', currentCategory)
    router.push(`/${vertical}/browse${params.toString() ? '?' + params.toString() : ''}`)
  }

  const handleCategoryChange = (category: string) => {
    const params = new URLSearchParams()
    if (currentSearch) params.set('search', currentSearch)
    if (category) params.set('category', category)
    router.push(`/${vertical}/browse${params.toString() ? '?' + params.toString() : ''}`)
  }

  const clearFilters = () => {
    setSearch('')
    router.push(`/${vertical}/browse`)
  }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 15,
      marginBottom: 30,
      padding: 20,
      backgroundColor: 'white',
      borderRadius: 8,
      border: `1px solid ${branding.colors.secondary}`
    }}>
      {/* Search Input */}
      <form onSubmit={handleSearch} style={{ flex: '1 1 300px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings..."
            style={{
              flex: 1,
              padding: '10px 15px',
              fontSize: 16,
              border: `1px solid ${branding.colors.secondary}`,
              borderRadius: 6
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 20px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Search
          </button>
        </div>
      </form>

      {/* Category Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontWeight: 600, color: '#333' }}>Category:</label>
        <select
          value={currentCategory || ''}
          onChange={(e) => handleCategoryChange(e.target.value)}
          style={{
            padding: '10px 15px',
            fontSize: 16,
            border: `1px solid ${branding.colors.secondary}`,
            borderRadius: 6,
            backgroundColor: 'white',
            minWidth: 150
          }}
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Clear Filters */}
      {(currentSearch || currentCategory) && (
        <button
          onClick={clearFilters}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Clear Filters
        </button>
      )}
    </div>
  )
}
```

---

## Part 3: Create Listing Detail Page

**Create:** `src/app/[vertical]/listing/[listingId]/page.tsx`

```typescript
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import Link from 'next/link'

interface ListingDetailPageProps {
  params: Promise<{ vertical: string; listingId: string }>
}

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { vertical, listingId } = await params
  const supabase = createServerClient()

  // Get branding
  const config = await getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get listing with vendor info
  const { data: listing, error } = await supabase
    .from('listings')
    .select(`
      *,
      vendor_profiles!inner (
        vendor_id,
        profile_data,
        status,
        created_at
      )
    `)
    .eq('listing_id', listingId)
    .eq('status', 'active')
    .eq('vendor_profiles.status', 'approved')
    .is('deleted_at', null)
    .single()

  if (error || !listing) {
    notFound()
  }

  const vendorData = listing.vendor_profiles?.profile_data as Record<string, any>
  const vendorName = vendorData?.business_name || vendorData?.farm_name || 'Vendor'
  const vendorId = listing.vendor_profiles?.vendor_id

  // Get other listings from same vendor
  const { data: otherListings } = await supabase
    .from('listings')
    .select('listing_id, title, price_cents')
    .eq('vendor_id', listing.vendor_id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .neq('listing_id', listingId)
    .limit(4)

  // Check auth for header
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
          )}
        </div>
      </nav>

      {/* Breadcrumb */}
      <div style={{ padding: '20px 40px', borderBottom: '1px solid #eee' }}>
        <Link 
          href={`/${vertical}/browse`}
          style={{ color: branding.colors.primary, textDecoration: 'none' }}
        >
          ← Back to Browse
        </Link>
      </div>

      {/* Content */}
      <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 40 }}>
          {/* Main Content */}
          <div>
            {/* Image */}
            <div style={{
              height: 400,
              backgroundColor: '#f0f0f0',
              borderRadius: 8,
              marginBottom: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {listing.image_urls?.length > 0 ? (
                <span style={{ color: '#999' }}>Image</span>
              ) : (
                <span style={{ fontSize: 80, color: '#ccc' }}>📦</span>
              )}
            </div>

            {/* Description */}
            <div style={{
              padding: 25,
              backgroundColor: 'white',
              borderRadius: 8,
              border: `1px solid ${branding.colors.secondary}`
            }}>
              <h2 style={{ 
                color: branding.colors.primary, 
                marginBottom: 15,
                fontSize: 24
              }}>
                Description
              </h2>
              <p style={{ 
                color: '#333', 
                lineHeight: 1.8,
                fontSize: 16,
                whiteSpace: 'pre-wrap'
              }}>
                {listing.description || 'No description provided.'}
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            {/* Listing Info Card */}
            <div style={{
              padding: 25,
              backgroundColor: 'white',
              borderRadius: 8,
              border: `1px solid ${branding.colors.secondary}`,
              marginBottom: 20
            }}>
              {/* Category */}
              {listing.category && (
                <span style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  backgroundColor: branding.colors.secondary + '20',
                  color: branding.colors.secondary,
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 15
                }}>
                  {listing.category}
                </span>
              )}

              {/* Title */}
              <h1 style={{ 
                color: '#333', 
                marginBottom: 15,
                fontSize: 28
              }}>
                {listing.title}
              </h1>

              {/* Price */}
              <div style={{ 
                fontSize: 36, 
                fontWeight: 'bold',
                color: branding.colors.primary,
                marginBottom: 20
              }}>
                ${((listing.price_cents || 0) / 100).toFixed(2)}
              </div>

              {/* Availability */}
              <div style={{ 
                marginBottom: 20,
                padding: 15,
                backgroundColor: '#f8f9fa',
                borderRadius: 6
              }}>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 5 }}>
                  Availability
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#333' }}>
                  {listing.quantity === null 
                    ? 'In Stock' 
                    : listing.quantity > 0 
                      ? `${listing.quantity} available`
                      : 'Sold Out'
                  }
                </div>
              </div>

              {/* Contact CTA (Placeholder for reservations) */}
              <button
                style={{
                  width: '100%',
                  padding: '15px 20px',
                  fontSize: 18,
                  fontWeight: 600,
                  backgroundColor: branding.colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
                onClick={() => alert('Reservations coming soon!')}
              >
                Contact Vendor
              </button>

              <p style={{ 
                fontSize: 12, 
                color: '#999', 
                textAlign: 'center',
                marginTop: 10 
              }}>
                Reservations and ordering coming soon
              </p>
            </div>

            {/* Vendor Card */}
            <div style={{
              padding: 25,
              backgroundColor: 'white',
              borderRadius: 8,
              border: `1px solid ${branding.colors.secondary}`
            }}>
              <h3 style={{ 
                color: branding.colors.primary, 
                marginBottom: 15,
                fontSize: 18
              }}>
                Sold by
              </h3>
              
              <Link
                href={`/${vertical}/vendor/${vendorId}/profile`}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: '#333'
                }}
              >
                <div style={{ 
                  fontSize: 20, 
                  fontWeight: 600,
                  marginBottom: 10,
                  color: branding.colors.primary
                }}>
                  {vendorName}
                </div>
              </Link>

              <div style={{ fontSize: 14, color: '#666', marginBottom: 15 }}>
                Member since {new Date(listing.vendor_profiles.created_at).toLocaleDateString('en-US', { 
                  month: 'long',
                  year: 'numeric'
                })}
              </div>

              <Link
                href={`/${vertical}/vendor/${vendorId}/profile`}
                style={{
                  display: 'block',
                  padding: '10px 15px',
                  backgroundColor: branding.colors.secondary,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 6,
                  textAlign: 'center',
                  fontWeight: 600
                }}
              >
                View Vendor Profile
              </Link>
            </div>

            {/* Other Listings from Vendor */}
            {otherListings && otherListings.length > 0 && (
              <div style={{
                padding: 25,
                backgroundColor: 'white',
                borderRadius: 8,
                border: `1px solid ${branding.colors.secondary}`,
                marginTop: 20
              }}>
                <h3 style={{ 
                  color: branding.colors.primary, 
                  marginBottom: 15,
                  fontSize: 18
                }}>
                  More from {vendorName}
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {otherListings.map((item: any) => (
                    <Link
                      key={item.listing_id}
                      href={`/${vertical}/listing/${item.listing_id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 15px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: 6,
                        textDecoration: 'none',
                        color: '#333'
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{item.title}</span>
                      <span style={{ 
                        fontWeight: 600, 
                        color: branding.colors.primary 
                      }}>
                        ${((item.price_cents || 0) / 100).toFixed(2)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## Part 4: Create Public Vendor Profile Page

**Create:** `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx`

```typescript
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import Link from 'next/link'

interface VendorProfilePageProps {
  params: Promise<{ vertical: string; vendorId: string }>
}

export default async function VendorProfilePage({ params }: VendorProfilePageProps) {
  const { vertical, vendorId } = await params
  const supabase = createServerClient()

  // Get branding
  const config = await getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get vendor profile
  const { data: vendor, error } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('vendor_id', vendorId)
    .eq('vertical_id', vertical)
    .eq('status', 'approved')
    .single()

  if (error || !vendor) {
    notFound()
  }

  const profileData = vendor.profile_data as Record<string, any>
  const vendorName = profileData?.business_name || profileData?.farm_name || 'Vendor'

  // Get vendor's active listings
  const { data: listings } = await supabase
    .from('listings')
    .select('*')
    .eq('vendor_id', vendorId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Check auth for header
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
          )}
        </div>
      </nav>

      {/* Breadcrumb */}
      <div style={{ padding: '20px 40px', borderBottom: '1px solid #eee' }}>
        <Link 
          href={`/${vertical}/browse`}
          style={{ color: branding.colors.primary, textDecoration: 'none' }}
        >
          ← Back to Browse
        </Link>
      </div>

      {/* Content */}
      <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto' }}>
        {/* Vendor Header */}
        <div style={{
          padding: 30,
          backgroundColor: 'white',
          borderRadius: 8,
          border: `1px solid ${branding.colors.secondary}`,
          marginBottom: 30
        }}>
          <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
            {/* Vendor Avatar Placeholder */}
            <div style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              backgroundColor: branding.colors.primary + '20',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              color: branding.colors.primary
            }}>
              {vendorName.charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: 1 }}>
              <h1 style={{ 
                color: branding.colors.primary, 
                marginBottom: 10,
                fontSize: 32
              }}>
                {vendorName}
              </h1>

              <div style={{ 
                display: 'flex', 
                gap: 20,
                flexWrap: 'wrap',
                color: '#666'
              }}>
                <span>
                  ✓ Verified Vendor
                </span>
                <span>
                  Member since {new Date(vendor.created_at).toLocaleDateString('en-US', { 
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
                <span>
                  {listings?.length || 0} listing{listings?.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Business Info */}
          {(profileData?.vendor_type || profileData?.business_type) && (
            <div style={{ 
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid #eee'
            }}>
              <span style={{
                padding: '4px 10px',
                backgroundColor: branding.colors.secondary + '20',
                color: branding.colors.secondary,
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 600
              }}>
                {profileData?.vendor_type || profileData?.business_type}
              </span>
            </div>
          )}
        </div>

        {/* Vendor Listings */}
        <div>
          <h2 style={{ 
            color: branding.colors.primary, 
            marginBottom: 20,
            fontSize: 24
          }}>
            Listings from {vendorName}
          </h2>

          {listings && listings.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 25
            }}>
              {listings.map((listing: any) => (
                <Link
                  key={listing.listing_id}
                  href={`/${vertical}/listing/${listing.listing_id}`}
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
                    justifyContent: 'center'
                  }}>
                    <span style={{ fontSize: 40, color: '#ccc' }}>📦</span>
                  </div>

                  {/* Category */}
                  {listing.category && (
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
                      {listing.category}
                    </span>
                  )}

                  {/* Title */}
                  <h3 style={{ 
                    marginBottom: 8, 
                    color: branding.colors.primary,
                    fontSize: 18
                  }}>
                    {listing.title}
                  </h3>

                  {/* Price */}
                  <div style={{ 
                    fontSize: 22, 
                    fontWeight: 'bold',
                    color: branding.colors.primary
                  }}>
                    ${((listing.price_cents || 0) / 100).toFixed(2)}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{
              padding: 40,
              backgroundColor: 'white',
              borderRadius: 8,
              textAlign: 'center',
              color: '#666'
            }}>
              This vendor hasn't listed any products yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## Part 5: Add Browse Link to Vertical Homepage

**Create:** `src/app/[vertical]/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import Link from 'next/link'

interface VerticalHomePageProps {
  params: Promise<{ vertical: string }>
}

export default async function VerticalHomePage({ params }: VerticalHomePageProps) {
  const { vertical } = await params
  const supabase = createServerClient()

  // Get branding
  const config = await getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get listing count
  const { count } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vertical_id', vertical)
    .eq('status', 'active')
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
        borderBottom: `1px solid ${branding.colors.secondary}`
      }}>
        <div style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary }}>
          {branding.brand_name}
        </div>
        
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
```

---

## Part 6: Test Buyer Browse Experience

### Test 1: Browse Page
1. Visit http://localhost:3002/fireworks/browse
2. ✅ Should load without login required
3. ✅ Should show all active listings
4. ✅ Should show search and category filter

### Test 2: Search
1. Enter search term in search box
2. Click Search
3. ✅ Should filter listings by title/description
4. ✅ URL should update with search param

### Test 3: Category Filter
1. Select a category from dropdown
2. ✅ Should filter listings
3. ✅ Should combine with search if both set

### Test 4: Clear Filters
1. Click "Clear Filters"
2. ✅ Should reset to all listings
3. ✅ URL should be clean

### Test 5: Listing Detail
1. Click on a listing card
2. ✅ Should load listing detail page
3. ✅ Should show all listing info
4. ✅ Should show vendor info
5. ✅ Should show "More from vendor" if applicable

### Test 6: Vendor Profile
1. Click "View Vendor Profile"
2. ✅ Should load public vendor profile
3. ✅ Should show vendor info
4. ✅ Should show all vendor's listings

### Test 7: Vertical Homepage
1. Visit http://localhost:3002/fireworks
2. ✅ Should show branded homepage
3. ✅ Should show listing count
4. ✅ Browse button should work

### Test 8: No Login Required
1. Logout (if logged in)
2. Visit browse page
3. ✅ Can browse listings
4. ✅ Can view listing details
5. ✅ Can view vendor profiles
6. ✅ Login/signup buttons visible

---

## Migration Files

**No new database migrations required** - Uses existing tables with Phase 8 enhancements

---

## Session Summary Requirements

**Tasks Completed:**
- [ ] Created browse listings page
- [ ] Created search/filter component
- [ ] Created listing detail page (public)
- [ ] Created public vendor profile page
- [ ] Created vertical homepage
- [ ] All test scenarios passed

**Files Created:**
```
src/app/[vertical]/browse/page.tsx
src/app/[vertical]/browse/SearchFilter.tsx
src/app/[vertical]/listing/[listingId]/page.tsx
src/app/[vertical]/vendor/[vendorId]/profile/page.tsx
src/app/[vertical]/page.tsx
```

**Files Modified:**
None - all new files

**Testing Results:**
- Browse page loads without auth
- Search filters work correctly
- Category filter works correctly
- Listing detail displays correctly
- Vendor profile displays correctly
- Navigation works across all pages

---

**Estimated Time:** 2-3 hours  
**Complexity:** Medium  
**Priority:** High - Completes marketplace loop
