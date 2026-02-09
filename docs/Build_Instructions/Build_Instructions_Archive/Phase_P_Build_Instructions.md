# Phase P: Vendor Profile System & Bug Fixes - Build Instructions

**Date:** January 15, 2026
**For:** CC (Claude Code)
**Branch:** `feature/phase-p-vendor-profiles`
**Estimated Time:** 3-4 hours

---

## Overview

Phase P implements the complete vendor profile system including premium badges, profile images, descriptions, social links, and checkout enhancements. Also fixes critical bugs discovered during Phase O testing.

**Business Rules Applied:**
- Profile descriptions: Both standard and premium tiers
- Social media links: Premium tier only
- Product images: Both tiers (deferred to later phase)
- Premium badge: Visual distinction for premium vendors
- Profile images: Both tiers

---

## PART 1: CRITICAL - Schema & Bug Fixes

### Bug 1: Markets Missing contact_email Column

**Error:** `Could not find the 'contact_email' column of 'markets' in the schema cache`

**Migration:** Create `supabase/migrations/20260115_002_add_markets_contact_email.sql`

```sql
-- Migration: Add contact_email column to markets table
-- Date: 2026-01-15
-- Phase: P
-- Applied to: [will be updated when applied]

-- Add contact_email column
ALTER TABLE markets 
ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Add comment
COMMENT ON COLUMN markets.contact_email IS 'Primary contact email for market inquiries';

-- Migration applied successfully
```

---

### Bug 2: Logo Aspect Ratio Wrong

**Problem:** Logo appears squished/flattened

**File:** `src/components/layout/Header.tsx`

**Fix the Image component:**

```typescript
import Image from 'next/image'

// WRONG - causes squishing
<Image
  src={branding.logo_path}
  alt={branding.name}
  width={150}
  height={40}
  priority
/>

// CORRECT - preserves aspect ratio
<Image
  src={branding.logo_path}
  alt={branding.name}
  width={180}
  height={60}
  style={{ height: 'auto', maxHeight: 60 }}
  priority
/>
```

**Or use objectFit:**

```typescript
<div style={{ position: 'relative', width: 180, height: 60 }}>
  <Image
    src={branding.logo_path}
    alt={branding.name}
    fill
    style={{ objectFit: 'contain' }}
    priority
  />
</div>
```

---

### Bug 3: "Other" Category Still Exists

**Problem:** Category migration didn't catch all listings

**Run in Supabase SQL Editor:**

```sql
-- Clean up any remaining "Other" category listings
UPDATE listings 
SET category = 'Home & Functional'
WHERE category NOT IN (
  'Produce',
  'Meat & Poultry',
  'Dairy & Eggs',
  'Baked Goods',
  'Pantry',
  'Prepared Foods',
  'Health & Wellness',
  'Art & Decor',
  'Home & Functional'
);

-- Verify - should return 0 rows
SELECT DISTINCT category 
FROM listings 
WHERE category NOT IN (
  'Produce',
  'Meat & Poultry',
  'Dairy & Eggs',
  'Baked Goods',
  'Pantry',
  'Prepared Foods',
  'Health & Wellness',
  'Art & Decor',
  'Home & Functional'
);
```

---

## PART 2: Checkout Enhancements

### Step 2.1: Add Cross-Sell Section

**File:** `src/app/[vertical]/checkout/page.tsx`

**Add state and fetch logic:**

