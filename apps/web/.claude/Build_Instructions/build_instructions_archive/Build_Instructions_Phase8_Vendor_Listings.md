# Build Instructions - Phase 8: Vendor Listings

**Session Date:** January 6, 2026  
**Created by:** Chet (Claude Chat)  
**Phase:** 8 - Vendor Listings  
**Prerequisites:** Phases 1-7 complete, vendor dashboard working

---

## Objective

Enable vendors to create, view, edit, and manage product/service listings for their vertical marketplace. This is core marketplace functionality.

---

## Overview

**What vendors will be able to do:**
- Create new listings with title, description, price, quantity
- View all their listings in a dashboard
- Edit listing details
- Delete listings
- Set listing status (draft, active, sold out)
- Upload product images (filename storage for now)

**Navigation:**
- From vendor dashboard: "Manage Listings" button
- Direct URL: `/[vertical]/vendor/listings`

---

## Part 1: Verify/Update Listings Table Schema

### Step 1: Check Existing Schema

**The listings table should already exist from initial schema. Verify in Supabase:**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'listings'
ORDER BY ordinal_position;
```

**Expected columns:**
- listing_id (uuid)
- vendor_id (uuid, FK to vendor_profiles)
- vertical_id (text)
- title (text)
- description (text)
- listing_data (jsonb)
- status (listing_status enum)
- created_at, updated_at, deleted_at (timestamps)

### Step 2: Create Migration for Additional Fields (If Needed)

**Create migration:** `supabase/migrations/20260106_HHMMSS_001_enhance_listings_table.sql`

```sql
-- =============================================================================
-- Migration: Enhance listings table with price and inventory fields
-- =============================================================================
-- Created: 2026-01-06 HH:MM:SS CST
-- Author: Claude Code
-- 
-- Purpose:
-- Adds explicit price and quantity columns to listings table for easier
-- querying and display. Also adds category field for filtering.
--
-- Dependencies:
-- Requires listings table from 20260103_001_initial_schema.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- ALTER TABLE listings DROP COLUMN IF EXISTS price;
-- ALTER TABLE listings DROP COLUMN IF EXISTS quantity;
-- ALTER TABLE listings DROP COLUMN IF EXISTS category;
-- ALTER TABLE listings DROP COLUMN IF EXISTS image_urls;
-- =============================================================================

-- Add price column (stored as cents to avoid floating point issues)
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS price_cents INTEGER DEFAULT 0;

COMMENT ON COLUMN listings.price_cents IS 
'Price in cents (e.g., 1999 = $19.99). Avoids floating point precision issues.';

-- Add quantity/inventory column
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0;

COMMENT ON COLUMN listings.quantity IS 
'Available quantity. 0 = sold out, NULL = unlimited/not tracked.';

-- Add category column for filtering
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS category TEXT;

COMMENT ON COLUMN listings.category IS 
'Product/service category within the vertical (e.g., "Aerial", "Ground" for fireworks)';

-- Add image URLs array
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

COMMENT ON COLUMN listings.image_urls IS 
'Array of image URLs or filenames for the listing';

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_listings_vendor_status 
ON listings(vendor_id, status) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_vertical_status 
ON listings(vertical_id, status) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_category 
ON listings(vertical_id, category) 
WHERE deleted_at IS NULL;

-- Verify columns added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'listings' AND column_name = 'price_cents'
  ) THEN
    RAISE EXCEPTION 'price_cents column was not added';
  END IF;
  RAISE NOTICE 'Listings table enhanced successfully';
END $$;
```

### Step 3: Create RLS Policies for Listings

**Create migration:** `supabase/migrations/20260106_HHMMSS_002_listings_rls_policies.sql`

```sql
-- =============================================================================
-- Migration: RLS policies for listings table
-- =============================================================================
-- Created: 2026-01-06 HH:MM:SS CST
-- Author: Claude Code
-- 
-- Purpose:
-- Implements Row Level Security for listings table:
-- - Vendors can CRUD their own listings
-- - Public can read active listings
-- - Service role has full access
--
-- Dependencies:
-- Requires listings table and vendor_profiles table
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- DROP POLICY IF EXISTS "Vendors can view own listings" ON listings;
-- DROP POLICY IF EXISTS "Vendors can create listings" ON listings;
-- DROP POLICY IF EXISTS "Vendors can update own listings" ON listings;
-- DROP POLICY IF EXISTS "Vendors can delete own listings" ON listings;
-- DROP POLICY IF EXISTS "Public can view active listings" ON listings;
-- =============================================================================

