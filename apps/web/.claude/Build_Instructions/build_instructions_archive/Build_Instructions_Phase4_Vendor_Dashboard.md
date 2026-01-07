# Build Instructions - Phase 4: Vendor Dashboard

**Session Date:** January 5, 2026  
**Created by:** Chet (Claude Chat)  
**Phase:** 4 - Vendor Dashboard  
**Prerequisites:** Phase 3 complete, vendors can signup and profiles are linked

---

## Objective

Create a vendor dashboard where authenticated vendors can view and edit their vendor profile information for a specific vertical. This provides vendors a way to manage their business details, view their status, and update information.

---

## Overview

**What vendors will be able to do:**
- View their vendor profile for current vertical
- See verification status
- Edit business information
- Update contact details
- View when they joined

**Navigation:**
- From user dashboard: "Manage Your Vendor Profile" button
- Direct URL: `/[vertical]/vendor/dashboard`

---

## Part 1: Create Vendor Dashboard Page

**Create:** `src/app/[vertical]/vendor/dashboard/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding'
import Link from 'next/link'
import EditProfileButton from './EditProfileButton'

interface VendorDashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function VendorDashboardPage({ params }: VendorDashboardPageProps) {
  const { vertical } = await params
  const supabase = createServerClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const config = getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get vendor profile for THIS vertical
  const { data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  // If no vendor profile, redirect to vendor signup
  if (vendorError || !vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get user profile for display name
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('display_name, email')
    .eq('user_id', user.id)
    .single()

  // Parse profile_data JSON
  const profileData = vendorProfile.profile_data as Record<string, any>

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
            Vendor Dashboard
          </h1>
          <p style={{ fontSize: 14, color: branding.colors.secondary }}>
            {branding.brand_name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href={`/${vertical}/dashboard`}
            style={{
              padding: '10px 20px',
              backgroundColor: branding.colors.secondary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 4,
              fontWeight: 600
            }}
          >
            User Dashboard
          </Link>
        </div>
      </div>

      {/* Status Banner */}
      <div style={{
        padding: 20,
        marginBottom: 30,
        backgroundColor: 
          vendorProfile.status === 'approved' ? '#d4edda' :
          vendorProfile.status === 'submitted' ? '#fff3cd' :
          vendorProfile.status === 'rejected' ? '#f8d7da' : '#e2e3e5',
        border: `1px solid ${
          vendorProfile.status === 'approved' ? '#c3e6cb' :
          vendorProfile.status === 'submitted' ? '#ffeaa7' :
          vendorProfile.status === 'rejected' ? '#f5c6cb' : '#d6d8db'
        }`,
        borderRadius: 8,
        color: '#333'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: 18 }}>
              Status: {vendorProfile.status.charAt(0).toUpperCase() + vendorProfile.status.slice(1)}
            </strong>
            <p style={{ margin: '5px 0 0 0', fontSize: 14 }}>
              {vendorProfile.status === 'approved' && 'Your vendor profile is approved and active'}
              {vendorProfile.status === 'submitted' && 'Your profile is under review'}
              {vendorProfile.status === 'rejected' && 'Your profile needs updates'}
              {vendorProfile.status === 'suspended' && 'Your profile is currently suspended'}
            </p>
          </div>
          {vendorProfile.status !== 'approved' && (
            <div style={{ fontSize: 12, color: '#666' }}>
              Submitted: {new Date(vendorProfile.created_at).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      {/* Profile Information */}
      <div style={{ display: 'grid', gap: 20 }}>
        {/* Contact Information */}
        <div style={{
          padding: 20,
          backgroundColor: 'white',
          color: '#333',
          border: `1px solid ${branding.colors.secondary}`,
          borderRadius: 8
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 20 
          }}>
            <h2 style={{ color: branding.colors.primary }}>Contact Information</h2>
            <EditProfileButton vertical={vertical} vendorId={vendorProfile.vendor_id} />
          </div>

          <div style={{ display: 'grid', gap: 15 }}>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Legal Name:</strong>
              <span>{profileData.legal_name || 'Not provided'}</span>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Phone Number:</strong>
              <span>{profileData.phone || 'Not provided'}</span>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Email:</strong>
              <span>{profileData.email || userProfile?.email || 'Not provided'}</span>
            </div>
          </div>
        </div>

        {/* Business Information */}
        <div style={{
          padding: 20,
          backgroundColor: 'white',
          color: '#333',
          border: `1px solid ${branding.colors.secondary}`,
          borderRadius: 8
        }}>
          <h2 style={{ color: branding.colors.primary, marginBottom: 20 }}>
            Business Information
          </h2>

          <div style={{ display: 'grid', gap: 15 }}>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Business Name:</strong>
              <span>{profileData.business_name || profileData.farm_name || 'Not provided'}</span>
            </div>
            
            {vertical === 'fireworks' && (
              <>
                <div>
                  <strong style={{ display: 'block', marginBottom: 5 }}>Business Type:</strong>
                  <span>{profileData.business_type || 'Not provided'}</span>
                </div>
                <div>
                  <strong style={{ display: 'block', marginBottom: 5 }}>Primary County (TX):</strong>
                  <span>{profileData.primary_county || 'Not provided'}</span>
                </div>
                <div>
                  <strong style={{ display: 'block', marginBottom: 5 }}>Seller Permit #:</strong>
                  <span>{profileData.seller_permit || 'Not provided'}</span>
                </div>
              </>
            )}

            {vertical === 'farmers_market' && (
              <>
                <div>
                  <strong style={{ display: 'block', marginBottom: 5 }}>Vendor Type:</strong>
                  <span>{profileData.vendor_type || 'Not provided'}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Account Details */}
        <div style={{
          padding: 20,
          backgroundColor: 'white',
          color: '#333',
          border: `1px solid ${branding.colors.secondary}`,
          borderRadius: 8
        }}>
          <h2 style={{ color: branding.colors.primary, marginBottom: 20 }}>
            Account Details
          </h2>

          <div style={{ display: 'grid', gap: 15 }}>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Vendor ID:</strong>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {vendorProfile.vendor_id}
              </span>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Member Since:</strong>
              <span>{new Date(vendorProfile.created_at).toLocaleDateString()}</span>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Last Updated:</strong>
              <span>{new Date(vendorProfile.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Future Features */}
        <div style={{
          padding: 20,
          backgroundColor: '#f8f9fa',
          color: '#333',
          border: '1px solid #dee2e6',
          borderRadius: 8
        }}>
          <h3 style={{ marginBottom: 15, color: '#666' }}>Coming Soon</h3>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#888' }}>
            <li>Manage your listings</li>
            <li>View orders and reservations</li>
            <li>Analytics and insights</li>
            <li>Customer messages</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
```

