# Build Instructions - Production Domain Setup

**Date:** January 6, 2026  
**Priority:** High - Production deployment  
**Estimated Time:** 2-3 hours (includes DNS propagation wait)

---

## Overview

**Domain Architecture:**
| Domain | Purpose | Shows |
|--------|---------|-------|
| fastwrks.com | Fireworks marketplace | fireworks vertical only |
| farmersmarketing.app | Farmers market | farmers_market vertical only |
| 815enterprises.com | Admin access | /admin only (redirects otherwise) |

**Current Staging:** inpersonmarketplace.vercel.app (keep for dev testing)

---

## Part 1: Add Logos to Project

### Step 1: Create Public Assets Folder

```bash
mkdir -p public/logos
```

### Step 2: Add Logo Files

Copy uploaded logos to:
```
public/logos/fastwrks-logo.png
public/logos/farmersmarketing-logo.png
```

**Note:** Tracy will provide these files - they're already uploaded to the chat.

---

## Part 2: Domain Detection Middleware

### Create: `src/lib/domain/config.ts`

```typescript
export interface DomainConfig {
  domain: string
  verticalId: string | null  // null = show all (umbrella)
  isAdmin: boolean           // admin-only domain
  brandName: string
  logoPath: string | null
}

export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  // Production domains
  'fastwrks.com': {
    domain: 'fastwrks.com',
    verticalId: 'fireworks',
    isAdmin: false,
    brandName: 'FastWrks',
    logoPath: '/logos/fastwrks-logo.png'
  },
  'www.fastwrks.com': {
    domain: 'fastwrks.com',
    verticalId: 'fireworks',
    isAdmin: false,
    brandName: 'FastWrks',
    logoPath: '/logos/fastwrks-logo.png'
  },
  'farmersmarketing.app': {
    domain: 'farmersmarketing.app',
    verticalId: 'farmers_market',
    isAdmin: false,
    brandName: 'Farmers Marketing',
    logoPath: '/logos/farmersmarketing-logo.png'
  },
  'www.farmersmarketing.app': {
    domain: 'farmersmarketing.app',
    verticalId: 'farmers_market',
    isAdmin: false,
    brandName: 'Farmers Marketing',
    logoPath: '/logos/farmersmarketing-logo.png'
  },
  '815enterprises.com': {
    domain: '815enterprises.com',
    verticalId: null,
    isAdmin: true,
    brandName: '815 Enterprises',
    logoPath: null
  },
  'www.815enterprises.com': {
    domain: '815enterprises.com',
    verticalId: null,
    isAdmin: true,
    brandName: '815 Enterprises',
    logoPath: null
  },
  // Development/Staging
  'localhost:3002': {
    domain: 'localhost:3002',
    verticalId: null,  // Show all on localhost
    isAdmin: false,
    brandName: 'FastWrks Dev',
    logoPath: null
  },
  'inpersonmarketplace.vercel.app': {
    domain: 'inpersonmarketplace.vercel.app',
    verticalId: null,  // Show all on staging
    isAdmin: false,
    brandName: 'FastWrks Staging',
    logoPath: null
  }
}

export function getDomainConfig(host: string): DomainConfig {
  // Remove port for matching if needed
  const hostWithoutPort = host.split(':')[0]
  
  return DOMAIN_CONFIG[host] || 
         DOMAIN_CONFIG[hostWithoutPort] || 
         {
           domain: host,
           verticalId: null,
           isAdmin: false,
           brandName: 'Marketplace',
           logoPath: null
         }
}
```

### Create: `src/lib/domain/server.ts`

```typescript
import { headers } from 'next/headers'
import { getDomainConfig, DomainConfig } from './config'

export async function getServerDomainConfig(): Promise<DomainConfig> {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3002'
  return getDomainConfig(host)
}
```

---

## Part 3: Update Main Homepage for Domain-Aware Routing

### Replace: `src/app/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding/server'
import Link from 'next/link'
import Image from 'next/image'