-- Enable RLS on listings table
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Policy: Vendors can view their own listings (including drafts)
CREATE POLICY "Vendors can view own listings"
ON listings
FOR SELECT
TO authenticated
USING (
  vendor_id IN (
    SELECT vendor_id FROM vendor_profiles 
    WHERE user_id = auth.uid()
  )
);

-- Policy: Vendors can create listings for their vendor profile
CREATE POLICY "Vendors can create listings"
ON listings
FOR INSERT
TO authenticated
WITH CHECK (
  vendor_id IN (
    SELECT vendor_id FROM vendor_profiles 
    WHERE user_id = auth.uid()
  )
);

-- Policy: Vendors can update their own listings
CREATE POLICY "Vendors can update own listings"
ON listings
FOR UPDATE
TO authenticated
USING (
  vendor_id IN (
    SELECT vendor_id FROM vendor_profiles 
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  vendor_id IN (
    SELECT vendor_id FROM vendor_profiles 
    WHERE user_id = auth.uid()
  )
);

-- Policy: Vendors can soft-delete their own listings
CREATE POLICY "Vendors can delete own listings"
ON listings
FOR DELETE
TO authenticated
USING (
  vendor_id IN (
    SELECT vendor_id FROM vendor_profiles 
    WHERE user_id = auth.uid()
  )
);

-- Policy: Anyone can view active listings (for public browsing)
CREATE POLICY "Public can view active listings"
ON listings
FOR SELECT
TO anon, authenticated
USING (
  status = 'active' 
  AND deleted_at IS NULL
);

-- Verify policies created
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies 
  WHERE tablename = 'listings';
  
  IF policy_count < 5 THEN
    RAISE EXCEPTION 'Expected at least 5 policies, found %', policy_count;
  END IF;
  
  RAISE NOTICE 'Listings RLS policies created successfully (% policies)', policy_count;
END $$;
```

---

## Part 2: Create Listings Dashboard Page

**Create:** `src/app/[vertical]/vendor/listings/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import Link from 'next/link'

interface ListingsPageProps {
  params: Promise<{ vertical: string }>
}

export default async function ListingsPage({ params }: ListingsPageProps) {
  const { vertical } = await params
  const supabase = createServerClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const config = await getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get vendor profile for this vertical
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('vendor_id, status')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get vendor's listings
  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('*')
    .eq('vendor_id', vendorProfile.vendor_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

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
        <div>
          <h1 style={{ color: branding.colors.primary, marginBottom: 5 }}>
            My Listings
          </h1>
          <p style={{ fontSize: 14, color: branding.colors.secondary }}>
            {branding.brand_name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href={`/${vertical}/vendor/listings/new`}
            style={{
              padding: '12px 24px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            + New Listing
          </Link>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              padding: '12px 24px',
              backgroundColor: branding.colors.secondary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Vendor Status Warning */}
      {vendorProfile.status !== 'approved' && (
        <div style={{
          padding: 15,
          marginBottom: 20,
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 8,
          color: '#856404'
        }}>
          <strong>Note:</strong> Your vendor profile is pending approval. 
          Listings you create will become visible once your profile is approved.
        </div>
      )}

      {/* Listings Grid */}
      {listings && listings.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 20
        }}>
          {listings.map((listing: any) => (
            <div
              key={listing.listing_id}
              style={{
                padding: 20,
                backgroundColor: 'white',
                color: '#333',
                border: `1px solid ${branding.colors.secondary}`,
                borderRadius: 8
              }}
            >
              {/* Status Badge */}
              <div style={{ marginBottom: 10 }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  backgroundColor: 
                    listing.status === 'active' ? '#d4edda' :
                    listing.status === 'draft' ? '#e2e3e5' :
                    listing.status === 'sold_out' ? '#f8d7da' : '#fff3cd',
                  color:
                    listing.status === 'active' ? '#155724' :
                    listing.status === 'draft' ? '#383d41' :
                    listing.status === 'sold_out' ? '#721c24' : '#856404'
                }}>
                  {listing.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              {/* Title */}
              <h3 style={{ 
                marginBottom: 10, 
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
                overflow: 'hidden'
              }}>
                {listing.description || 'No description'}
              </p>

              {/* Price & Quantity */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginBottom: 15,
                fontSize: 14
              }}>
                <span>
                  <strong>Price:</strong> ${((listing.price_cents || 0) / 100).toFixed(2)}
                </span>
                <span>
                  <strong>Qty:</strong> {listing.quantity ?? 'Unlimited'}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <Link
                  href={`/${vertical}/vendor/listings/${listing.listing_id}/edit`}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: branding.colors.primary,
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: 4,
                    fontSize: 14,
                    textAlign: 'center',
                    fontWeight: 600
                  }}
                >
                  Edit
                </Link>
                <Link
                  href={`/${vertical}/vendor/listings/${listing.listing_id}`}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: 4,
                    fontSize: 14,
                    textAlign: 'center',
                    fontWeight: 600
                  }}
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: 60,
          backgroundColor: 'white',
          color: '#333',
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <h3 style={{ marginBottom: 15, color: '#666' }}>No Listings Yet</h3>
          <p style={{ marginBottom: 20, color: '#999' }}>
            Create your first listing to start selling on {branding.brand_name}
          </p>
          <Link
            href={`/${vertical}/vendor/listings/new`}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            + Create First Listing
          </Link>
        </div>
      )}
    </div>
  )
}
```

---

## Part 3: Create New Listing Page

**Create:** `src/app/[vertical]/vendor/listings/new/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import ListingForm from '../ListingForm'

