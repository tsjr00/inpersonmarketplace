# Build Instructions - Multi-Brand Authentication (Phase 2)

**Session Date:** January 4, 2026  
**Created by:** Chet (Claude Chat)  
**Folder:** .claude\Build_Instructions\  
**Phase:** 2 - Multi-Brand Authentication

---

## Objective
Implement Supabase Auth with vertical-awareness for multi-brand architecture. Each brand domain has its own login/signup experience, but all connect to the same backend. Users can have one account with multiple vendor profiles (one per brand/vertical).

## Architecture Decision
**Approach C: Separate Domains with Duplicate Login**
- fireworksstand.com, farmersmarket.app, etc.
- Each has own login/signup pages
- Sessions don't share across domains
- Same Supabase backend
- User can participate in multiple verticals

---

## Phase 2A: Foundation & Database Updates

### 1. Update Vendor Profiles Schema

**Create migration:** `supabase/migrations/20260104_003_vendor_vertical_constraint.sql`

```sql
-- Migration: Add unique constraint for user+vertical combination
-- Created: 2026-01-04
-- Purpose: Prevent duplicate vendor profiles per vertical

-- Add unique constraint
ALTER TABLE vendor_profiles
ADD CONSTRAINT unique_user_vertical 
UNIQUE (user_id, vertical_id);

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_user_vertical 
ON vendor_profiles(user_id, vertical_id);

COMMENT ON CONSTRAINT unique_user_vertical ON vendor_profiles IS 
'Ensures a user can only have one vendor profile per vertical, but can have multiple profiles across different verticals';
```

**Apply to both Dev and Staging**

### 2. Add Branding to Vertical Configs

**Update:** `config/verticals/fireworks.json`

Add branding section:
```json
{
  "vertical_id": "fireworks",
  "name_public": "Fireworks Marketplace",
  "branding": {
    "domain": "fireworksstand.com",
    "brand_name": "Fireworks Stand",
    "tagline": "Your Premier Fireworks Marketplace",
    "logo_path": "/branding/fireworks-logo.svg",
    "favicon": "/branding/fireworks-favicon.ico",
    "colors": {
      "primary": "#ff4500",
      "secondary": "#ffa500",
      "accent": "#ff6347",
      "background": "#1a1a1a",
      "text": "#ffffff"
    },
    "meta": {
      "title": "Fireworks Stand - Buy & Sell Fireworks",
      "description": "Connect with licensed fireworks sellers in your area",
      "keywords": "fireworks, buy fireworks, fireworks stand, fireworks marketplace"
    }
  },
  "vendor_fields": [
    // ... existing fields
  ]
}
```

**Update:** `config/verticals/farmers_market.json`

Add similar branding section with farmers market theme:
```json
{
  "vertical_id": "farmers_market",
  "name_public": "Farmers Market",
  "branding": {
    "domain": "farmersmarket.app",
    "brand_name": "Fresh Market",
    "tagline": "Farm Fresh, Locally Grown",
    "logo_path": "/branding/farmers-logo.svg",
    "favicon": "/branding/farmers-favicon.ico",
    "colors": {
      "primary": "#2d5016",
      "secondary": "#6b8e23",
      "accent": "#9acd32",
      "background": "#f5f5dc",
      "text": "#2d2d2d"
    },
    "meta": {
      "title": "Fresh Market - Local Farmers & Producers",
      "description": "Buy fresh produce directly from local farmers",
      "keywords": "farmers market, fresh produce, local food, organic"
    }
  },
  "vendor_fields": [
    // ... existing fields
  ]
}
```

### 3. Create Branding Utility

**Create:** `src/lib/branding.ts`