```typescript
'use client'
import { useState, useEffect } from 'react'

export default function CheckoutPage({ params }: { params: Promise<{ vertical: string }> }) {
  const [suggestedProducts, setSuggestedProducts] = useState<any[]>([])
  const [vertical, setVertical] = useState('')

  useEffect(() => {
    params.then(p => setVertical(p.vertical))
  }, [params])

  // Fetch suggestions when cart changes
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (cartItems.length === 0) return

      // Get unique vendor IDs from cart
      const vendorIds = [...new Set(cartItems.map(item => item.listing.vendor_profile_id))]
      const excludeIds = cartItems.map(item => item.listing_id)

      try {
        const res = await fetch('/api/listings/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            vendorIds, 
            excludeIds, 
            limit: 4,
            vertical 
          })
        })

        if (res.ok) {
          const data = await res.json()
          setSuggestedProducts(data.listings || [])
        }
      } catch (error) {
        console.error('Failed to fetch suggestions:', error)
      }
    }

    fetchSuggestions()
  }, [cartItems, vertical])

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #f0f9ff 0%, #ffffff 50%)'
    }}>
      {/* Branded Header */}
      <div style={{
        backgroundColor: '#3b82f6',
        padding: '24px 20px',
        color: 'white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
            Secure Checkout
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.9 }}>
            Complete your order securely with Stripe
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px' }}>
        {/* Cart Items */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ 
            marginBottom: 20, 
            fontSize: 20, 
            fontWeight: 600,
            color: '#1e3a8a'
          }}>
            Your Order
          </h2>
          {/* ... existing cart items display ... */}
        </div>

        {/* Cross-Sell Section */}
        {suggestedProducts.length > 0 && (
          <div style={{
            backgroundColor: '#fffbeb',
            borderRadius: 12,
            padding: 24,
            marginBottom: 20,
            border: '2px solid #fbbf24',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>✨</span>
              <h3 style={{ 
                margin: 0, 
                fontSize: 18, 
                fontWeight: 600,
                color: '#92400e'
              }}>
                Complete your order from your vendors
              </h3>
            </div>
            <p style={{ 
              margin: '0 0 16px 36px', 
              fontSize: 14, 
              color: '#78350f' 
            }}>
              Since you're already picking up from these vendors, why not add these items?
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16
            }}>
              {suggestedProducts.map(product => (
                <div
                  key={product.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: 8,
                    padding: 16,
                    border: '1px solid #fbbf24',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {/* Product image placeholder */}
                  <div style={{
                    width: '100%',
                    height: 120,
                    backgroundColor: '#f3f4f6',
                    borderRadius: 6,
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 40
                  }}>
                    📦
                  </div>
                  
                  <h4 style={{
                    margin: '0 0 4px 0',
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#111827',
                    lineHeight: 1.3
                  }}>
                    {product.title}
                  </h4>
                  
                  <p style={{
                    margin: '0 0 8px 0',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#3b82f6'
                  }}>
                    ${(product.price_cents / 100).toFixed(2)}
                  </p>
                  
                  <p style={{
                    margin: '0 0 12px 0',
                    fontSize: 12,
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    from {product.vendor_profiles?.business_name || 'Vendor'}
                  </p>
                  
                  <button
                    onClick={() => {
                      // Add to cart logic
                      addToCart(product.id, 1)
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#d97706'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#f59e0b'
                    }}
                  >
                    Quick Add to Order
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Message (enhance existing) */}
        <div style={{
          backgroundColor: '#dbeafe',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
          border: '1px solid #3b82f6',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 48,
              height: 48,
              backgroundColor: '#3b82f6',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              flexShrink: 0
            }}>
              🔒
            </div>
            <div>
              <h3 style={{
                margin: '0 0 8px 0',
                fontSize: 18,
                fontWeight: 600,
                color: '#1e40af'
              }}>
                Your payment is secure and encrypted
              </h3>
              <p style={{
                margin: 0,
                fontSize: 14,
                color: '#1e40af',
                lineHeight: 1.6
              }}>
                We use Stripe, the same secure payment technology trusted by millions of 
                businesses worldwide including Amazon, Google, and Shopify. Your payment 
                information is encrypted and never stored on our servers. All transactions 
                are protected by bank-level security and PCI compliance standards.
              </p>
            </div>
          </div>
        </div>

        {/* Payment Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 24,
          border: '2px solid #3b82f6',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            marginBottom: 16,
            fontSize: 20,
            fontWeight: 600,
            color: '#1e3a8a'
          }}>
            Payment Information
          </h2>
          {/* ... existing Stripe checkout ... */}
        </div>
      </div>
    </div>
  )
}
```

---

### Step 2.2: Create Suggestions API