interface NewListingPageProps {
  params: Promise<{ vertical: string }>
}

export default async function NewListingPage({ params }: NewListingPageProps) {
  const { vertical } = await params
  const supabase = createServerClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const config = await getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('vendor_id')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: 40
    }}>
      {/* Header */}
      <div style={{ 
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: `2px solid ${branding.colors.primary}`
      }}>
        <h1 style={{ color: branding.colors.primary, marginBottom: 5 }}>
          Create New Listing
        </h1>
        <p style={{ fontSize: 14, color: branding.colors.secondary }}>
          {branding.brand_name}
        </p>
      </div>

      <ListingForm 
        vertical={vertical}
        vendorId={vendorProfile.vendor_id}
        branding={branding}
        mode="create"
      />
    </div>
  )
}
```

---

## Part 4: Create Listing Form Component

**Create:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'
import Link from 'next/link'

interface ListingFormProps {
  vertical: string
  vendorId: string
  branding: VerticalBranding
  mode: 'create' | 'edit'
  listing?: any
}

export default function ListingForm({ 
  vertical, 
  vendorId, 
  branding, 
  mode,
  listing 
}: ListingFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [formData, setFormData] = useState({
    title: listing?.title || '',
    description: listing?.description || '',
    price: listing?.price_cents ? (listing.price_cents / 100).toFixed(2) : '',
    quantity: listing?.quantity?.toString() || '',
    category: listing?.category || '',
    status: listing?.status || 'draft'
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate
    if (!formData.title.trim()) {
      setError('Title is required')
      setLoading(false)
      return
    }

    // Convert price to cents
    const priceCents = formData.price 
      ? Math.round(parseFloat(formData.price) * 100) 
      : 0

    // Prepare data
    const listingData = {
      vendor_id: vendorId,
      vertical_id: vertical,
      title: formData.title.trim(),
      description: formData.description.trim(),
      price_cents: priceCents,
      quantity: formData.quantity ? parseInt(formData.quantity) : null,
      category: formData.category.trim() || null,
      status: formData.status,
      updated_at: new Date().toISOString()
    }

    let result

    if (mode === 'create') {
      result = await supabase
        .from('listings')
        .insert({
          ...listingData,
          created_at: new Date().toISOString()
        })
        .select()
        .single()
    } else {
      result = await supabase
        .from('listings')
        .update(listingData)
        .eq('listing_id', listing.listing_id)
        .select()
        .single()
    }

    if (result.error) {
      console.error('Listing error:', result.error)
      setError(result.error.message)
      setLoading(false)
      return
    }

    // Success - redirect to listings
    router.push(`/${vertical}/vendor/listings`)
    router.refresh()
  }

  // Get category options based on vertical
  const getCategoryOptions = () => {
    if (vertical === 'fireworks') {
      return ['Aerial', 'Ground', 'Sparklers', 'Fountains', 'Novelty', 'Assortments', 'Other']
    } else if (vertical === 'farmers_market') {
      return ['Produce', 'Dairy', 'Meat', 'Baked Goods', 'Preserves', 'Plants', 'Crafts', 'Other']
    }
    return ['General', 'Other']
  }

  return (
    <div style={{
      maxWidth: 600,
      margin: '0 auto',
      padding: 30,
      backgroundColor: 'white',
      color: '#333',
      border: `1px solid ${branding.colors.secondary}`,
      borderRadius: 8
    }}>
      {error && (
        <div style={{
          padding: 10,
          marginBottom: 20,
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: 4,
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Title */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Title <span style={{ color: '#c00' }}>*</span>
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="e.g., Fresh Organic Tomatoes"
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: `1px solid ${branding.colors.primary}`,
              borderRadius: 4
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            disabled={loading}
            rows={4}
            placeholder="Describe your product or service..."
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: `1px solid ${branding.colors.primary}`,
              borderRadius: 4,
              resize: 'vertical'
            }}
          />
        </div>

        {/* Price & Quantity Row */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
          {/* Price */}
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Price ($)
            </label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              disabled={loading}
              min="0"
              step="0.01"
              placeholder="0.00"
              style={{
                width: '100%',
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4
              }}
            />
          </div>

          {/* Quantity */}
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Quantity Available
            </label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              disabled={loading}
              min="0"
              placeholder="Leave blank for unlimited"
              style={{
                width: '100%',
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4
              }}
            />
          </div>
        </div>

        {/* Category */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Category
          </label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            disabled={loading}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: `1px solid ${branding.colors.primary}`,
              borderRadius: 4,
              backgroundColor: 'white'
            }}
          >
            <option value="">Select a category</option>
            {getCategoryOptions().map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div style={{ marginBottom: 30 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Status
          </label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            disabled={loading}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: `1px solid ${branding.colors.primary}`,
              borderRadius: 4,
              backgroundColor: 'white'
            }}
          >
            <option value="draft">Draft (not visible to buyers)</option>
            <option value="active">Active (visible to buyers)</option>
            <option value="sold_out">Sold Out</option>
          </select>
          <p style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
            Draft listings are only visible to you. Set to Active when ready to sell.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: loading ? '#ccc' : branding.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading 
              ? (mode === 'create' ? 'Creating...' : 'Saving...') 
              : (mode === 'create' ? 'Create Listing' : 'Save Changes')
            }
          </button>

          <Link
            href={`/${vertical}/vendor/listings`}
            style={{
              flex: 1,
              padding: 12,
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: '#6c757d',
              color: 'white',
              textDecoration: 'none',
              textAlign: 'center',
              borderRadius: 4
            }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
```