```typescript
import { readFileSync } from 'fs'
import { join } from 'path'

export interface VerticalBranding {
  domain: string
  brand_name: string
  tagline: string
  logo_path: string
  favicon: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  meta: {
    title: string
    description: string
    keywords: string
  }
}

export interface VerticalConfig {
  vertical_id: string
  name_public: string
  branding: VerticalBranding
  // ... other config fields
}

// Cache for loaded configs
const configCache: Record<string, VerticalConfig> = {}

export function getVerticalConfig(verticalId: string): VerticalConfig | null {
  // Check cache first
  if (configCache[verticalId]) {
    return configCache[verticalId]
  }

  try {
    const configPath = join(process.cwd(), '..', '..', 'config', 'verticals', `${verticalId}.json`)
    const configData = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(configData) as VerticalConfig
    
    // Cache it
    configCache[verticalId] = config
    return config
  } catch (error) {
    console.error(`Failed to load config for vertical: ${verticalId}`, error)
    return null
  }
}

export function getBrandingByDomain(domain: string): { vertical_id: string; branding: VerticalBranding } | null {
  // For now, hardcode mapping (can be made dynamic later)
  const domainMap: Record<string, string> = {
    'fireworksstand.com': 'fireworks',
    'www.fireworksstand.com': 'fireworks',
    'farmersmarket.app': 'farmers_market',
    'www.farmersmarket.app': 'farmers_market',
    'localhost:3002': 'fireworks', // Default for dev
    'inpersonmarketplace.vercel.app': 'fireworks', // Default for staging
  }

  const verticalId = domainMap[domain]
  if (!verticalId) return null

  const config = getVerticalConfig(verticalId)
  if (!config) return null

  return {
    vertical_id: verticalId,
    branding: config.branding
  }
}

export function getVerticalFromRequest(request: Request): string {
  const host = request.headers.get('host') || 'localhost:3002'
  const branding = getBrandingByDomain(host)
  return branding?.vertical_id || 'fireworks' // Default fallback
}
```

---

## Phase 2B: Vertical-Aware Authentication

### 4. Install Dependencies

```bash
cd apps/web
npm install @supabase/auth-helpers-nextjs @supabase/auth-helpers-react
```

### 5. Create Vertical-Aware Auth Pages

#### Dynamic Login Page

**Create:** `src/app/[vertical]/login/page.tsx`

```typescript
'use client'

import { useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getVerticalConfig } from '@/lib/branding'

interface LoginPageProps {
  params: Promise<{ vertical: string }>
}

export default function LoginPage({ params }: LoginPageProps) {
  const { vertical } = use(params)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Get branding for this vertical
  const config = getVerticalConfig(vertical)
  const branding = config?.branding

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      // Redirect to vertical-specific dashboard
      router.push(`/${vertical}/dashboard`)
      router.refresh()
    }
  }

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: 20
    }}>
      {/* Logo/Header */}
      <div style={{ textAlign: 'center', marginBottom: 40, paddingTop: 40 }}>
        <h1 style={{ 
          fontSize: 36, 
          fontWeight: 'bold',
          color: branding.colors.primary,
          marginBottom: 10
        }}>
          {branding.brand_name}
        </h1>
        <p style={{ fontSize: 18, color: branding.colors.secondary }}>
          {branding.tagline}
        </p>
      </div>

      {/* Login Form */}
      <div style={{ 
        maxWidth: 400, 
        margin: '0 auto', 
        padding: 30,
        backgroundColor: 'white',
        color: '#333',
        border: `2px solid ${branding.colors.primary}`,
        borderRadius: 8,
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ 
          marginBottom: 20, 
          color: branding.colors.primary,
          textAlign: 'center'
        }}>
          Login to Your Account
        </h2>
        
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

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{ 
                width: '100%', 
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={{ 
                width: '100%', 
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ 
              width: '100%', 
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
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', color: '#666' }}>
          Don't have an account?{' '}
          <Link href={`/${vertical}/signup`} style={{ color: branding.colors.primary, fontWeight: 600 }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
```

#### Dynamic Signup Page

**Create:** `src/app/[vertical]/signup/page.tsx`