**File:** `src/app/api/listings/suggestions/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { vendorIds, excludeIds, limit = 4, vertical } = await request.json()

    if (!vendorIds || vendorIds.length === 0) {
      return NextResponse.json({ listings: [] })
    }

    // Fetch published listings from vendors in cart, excluding items already in cart
    const { data: listings, error } = await supabase
      .from('listings')
      .select(`
        id,
        title,
        price_cents,
        vendor_profile_id,
        vendor_profiles (
          id,
          business_name,
          tier
        )
      `)
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'published')
      .eq('vertical_id', vertical)
      .limit(limit * 2) // Get more than needed to filter

    if (error) {
      console.error('Suggestions API error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter out excluded IDs and limit
    const filtered = listings
      ?.filter(listing => !excludeIds.includes(listing.id))
      .slice(0, limit) || []

    return NextResponse.json({ listings: filtered })
  } catch (error: any) {
    console.error('Suggestions API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

---

## PART 3: Premium Badge System

### Step 3.1: Add Badge Constants

**File:** `src/lib/constants.ts`

**Add after CATEGORIES:**

```typescript
// Premium tier badge configuration
export const TIER_BADGES = {
  premium: {
    label: 'Premium',
    icon: '⭐',
    color: '#3b82f6',
    bgColor: '#dbeafe',
    borderColor: '#93c5fd'
  },
  featured: {
    label: 'Featured',
    icon: '✨',
    color: '#f59e0b',
    bgColor: '#fef3c7',
    borderColor: '#fcd34d'
  },
  standard: {
    label: 'Standard',
    icon: '',
    color: '#6b7280',
    bgColor: '#f3f4f6',
    borderColor: '#d1d5db'
  }
} as const
```

---

### Step 3.2: Create Badge Component

**File:** `src/components/shared/TierBadge.tsx`

```typescript
import { TIER_BADGES } from '@/lib/constants'

interface TierBadgeProps {
  tier: 'standard' | 'premium' | 'featured'
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export default function TierBadge({ tier, size = 'md', showIcon = true }: TierBadgeProps) {
  const badge = TIER_BADGES[tier]
  
  const sizes = {
    sm: { fontSize: 11, padding: '3px 8px' },
    md: { fontSize: 12, padding: '4px 12px' },
    lg: { fontSize: 14, padding: '6px 16px' }
  }

  const style = sizes[size]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: style.padding,
        fontSize: style.fontSize,
        fontWeight: 600,
        color: badge.color,
        backgroundColor: badge.bgColor,
        border: `1px solid ${badge.borderColor}`,
        borderRadius: 12,
        whiteSpace: 'nowrap'
      }}
    >
      {showIcon && badge.icon && <span>{badge.icon}</span>}
      <span>{badge.label}</span>
    </span>
  )
}
```

---

### Step 3.3: Add Badge to Listing Cards

**File:** `src/app/[vertical]/browse/page.tsx`

```typescript
import TierBadge from '@/components/shared/TierBadge'