---

## Part 5: Create Edit Listing Page

**Create:** `src/app/[vertical]/vendor/listings/[listingId]/edit/page.tsx`

```typescript
import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import ListingForm from '../../ListingForm'

interface EditListingPageProps {
  params: Promise<{ vertical: string; listingId: string }>
}

export default async function EditListingPage({ params }: EditListingPageProps) {
  const { vertical, listingId } = await params
  const supabase = createServerClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const config = await getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('vendor_id')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get listing
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('*')
    .eq('listing_id', listingId)
    .eq('vendor_id', vendorProfile.vendor_id)
    .is('deleted_at', null)
    .single()

  if (listingError || !listing) {
    notFound()
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: 40
    }}>
      {/* Header */}
      <div style={{ 
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: `2px solid ${branding.colors.primary}`
      }}>
        <h1 style={{ color: branding.colors.primary, marginBottom: 5 }}>
          Edit Listing
        </h1>
        <p style={{ fontSize: 14, color: branding.colors.secondary }}>
          {branding.brand_name}
        </p>
      </div>

      <ListingForm 
        vertical={vertical}
        vendorId={vendorProfile.vendor_id}
        branding={branding}
        mode="edit"
        listing={listing}
      />
    </div>
  )
}
```

---

## Part 6: Create View Listing Page

**Create:** `src/app/[vertical]/vendor/listings/[listingId]/page.tsx`