```typescript
'use client'

import { useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getVerticalConfig } from '@/lib/branding'

interface SignupPageProps {
  params: Promise<{ vertical: string }>
}

export default function SignupPage({ params }: SignupPageProps) {
  const { vertical } = use(params)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const config = getVerticalConfig(vertical)
  const branding = config?.branding

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          preferred_vertical: vertical, // Track where they signed up
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      setSuccess(true)
      setTimeout(() => {
        router.push(`/${vertical}/dashboard`)
        router.refresh()
      }, 2000)
    }
  }

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  if (success) {
    return (
      <div style={{ 
        minHeight: '100vh',
        backgroundColor: branding.colors.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ 
          maxWidth: 400, 
          padding: 30,
          backgroundColor: 'white',
          border: `2px solid ${branding.colors.accent}`,
          borderRadius: 8
        }}>
          <h2 style={{ color: branding.colors.accent, marginBottom: 10 }}>
            Account Created!
          </h2>
          <p>Welcome to {branding.brand_name}. Redirecting to your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: 20
    }}>
      {/* Logo/Header */}
      <div style={{ textAlign: 'center', marginBottom: 40, paddingTop: 40 }}>
        <h1 style={{ 
          fontSize: 36, 
          fontWeight: 'bold',
          color: branding.colors.primary,
          marginBottom: 10
        }}>
          {branding.brand_name}
        </h1>
        <p style={{ fontSize: 18, color: branding.colors.secondary }}>
          {branding.tagline}
        </p>
      </div>

      {/* Signup Form */}
      <div style={{ 
        maxWidth: 400, 
        margin: '0 auto', 
        padding: 30,
        backgroundColor: 'white',
        color: '#333',
        border: `2px solid ${branding.colors.primary}`,
        borderRadius: 8,
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ 
          marginBottom: 20, 
          color: branding.colors.primary,
          textAlign: 'center'
        }}>
          Create Your Account
        </h2>
        
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

        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={loading}
              style={{ 
                width: '100%', 
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4
              }}
            />
          </div>

          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{ 
                width: '100%', 
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4
              }}
            />
          </div>

          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Password (min 6 characters)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
              style={{ 
                width: '100%', 
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              style={{ 
                width: '100%', 
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ 
              width: '100%', 
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
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', color: '#666' }}>
          Already have an account?{' '}
          <Link href={`/${vertical}/login`} style={{ color: branding.colors.primary, fontWeight: 600 }}>
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
```

### 6. Create Vertical-Aware Dashboard

**Create:** `src/app/[vertical]/dashboard/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { use } from 'react'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding'
import LogoutButton from './LogoutButton'

interface DashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { vertical } = await params
  const supabase = createServerClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const config = getVerticalConfig(vertical)
  const branding = config?.branding

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Get vendor profile for THIS vertical (if exists)
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

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
        <h1 style={{ color: branding.colors.primary }}>
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
        marginBottom: 20 
      }}>
        <h2>Welcome, {profile?.full_name || user.email}!</h2>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Account Created:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
      </div>

      {/* Vendor Status */}
      <div style={{ 
        padding: 20, 
        backgroundColor: 'white',
        color: '#333',
        border: `1px solid ${branding.colors.secondary}`, 
        borderRadius: 8 
      }}>
        {vendorProfile ? (
          <>
            <h3 style={{ color: branding.colors.accent }}>
              ✓ You're a {config.name_public} Vendor
            </h3>
            <p><strong>Status:</strong> {vendorProfile.status}</p>
            <p><strong>Joined:</strong> {new Date(vendorProfile.created_at).toLocaleDateString()}</p>
          </>
        ) : (
          <>
            <h3>Become a Vendor</h3>
            <p>You're not yet registered as a vendor on {branding.brand_name}.</p>
            <a 
              href={`/${vertical}/vendor-signup`}
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
              Complete Vendor Registration
            </a>
          </>
        )}
      </div>
    </div>
  )
}
```

**Create:** `src/app/[vertical]/dashboard/LogoutButton.tsx`

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'

interface LogoutButtonProps {
  vertical: string
  branding: VerticalBranding
}