// In the listing card mapping
{listings.map(listing => (
  <div key={listing.id} style={{ /* card styles */ }}>
    {/* ... existing card content ... */}
    
    {/* Add badge near vendor name */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
        by {listing.vendor_profiles.business_name}
      </p>
      {listing.vendor_profiles.tier !== 'standard' && (
        <TierBadge tier={listing.vendor_profiles.tier} size="sm" />
      )}
    </div>
  </div>
))}
```

---

### Step 3.4: Add Badge to Vendor Profile

**File:** `src/app/[vertical]/vendor/[vendorId]/page.tsx`

```typescript
import TierBadge from '@/components/shared/TierBadge'

export default async function VendorProfilePage({ params }: Props) {
  // ... fetch vendor data ...

  return (
    <div>
      {/* Header section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700 }}>
          {vendor.business_name}
        </h1>
        {vendor.tier !== 'standard' && (
          <TierBadge tier={vendor.tier} size="lg" />
        )}
      </div>
      {/* ... rest of profile ... */}
    </div>
  )
}
```

---

## PART 4: Vendor Profile Image Upload

**Note:** Profile images display on vendor profile page only, NOT on listing cards (vendor name + badge is sufficient branding on listings)

### Step 4.1: Add Database Column

**Migration:** Create `supabase/migrations/20260115_003_add_vendor_profile_image.sql`

```sql
-- Migration: Add profile_image_url to vendor_profiles
-- Date: 2026-01-15
-- Phase: P

-- Add profile_image_url column
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Add comment
COMMENT ON COLUMN vendor_profiles.profile_image_url IS 'URL to vendor profile image/logo';

-- Migration applied successfully
```

---

### Step 4.2: Create Image Upload API

**File:** `src/app/api/vendor/profile-image/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'No vendor profile found' }, { status: 404 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('image') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${vendor.id}-${Date.now()}.${fileExt}`
    const filePath = `vendor-profiles/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('vendor-images')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('vendor-images')
      .getPublicUrl(filePath)

    // Update vendor profile
    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update({ 
        profile_image_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendor.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      imageUrl: publicUrl 
    })
  } catch (error: any) {
    console.error('Profile image upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

---

### Step 4.3: Create Image Upload Component

**File:** `src/components/vendor/ProfileImageUpload.tsx`

```typescript
'use client'
import { useState } from 'react'
import Image from 'next/image'

interface Props {
  currentImageUrl?: string | null
  onUploadSuccess?: (url: string) => void
}

export default function ProfileImageUpload({ currentImageUrl, onUploadSuccess }: Props) {
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(currentImageUrl || '')
  const [error, setError] = useState('')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB')
      return
    }

    setError('')
    setUploading(true)

    try {
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string)
      }
      reader.readAsDataURL(file)

      // Upload
      const formData = new FormData()
      formData.append('image', file)

      const res = await fetch('/api/vendor/profile-image', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await res.json()
      setPreviewUrl(data.imageUrl)
      onUploadSuccess?.(data.imageUrl)
    } catch (err: any) {
      setError(err.message || 'Failed to upload image')
      setPreviewUrl(currentImageUrl || '')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: 12, fontWeight: 600, fontSize: 14 }}>
        Profile Image / Logo
      </label>
      
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Preview */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 12,
            backgroundColor: '#f3f4f6',
            border: '2px dashed #d1d5db',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Profile"
              fill
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: 40, opacity: 0.3 }}>📷</span>
          )}
        </div>

        {/* Upload controls */}
        <div style={{ flex: 1 }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            style={{ marginBottom: 8 }}
            id="profile-image-upload"
          />
          <label
            htmlFor="profile-image-upload"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1
            }}
          >
            {uploading ? 'Uploading...' : 'Choose Image'}
          </label>
          
          <p style={{ 
            margin: '8px 0 0', 
            fontSize: 12, 
            color: '#6b7280' 
          }}>
            PNG, JPG, or WebP. Max 5MB. Square images work best.
          </p>

          {error && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#ef4444' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

### Step 4.4: Add to Vendor Settings

**File:** `src/app/[vertical]/vendor/settings/page.tsx`

```typescript
import ProfileImageUpload from '@/components/vendor/ProfileImageUpload'

export default async function VendorSettingsPage() {
  // ... fetch vendor data ...

  return (
    <div>
      <h1>Vendor Settings</h1>
      
      {/* Profile Image Section */}
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: 12, 
        padding: 24, 
        marginBottom: 20 
      }}>
        <ProfileImageUpload 
          currentImageUrl={vendor.profile_image_url}
          onUploadSuccess={(url) => {
            // Refresh page or update state
            window.location.reload()
          }}
        />
      </div>

      {/* ... other settings ... */}
    </div>
  )
}
```

---

### Step 4.5: Display Profile Image

**Create Avatar Component:** `src/components/shared/VendorAvatar.tsx`

```typescript
import Image from 'next/image'

interface Props {
  imageUrl?: string | null
  name: string
  size?: number
  tier?: 'standard' | 'premium' | 'featured'
}