```typescript
import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import Link from 'next/link'
import DeleteListingButton from './DeleteListingButton'

interface ViewListingPageProps {
  params: Promise<{ vertical: string; listingId: string }>
}

export default async function ViewListingPage({ params }: ViewListingPageProps) {
  const { vertical, listingId } = await params
  const supabase = createServerClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const config = await getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('vendor_id')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get listing
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('*')
    .eq('listing_id', listingId)
    .eq('vendor_id', vendorProfile.vendor_id)
    .is('deleted_at', null)
    .single()

  if (listingError || !listing) {
    notFound()
  }

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
        <div>
          <h1 style={{ color: branding.colors.primary, marginBottom: 5 }}>
            {listing.title}
          </h1>
          <p style={{ fontSize: 14, color: branding.colors.secondary }}>
            {branding.brand_name}
          </p>
        </div>
        <Link
          href={`/${vertical}/vendor/listings`}
          style={{
            padding: '10px 20px',
            backgroundColor: branding.colors.secondary,
            color: 'white',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 600
          }}
        >
          ← Back to Listings
        </Link>
      </div>

      {/* Listing Details */}
      <div style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: 30,
        backgroundColor: 'white',
        color: '#333',
        borderRadius: 8,
        border: `1px solid ${branding.colors.secondary}`
      }}>
        {/* Status */}
        <div style={{ marginBottom: 20 }}>
          <span style={{
            padding: '6px 12px',
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 600,
            backgroundColor: 
              listing.status === 'active' ? '#d4edda' :
              listing.status === 'draft' ? '#e2e3e5' :
              listing.status === 'sold_out' ? '#f8d7da' : '#fff3cd',
            color:
              listing.status === 'active' ? '#155724' :
              listing.status === 'draft' ? '#383d41' :
              listing.status === 'sold_out' ? '#721c24' : '#856404'
          }}>
            {listing.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 25 }}>
          <h3 style={{ marginBottom: 10, color: '#333' }}>Description</h3>
          <p style={{ color: '#666', lineHeight: 1.6 }}>
            {listing.description || 'No description provided'}
          </p>
        </div>

        {/* Details Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
          marginBottom: 25
        }}>
          <div>
            <h4 style={{ marginBottom: 5, color: '#333' }}>Price</h4>
            <p style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary }}>
              ${((listing.price_cents || 0) / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <h4 style={{ marginBottom: 5, color: '#333' }}>Quantity</h4>
            <p style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary }}>
              {listing.quantity ?? 'Unlimited'}
            </p>
          </div>
          <div>
            <h4 style={{ marginBottom: 5, color: '#333' }}>Category</h4>
            <p style={{ fontSize: 18, color: '#666' }}>
              {listing.category || 'Uncategorized'}
            </p>
          </div>
          <div>
            <h4 style={{ marginBottom: 5, color: '#333' }}>Created</h4>
            <p style={{ fontSize: 18, color: '#666' }}>
              {new Date(listing.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Listing ID */}
        <div style={{ marginBottom: 30 }}>
          <h4 style={{ marginBottom: 5, color: '#333' }}>Listing ID</h4>
          <code style={{ 
            fontSize: 12, 
            color: '#666',
            backgroundColor: '#f8f9fa',
            padding: '4px 8px',
            borderRadius: 4
          }}>
            {listing.listing_id}
          </code>
        </div>

        {/* Actions */}
        <div style={{ 
          display: 'flex', 
          gap: 15,
          paddingTop: 20,
          borderTop: '1px solid #eee'
        }}>
          <Link
            href={`/${vertical}/vendor/listings/${listing.listing_id}/edit`}
            style={{
              padding: '12px 24px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            Edit Listing
          </Link>
          
          <DeleteListingButton 
            vertical={vertical}
            listingId={listing.listing_id}
            listingTitle={listing.title}
          />
        </div>
      </div>
    </div>
  )
}
```

---

## Part 7: Create Delete Listing Button

**Create:** `src/app/[vertical]/vendor/listings/[listingId]/DeleteListingButton.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface DeleteListingButtonProps {
  vertical: string
  listingId: string
  listingTitle: string
}

export default function DeleteListingButton({ 
  vertical, 
  listingId, 
  listingTitle 
}: DeleteListingButtonProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${listingTitle}"?\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    setLoading(true)

    // Soft delete - set deleted_at timestamp
    const { error } = await supabase
      .from('listings')
      .update({ 
        deleted_at: new Date().toISOString(),
        status: 'inactive'
      })
      .eq('listing_id', listingId)

    if (error) {
      alert('Failed to delete listing: ' + error.message)
      setLoading(false)
      return
    }

    router.push(`/${vertical}/vendor/listings`)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      style={{
        padding: '12px 24px',
        backgroundColor: loading ? '#ccc' : '#dc3545',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer'
      }}
    >
      {loading ? 'Deleting...' : 'Delete Listing'}
    </button>
  )
}
```

---

## Part 8: Update Vendor Dashboard with Listings Link

**Update:** `src/app/[vertical]/vendor/dashboard/page.tsx`

**Add "Manage Listings" button in the dashboard. Find the vendor status section and add:**