---

## Part 2: Create Edit Profile Button Component

**Create:** `src/app/[vertical]/vendor/dashboard/EditProfileButton.tsx`

```typescript
'use client'

import { useRouter } from 'next/navigation'

interface EditProfileButtonProps {
  vertical: string
  vendorId: string
}

export default function EditProfileButton({ vertical, vendorId }: EditProfileButtonProps) {
  const router = useRouter()

  const handleEdit = () => {
    // Navigate to edit page (we'll create this in next step)
    router.push(`/${vertical}/vendor/edit`)
  }

  return (
    <button
      onClick={handleEdit}
      style={{
        padding: '8px 16px',
        backgroundColor: '#0070f3',
        color: 'white',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: 14
      }}
    >
      Edit Profile
    </button>
  )
}
```

---

## Part 3: Create Edit Profile Page

**Create:** `src/app/[vertical]/vendor/edit/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding'
import EditProfileForm from './EditProfileForm'

interface EditProfilePageProps {
  params: Promise<{ vertical: string }>
}

export default async function EditProfilePage({ params }: EditProfilePageProps) {
  const { vertical } = await params
  const supabase = createServerClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const config = getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get vendor profile
  const { data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (vendorError || !vendorProfile) {
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
          Edit Vendor Profile
        </h1>
        <p style={{ fontSize: 14, color: branding.colors.secondary }}>
          {branding.brand_name}
        </p>
      </div>

      <EditProfileForm 
        vertical={vertical}
        vendorProfile={vendorProfile}
        branding={branding}
      />
    </div>
  )
}
```

---

## Part 4: Create Edit Profile Form Component