export default function VendorAvatar({ imageUrl, name, size = 48, tier }: Props) {
  // Get initials
  const initials = name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Border color based on tier
  const borderColor = tier === 'premium' ? '#3b82f6' :
                      tier === 'featured' ? '#f59e0b' : '#d1d5db'

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: imageUrl ? 'transparent' : '#3b82f6',
        border: `3px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 700,
        color: 'white',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  )
}
```

---

### Step 4.6: Avatar Display Locations

**Avatar is displayed in:**
- Vendor profile page (large, 120px)
- Vendor settings page (preview during upload, 120px)
- Future: Vendor directory, search results

**Avatar is NOT displayed on:**
- Listing cards (vendor name already shown with badge)
- Browse page listings
- Search results listings

---

## PART 5: Vendor Profile Enhancements

### Step 5.1: Add Database Columns

**Migration:** Create `supabase/migrations/20260115_004_add_vendor_profile_fields.sql`

```sql
-- Migration: Add profile fields to vendor_profiles
-- Date: 2026-01-15
-- Phase: P

-- Add description field (both tiers)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add social links (premium only, enforced in app)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;

-- Example social_links structure:
-- {
--   "facebook": "https://facebook.com/...",
--   "instagram": "https://instagram.com/...",
--   "website": "https://..."
-- }

-- Add comments
COMMENT ON COLUMN vendor_profiles.description IS 'Vendor description/about section (both tiers)';
COMMENT ON COLUMN vendor_profiles.social_links IS 'Social media links (premium tier only)';

-- Migration applied successfully
```

---

### Step 5.2: Create Profile Edit Form

**File:** `src/components/vendor/ProfileEditForm.tsx`

```typescript
'use client'
import { useState } from 'react'

interface Props {
  vendorId: string
  currentData: {
    description?: string | null
    social_links?: any
  }
  tier: 'standard' | 'premium' | 'featured'
}

export default function ProfileEditForm({ vendorId, currentData, tier }: Props) {
  const [formData, setFormData] = useState({
    description: currentData.description || '',
    facebook: currentData.social_links?.facebook || '',
    instagram: currentData.social_links?.instagram || '',
    website: currentData.social_links?.website || ''
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    try {
      const res = await fetch('/api/vendor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          description: formData.description,
          social_links: tier === 'premium' || tier === 'featured' ? {
            facebook: formData.facebook,
            instagram: formData.instagram,
            website: formData.website
          } : null
        })
      })

      if (res.ok) {
        setMessage('Profile updated successfully!')
        setTimeout(() => setMessage(''), 3000)
      } else {
        const data = await res.json()
        setMessage(data.error || 'Failed to update profile')
      }
    } catch (error) {
      setMessage('Error updating profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: 12, 
      padding: 24 
    }}>
      <h2 style={{ marginBottom: 20, fontSize: 20, fontWeight: 600 }}>
        About Your Business
      </h2>

      {/* Description - Both tiers */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ 
          display: 'block', 
          marginBottom: 8, 
          fontWeight: 600, 
          fontSize: 14 
        }}>
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Tell customers about your farm, your practices, what makes your products special..."
          rows={6}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical'
          }}
        />
        <p style={{ 
          margin: '4px 0 0', 
          fontSize: 12, 
          color: '#6b7280' 
        }}>
          Available for all vendors. This helps buyers learn about your business.
        </p>
      </div>

      {/* Social Links - Premium only */}
      {(tier === 'premium' || tier === 'featured') && (
        <div>
          <h3 style={{ 
            margin: '24px 0 16px', 
            fontSize: 16, 
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            Social Media Links
            <span style={{
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: '#dbeafe',
              color: '#3b82f6',
              borderRadius: 8
            }}>
              Premium Feature
            </span>
          </h3>

          <div style={{ display: 'grid', gap: 16 }}>
            {/* Facebook */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: 600, 
                fontSize: 14 
              }}>
                Facebook Page
              </label>
              <input
                type="url"
                value={formData.facebook}
                onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                placeholder="https://facebook.com/yourpage"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>

            {/* Instagram */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: 600, 
                fontSize: 14 
              }}>
                Instagram Profile
              </label>
              <input
                type="url"
                value={formData.instagram}
                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                placeholder="https://instagram.com/yourprofile"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>

            {/* Website */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: 600, 
                fontSize: 14 
              }}>
                Website
              </label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://yourwebsite.com"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 24,
          padding: '12px 32px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.6 : 1
        }}
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>

      {/* Message */}
      {message && (
        <p style={{
          marginTop: 12,
          padding: 12,
          backgroundColor: message.includes('success') ? '#d1fae5' : '#fee2e2',
          color: message.includes('success') ? '#065f46' : '#991b1b',
          borderRadius: 6,
          fontSize: 14
        }}>
          {message}
        </p>
      )}
    </div>
  )
}
```

---

### Step 5.3: Create Profile Update API

**File:** `src/app/api/vendor/profile/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    
    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { vendorId, description, social_links } = await request.json()

    // Verify vendor ownership
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, tier')
      .eq('id', vendorId)
      .single()

    if (!vendor || vendor.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (description !== undefined) {
      updates.description = description
    }

    // Only premium can save social links
    if (social_links !== undefined && (vendor.tier === 'premium' || vendor.tier === 'featured')) {
      updates.social_links = social_links
    }

    // Update
    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update(updates)
      .eq('id', vendorId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

---

### Step 5.4: Display Profile Info

**File:** `src/app/[vertical]/vendor/[vendorId]/page.tsx`

**Enhance vendor profile page:**

```typescript
import VendorAvatar from '@/components/shared/VendorAvatar'
import TierBadge from '@/components/shared/TierBadge'

export default async function VendorProfilePage({ params }: Props) {
  // ... fetch vendor ...

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 32,
        marginBottom: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          {/* Avatar */}
          <VendorAvatar
            imageUrl={vendor.profile_image_url}
            name={vendor.business_name}
            size={120}
            tier={vendor.tier}
          />

          {/* Info */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700 }}>
                {vendor.business_name}
              </h1>
              {vendor.tier !== 'standard' && (
                <TierBadge tier={vendor.tier} size="lg" />
              )}
            </div>

            {/* Description */}
            {vendor.description && (
              <p style={{
                margin: '12px 0',
                fontSize: 16,
                lineHeight: 1.6,
                color: '#374151'
              }}>
                {vendor.description}
              </p>
            )}

            {/* Member since */}
            <p style={{
              margin: '12px 0 0',
              fontSize: 14,
              color: '#6b7280'
            }}>
              Member since {new Date(vendor.created_at).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric'
              })}
            </p>

            {/* Social Links (Premium only) */}
            {vendor.social_links && Object.keys(vendor.social_links).length > 0 && (
              <div style={{ 
                display: 'flex', 
                gap: 12, 
                marginTop: 16 
              }}>
                {vendor.social_links.facebook && (
                  <a
                    href={vendor.social_links.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#1877f2',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600
                    }}
                  >
                    Facebook
                  </a>
                )}
                {vendor.social_links.instagram && (
                  <a
                    href={vendor.social_links.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#e4405f',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600
                    }}
                  >
                    Instagram
                  </a>
                )}
                {vendor.social_links.website && (
                  <a
                    href={vendor.social_links.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600
                    }}
                  >
                    Website
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Listings */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 32,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 600 }}>
          Available Products
        </h2>
        {/* ... listings grid ... */}
      </div>
    </div>
  )
}
```

---

## Testing Checklist

### Bug Fixes
- [ ] Markets edit page loads without error
- [ ] Logo displays with correct aspect ratio
- [ ] No "Other" category in browse listings

### Checkout
- [ ] Cross-sell shows 3-4 products from cart vendors
- [ ] Quick Add button works
- [ ] Security messaging displays
- [ ] Blue branding throughout
- [ ] Suggestions API returns correct listings

### Premium Badges
- [ ] Badge shows on vendor profile
- [ ] Badge shows on listing cards
- [ ] Badge shows in admin vendor list
- [ ] Standard vendors don't show badge
- [ ] Colors correct (blue for premium)

### Profile Images
- [ ] Can upload image in vendor settings
- [ ] Image displays on profile
- [ ] Initials fallback works
- [ ] Border color matches tier
- [ ] Avatar NOT shown on listing cards (verified)

### Profile Enhancements
- [ ] Can edit description (both tiers)
- [ ] Can edit social links (premium only)
- [ ] Social links display on profile
- [ ] Member since date shows
- [ ] Save button works

---

## Commit Strategy

```bash
# After schema fixes
git add supabase/migrations/
git commit -m "fix(db): Add contact_email, profile fields to vendor tables"
git push origin feature/phase-p-vendor-profiles