```typescript
{/* Add after the status section, before "Coming Soon" */}

{/* Listings Quick Stats */}
<div style={{
  padding: 20,
  backgroundColor: 'white',
  color: '#333',
  border: `1px solid ${branding.colors.secondary}`,
  borderRadius: 8,
  marginTop: 20
}}>
  <div style={{ 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 15 
  }}>
    <h2 style={{ color: branding.colors.primary }}>Your Listings</h2>
    <a 
      href={`/${vertical}/vendor/listings`}
      style={{
        padding: '10px 20px',
        backgroundColor: branding.colors.primary,
        color: 'white',
        textDecoration: 'none',
        borderRadius: 4,
        fontWeight: 600
      }}
    >
      Manage Listings
    </a>
  </div>
  <p style={{ color: '#666' }}>
    Create and manage your product listings for {config?.name_public || branding.brand_name}.
  </p>
</div>
```

---

## Part 9: Test Listings Functionality

### Test 1: Access Listings Page
1. Login as existing vendor
2. Go to vendor dashboard
3. Click "Manage Listings"
4. ✅ Should load listings page
5. ✅ Should show "No Listings Yet"

### Test 2: Create Listing
1. Click "+ New Listing" or "Create First Listing"
2. Fill out form:
   - Title: "Test Product"
   - Description: "Test description"
   - Price: 19.99
   - Quantity: 10
   - Category: (select one)
   - Status: Draft
3. Click "Create Listing"
4. ✅ Should redirect to listings page
5. ✅ Should show new listing card

### Test 3: View Listing
1. Click "View" on listing card
2. ✅ Should load listing detail page
3. ✅ Should show all details correctly
4. ✅ Price should format correctly (19.99)

### Test 4: Edit Listing
1. Click "Edit Listing"
2. ✅ Form should be pre-filled
3. Change price to 24.99
4. Change status to "Active"
5. Click "Save Changes"
6. ✅ Should redirect to listings
7. ✅ Should show updated price & status

### Test 5: Delete Listing
1. View listing → Click "Delete Listing"
2. ✅ Should show confirmation dialog
3. Click Cancel
4. ✅ Listing still exists
5. Click Delete again → Confirm
6. ✅ Should redirect to listings
7. ✅ Listing should be gone

### Test 6: Multiple Listings
1. Create 3-5 more listings
2. ✅ Grid should display all listings
3. ✅ Status badges show correctly
4. ✅ Prices show correctly

---

## Migration Files Summary

**Files to create:**
```
supabase/migrations/20260106_HHMMSS_001_enhance_listings_table.sql
supabase/migrations/20260106_HHMMSS_002_listings_rls_policies.sql
```

**Remember:** Replace HHMMSS with actual timestamp when creating

**Apply to:** Dev first, test, then Staging

---

## Session Summary Requirements

**Tasks Completed:**
- [ ] Created migration for listings enhancements
- [ ] Created migration for listings RLS policies
- [ ] Applied migrations to Dev
- [ ] Applied migrations to Staging
- [ ] Created listings dashboard page
- [ ] Created new listing page
- [ ] Created listing form component
- [ ] Created edit listing page
- [ ] Created view listing page
- [ ] Created delete listing button
- [ ] Updated vendor dashboard with listings link
- [ ] All test scenarios passed

**Migration Files Created:**
```
supabase/migrations/20260106_HHMMSS_001_enhance_listings_table.sql
  Purpose: Add price_cents, quantity, category, image_urls columns
  Applied: ✅ Dev ([timestamp]) | ✅ Staging ([timestamp])

supabase/migrations/20260106_HHMMSS_002_listings_rls_policies.sql
  Purpose: RLS policies for listings table
  Applied: ✅ Dev ([timestamp]) | ✅ Staging ([timestamp])
```

**Files Created:**
```
src/app/[vertical]/vendor/listings/page.tsx
src/app/[vertical]/vendor/listings/new/page.tsx
src/app/[vertical]/vendor/listings/ListingForm.tsx
src/app/[vertical]/vendor/listings/[listingId]/page.tsx
src/app/[vertical]/vendor/listings/[listingId]/edit/page.tsx
src/app/[vertical]/vendor/listings/[listingId]/DeleteListingButton.tsx
```

**Files Modified:**
```
src/app/[vertical]/vendor/dashboard/page.tsx - Added listings link
```

---

**Estimated Time:** 3-4 hours  
**Complexity:** Medium-High  
**Priority:** High - Core marketplace feature