export default function LogoutButton({ vertical, branding }: LogoutButtonProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push(`/${vertical}/login`)
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        padding: '10px 20px',
        backgroundColor: '#f44',
        color: 'white',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontWeight: 600
      }}
    >
      Logout
    </button>
  )
}
```

### 7. Update Vendor Signup to Link User

**Update:** `src/app/[vertical]/vendor-signup/page.tsx`

Add auth check and auto-populate user_id:

```typescript
// At top of component
const supabase = createClient()
const { data: { user } } = await supabase.auth.getUser()

// In handleSubmit, before fetch:
if (!user) {
  alert('Please login first to become a vendor')
  router.push(`/${vertical}/login`)
  return
}

// When submitting, include user_id:
const response = await fetch('/api/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    vertical,
    user_id: user.id,  // Add this
    ...values
  })
})
```

### 8. Update API to Accept User ID

**Update:** `src/app/api/submit/route.ts`

```typescript
export async function POST(request: Request) {
  const body = await request.json()
  const { vertical, user_id, ...data } = body

  // Validate user_id provided
  if (!user_id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  const supabase = createClient()

  // Check if vendor profile already exists for this user+vertical
  const { data: existing } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user_id)
    .eq('vertical_id', vertical)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: 'You already have a vendor profile for this marketplace' },
      { status: 400 }
    )
  }

  // Create vendor profile with user_id
  const { data: vendor, error } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id,
      vertical_id: vertical,
      status: 'submitted',
      profile_data: data
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, vendor_id: vendor.id })
}
```

---

## Testing Phase 2

### Test Sequence

**1. Test Fireworks Brand:**
```
1. Visit http://localhost:3002/fireworks/signup
2. See fireworks branding (colors, name)
3. Sign up with test@fireworks.com
4. Redirect to /fireworks/dashboard
5. See fireworks-branded dashboard
6. Click "Complete Vendor Registration"
7. Fill vendor signup form
8. Submit - should link to user account
9. Dashboard shows "You're a Fireworks Vendor"
```

**2. Test Farmers Market Brand:**
```
1. Logout from fireworks
2. Visit http://localhost:3002/farmers_market/signup
3. See farmers market branding (different colors/name)
4. Sign up with test@farmers.com
5. Redirect to /farmers_market/dashboard
6. See farmers market-branded dashboard
```

**3. Test Multi-Vertical:**
```
1. Login to fireworks site with test@fireworks.com
2. Complete fireworks vendor profile
3. Visit http://localhost:3002/farmers_market/login
4. Login with SAME email (test@fireworks.com)
5. Dashboard shows "Become a Vendor" (no farmers vendor yet)
6. Complete farmers market vendor profile
7. Check database: 1 user, 2 vendor profiles
```

### Database Verification

**In Supabase Dev:**

```sql
-- Check user has one account
SELECT * FROM auth.users WHERE email = 'test@fireworks.com';

-- Check user has one profile
SELECT * FROM user_profiles WHERE user_id = '[user-id-from-above]';

-- Check user has TWO vendor profiles
SELECT 
  vendor_id,
  vertical_id,
  user_id,
  status,
  created_at
FROM vendor_profiles 
WHERE user_id = '[user-id-from-above]';
-- Should see 2 rows: one for fireworks, one for farmers_market
```

---

## Session Summary Requirements

Create summary with:

**Tasks Completed:**
- [ ] Migration for unique user+vertical constraint
- [ ] Branding configs added to vertical JSON files
- [ ] Branding utility created
- [ ] Vertical-aware login pages
- [ ] Vertical-aware signup pages
- [ ] Vertical-aware dashboard
- [ ] Vendor signup updated to link user
- [ ] API updated to accept user_id
- [ ] All vertical flows tested

**Testing Results:**
- Signup works per vertical
- Login works per vertical
- Dashboard shows correct branding
- Vendor profiles link to users
- Multi-vertical support confirmed
- Database enforces unique constraint

**Next Steps:**
- Add middleware for session management
- Configure Supabase auth settings
- Add password reset flow
- Deploy to staging with separate domains

---

**Estimated Time:** 3-4 hours (complex multi-brand setup)  
**Complexity:** Very High (critical foundation)  
**Test Thoroughly:** Every vertical, every flow