# After logo fix
git add src/components/layout/Header.tsx
git commit -m "fix(ui): Fix logo aspect ratio in header"
git push origin feature/phase-p-vendor-profiles

# After checkout
git add src/app/[vertical]/checkout/page.tsx src/app/api/listings/suggestions/route.ts
git commit -m "feat(checkout): Add cross-sell section and enhanced branding"
git push origin feature/phase-p-vendor-profiles

# After badges
git add src/lib/constants.ts src/components/shared/TierBadge.tsx src/app/[vertical]/browse/page.tsx
git commit -m "feat(badges): Add premium tier badge system"
git push origin feature/phase-p-vendor-profiles

# After profile images
git add src/app/api/vendor/profile-image/ src/components/vendor/ProfileImageUpload.tsx src/components/shared/VendorAvatar.tsx
git commit -m "feat(vendor): Add profile image upload and display"
git push origin feature/phase-p-vendor-profiles

# After profile enhancements
git add src/components/vendor/ProfileEditForm.tsx src/app/api/vendor/profile/route.ts
git commit -m "feat(vendor): Add description and social links to profiles"
git push origin feature/phase-p-vendor-profiles
```

---

## Important Notes

### Supabase Storage Setup

**Before profile image upload will work, create storage bucket:**

1. Go to Supabase Dashboard → Storage
2. Create new bucket: `vendor-images`
3. Set as public
4. Add policies:
   - SELECT: Public (anyone can view)
   - INSERT: Authenticated users only
   - UPDATE: Own files only
   - DELETE: Own files only

---

### Social Links (Premium Only)

- Enforced in API (checks tier before saving)
- Standard vendors see message: "Upgrade to Premium to add social links"
- Form shows fields but disables for standard

---

### Cross-Sell Logic

- Shows products from vendors already in cart
- Excludes items already in cart
- Limits to 4 products
- Only shows published listings
- Filters by current vertical

---

*End of Phase P Build Instructions*