**Create:** `src/app/[vertical]/vendor/edit/EditProfileForm.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'

interface EditProfileFormProps {
  vertical: string
  vendorProfile: any
  branding: VerticalBranding
}

export default function EditProfileForm({ vertical, vendorProfile, branding }: EditProfileFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const profileData = vendorProfile.profile_data as Record<string, any>

  const [formData, setFormData] = useState({
    legal_name: profileData.legal_name || '',
    phone: profileData.phone || '',
    email: profileData.email || '',
    business_name: profileData.business_name || profileData.farm_name || '',
    // Add other fields as needed
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Merge new data with existing profile_data
    const updatedProfileData = {
      ...profileData,
      ...formData
    }

    const { error } = await supabase
      .from('vendor_profiles')
      .update({
        profile_data: updatedProfileData,
        updated_at: new Date().toISOString()
      })
      .eq('vendor_id', vendorProfile.vendor_id)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    // Redirect back to dashboard after 1 second
    setTimeout(() => {
      router.push(`/${vertical}/vendor/dashboard`)
    }, 1000)
  }

  if (success) {
    return (
      <div style={{
        padding: 30,
        backgroundColor: 'white',
        border: '2px solid ' + branding.colors.accent,
        borderRadius: 8,
        textAlign: 'center',
        color: '#333'
      }}>
        <h2 style={{ color: branding.colors.accent }}>Profile Updated!</h2>
        <p>Redirecting to dashboard...</p>
      </div>
    )
  }

  return (
    <div style={{
      maxWidth: 600,
      margin: '0 auto',
      padding: 30,
      backgroundColor: 'white',
      border: '1px solid ' + branding.colors.secondary,
      borderRadius: 8,
      color: '#333'
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
        {/* Legal Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Legal Name
          </label>
          <input
            type="text"
            name="legal_name"
            value={formData.legal_name}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: '1px solid ' + branding.colors.primary,
              borderRadius: 4
            }}
          />
        </div>

        {/* Phone */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Phone Number
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: '1px solid ' + branding.colors.primary,
              borderRadius: 4
            }}
          />
        </div>

        {/* Email */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Email Address
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: '1px solid ' + branding.colors.primary,
              borderRadius: 4
            }}
          />
        </div>

        {/* Business Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Business Name
          </label>
          <input
            type="text"
            name="business_name"
            value={formData.business_name}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: '1px solid ' + branding.colors.primary,
              borderRadius: 4
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 30 }}>
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
            {loading ? 'Saving...' : 'Save Changes'}
          </button>

          <button
            type="button"
            onClick={() => router.push(`/${vertical}/vendor/dashboard`)}
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
```

---

## Part 5: Update User Dashboard to Link to Vendor Dashboard

**Update:** `src/app/[vertical]/dashboard/page.tsx`

**In the vendor status section, update the "already a vendor" case:**

```typescript
{vendorProfile ? (
  <>
    <h3 style={{ color: branding.colors.accent }}>
      ✓ You're a {config.name_public} Vendor
    </h3>
    <p><strong>Status:</strong> {vendorProfile.status}</p>
    <p><strong>Joined:</strong> {new Date(vendorProfile.created_at).toLocaleDateString()}</p>
    
    {/* ADD THIS BUTTON */}
    <a 
      href={`/${vertical}/vendor/dashboard`}
      style={{
        display: 'inline-block',
        marginTop: 10,
        padding: '10px 20px',
        backgroundColor: branding.colors.primary,
        color: 'white',
        textDecoration: 'none',
        borderRadius: 4,
        fontWeight: 600
      }}
    >
      Manage Vendor Profile
    </a>
  </>
) : (
  // ... existing "Become a Vendor" case
)}
```

---

## Part 6: Test Vendor Dashboard

### Test 1: Access Dashboard
1. Login as existing vendor
2. Go to user dashboard
3. Click "Manage Vendor Profile"
4. ✅ Should load vendor dashboard
5. ✅ Should show profile information

### Test 2: View Profile Details
1. On vendor dashboard
2. ✅ Should see contact information
3. ✅ Should see business information
4. ✅ Should see status banner
5. ✅ Should see account details

### Test 3: Edit Profile
1. Click "Edit Profile"
2. ✅ Should load edit form
3. ✅ Form should be pre-filled
4. Change phone number
5. Click "Save Changes"
6. ✅ Should show success message
7. ✅ Should redirect to dashboard
8. ✅ Should show updated phone

### Test 4: Cancel Edit
1. Click "Edit Profile"
2. Change some fields
3. Click "Cancel"
4. ✅ Should redirect to dashboard
5. ✅ Changes should not be saved

### Test 5: Direct URL Access
1. Logout
2. Try visiting `/fireworks/vendor/dashboard`
3. ✅ Should redirect to login
4. Login
5. ✅ Should redirect to vendor dashboard

### Test 6: No Vendor Profile
1. Login with user who has NO vendor profile
2. Try visiting `/fireworks/vendor/dashboard`
3. ✅ Should redirect to vendor signup

---

## Migration Files

**No database migrations required** - Uses existing vendor_profiles table

---

## Session Summary Requirements

**Tasks Completed:**
- [ ] Created vendor dashboard page
- [ ] Created edit profile button component
- [ ] Created edit profile page
- [ ] Created edit profile form component
- [ ] Updated user dashboard with vendor dashboard link
- [ ] All test scenarios passed

**Files Created:**
```
src/app/[vertical]/vendor/dashboard/page.tsx
src/app/[vertical]/vendor/dashboard/EditProfileButton.tsx
src/app/[vertical]/vendor/edit/page.tsx
src/app/[vertical]/vendor/edit/EditProfileForm.tsx
```

**Files Modified:**
```
src/app/[vertical]/dashboard/page.tsx - Added vendor dashboard link
```

**Testing Results:**
- Vendor dashboard displays correctly
- Profile information shows accurately
- Edit profile form pre-fills correctly
- Profile updates save successfully
- Navigation works correctly
- Protected routes redirect properly

---

**Estimated Time:** 2-3 hours  
**Complexity:** Medium  
**Priority:** High for vendor functionality