export default async function HomePage() {
  const domainConfig = await getServerDomainConfig()
  const supabase = createServerClient()
  
  // Admin-only domain: redirect to /admin
  if (domainConfig.isAdmin) {
    redirect('/admin')
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
  domainConfig: any 
}) {
  const supabase = createServerClient()
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
  const supabase = createServerClient()
  
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
        {verticals?.map((v: any) => {
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
```

---

## Part 4: Create Domain-Aware Route Handlers

The single-vertical domains need routes WITHOUT the [vertical] prefix.

### Create: `src/app/browse/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'

export default async function BrowsePage() {
  const domainConfig = await getServerDomainConfig()
  
  if (!domainConfig.verticalId) {
    // Multi-vertical domain - need to specify vertical
    redirect('/')
  }
  
  // Redirect to the vertical-specific browse
  redirect(`/${domainConfig.verticalId}/browse`)
}
```

### Create: `src/app/login/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'

export default async function LoginPage() {
  const domainConfig = await getServerDomainConfig()
  
  if (!domainConfig.verticalId) {
    redirect('/')
  }
  
  redirect(`/${domainConfig.verticalId}/login`)
}
```

### Create: `src/app/signup/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'

export default async function SignupPage() {
  const domainConfig = await getServerDomainConfig()
  
  if (!domainConfig.verticalId) {
    redirect('/')
  }
  
  redirect(`/${domainConfig.verticalId}/signup`)
}
```

### Create: `src/app/dashboard/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'

export default async function DashboardPage() {
  const domainConfig = await getServerDomainConfig()
  
  if (!domainConfig.verticalId) {
    redirect('/')
  }
  
  redirect(`/${domainConfig.verticalId}/dashboard`)
}
```

### Create: `src/app/vendor-signup/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'

export default async function VendorSignupPage() {
  const domainConfig = await getServerDomainConfig()
  
  if (!domainConfig.verticalId) {
    redirect('/')
  }
  
  redirect(`/${domainConfig.verticalId}/vendor-signup`)
}
```

---

## Part 5: Update Database Branding

### Run SQL in Supabase (Staging):

```sql
-- Update Fireworks branding to match new logo colors
UPDATE verticals
SET config = jsonb_set(
  config,
  '{branding}',
  '{
    "domain": "fastwrks.com",
    "brand_name": "FastWrks",
    "tagline": "Your Local Fireworks Marketplace",
    "colors": {
      "primary": "#ff6b35",
      "secondary": "#4ecdc4",
      "background": "#1a1a2e",
      "text": "#ffffff"
    },
    "meta": {
      "title": "FastWrks - Local Fireworks Marketplace",
      "description": "Find and purchase fireworks from verified local vendors",
      "keywords": "fireworks, local vendors, fireworks stand"
    }
  }'::jsonb
)
WHERE vertical_id = 'fireworks';

-- Update Farmers Market branding to match new logo colors
UPDATE verticals
SET config = jsonb_set(
  config,
  '{branding}',
  '{
    "domain": "farmersmarketing.app",
    "brand_name": "Farmers Marketing",
    "tagline": "Connect with Local Farmers & Artisans",
    "colors": {
      "primary": "#2d4a5e",
      "secondary": "#5a7a8a",
      "background": "#f5f0e6",
      "text": "#2d4a5e"
    },
    "meta": {
      "title": "Farmers Marketing - Local Farmers Market Marketplace",
      "description": "Pre-order fresh produce and artisan goods from local farmers market vendors",
      "keywords": "farmers market, local produce, farm fresh, artisan"
    }
  }'::jsonb
)
WHERE vertical_id = 'farmers_market';

-- Verify
SELECT vertical_id, config->'branding'->>'brand_name', config->'branding'->>'domain'
FROM verticals;
```

---

## Part 6: Vercel Domain Configuration

### In Vercel Dashboard:

1. Go to your project: **inpersonmarketplace**
2. Click **Settings** → **Domains**
3. Add each domain:

**Add: fastwrks.com**
- Click "Add"
- Enter: `fastwrks.com`
- Also add: `www.fastwrks.com`

**Add: farmersmarketing.app**
- Click "Add"
- Enter: `farmersmarketing.app`
- Also add: `www.farmersmarketing.app`

**Add: 815enterprises.com**
- Click "Add"
- Enter: `815enterprises.com`
- Also add: `www.815enterprises.com`

Vercel will show you the DNS records needed.

---

## Part 7: Squarespace DNS Configuration

### For each domain in Squarespace:

1. Log into Squarespace
2. Go to **Domains** → Select domain → **DNS Settings**

### fastwrks.com DNS Records:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 | 3600 |
| CNAME | www | cname.vercel-dns.com | 3600 |

### farmersmarketing.app DNS Records:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 | 3600 |
| CNAME | www | cname.vercel-dns.com | 3600 |

### 815enterprises.com DNS Records:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 | 3600 |
| CNAME | www | cname.vercel-dns.com | 3600 |

**Note:** DNS propagation can take 5 min to 48 hours (usually < 1 hour)

---

## Part 8: Supabase Auth Configuration

### In Supabase Dashboard (Staging Project):

1. Go to **Authentication** → **URL Configuration**

2. **Site URL:** 
   ```
   https://fastwrks.com
   ```

3. **Redirect URLs** (add ALL of these):
   ```
   https://fastwrks.com/**
   https://www.fastwrks.com/**
   https://farmersmarketing.app/**
   https://www.farmersmarketing.app/**
   https://815enterprises.com/**
   https://www.815enterprises.com/**
   https://inpersonmarketplace.vercel.app/**
   http://localhost:3002/**
   ```

4. Click **Save**

---

## Part 9: Testing Checklist

### After DNS Propagates:

**fastwrks.com:**
- [ ] Homepage loads with FastWrks logo
- [ ] Dark navy background, colorful firework accent
- [ ] "Start Shopping" → /browse (fireworks only)
- [ ] "Start Selling" → /vendor-signup
- [ ] Login/Signup work
- [ ] Only fireworks listings visible

**farmersmarketing.app:**
- [ ] Homepage loads with Farmers Marketing logo
- [ ] Cream/beige background, navy text
- [ ] "Start Shopping" → /browse (farmers market only)
- [ ] "Start Selling" → /vendor-signup
- [ ] Login/Signup work
- [ ] Only farmers market listings visible

**815enterprises.com:**
- [ ] Redirects to /admin
- [ ] Admin login works
- [ ] Can manage both verticals

**localhost:3002:**
- [ ] Still shows multi-vertical selector
- [ ] Both verticals accessible

---

## Summary of Files to Create/Modify

**Create:**
```
public/logos/fastwrks-logo.png (from upload)
public/logos/farmersmarketing-logo.png (from upload)
src/lib/domain/config.ts
src/lib/domain/server.ts
src/app/browse/page.tsx (redirect handler)
src/app/login/page.tsx (redirect handler)
src/app/signup/page.tsx (redirect handler)
src/app/dashboard/page.tsx (redirect handler)
src/app/vendor-signup/page.tsx (redirect handler)
```

**Modify:**
```
src/app/page.tsx (domain-aware homepage)
```

**Manual Steps (Tracy):**
1. Vercel: Add 3 domains
2. Squarespace: Configure DNS for 3 domains
3. Supabase: Update redirect URLs
4. Run branding SQL update
