# Build Instructions - Fix 815enterprises.com

**Priority:** High - Currently broken (redirect loop)
**Time:** 30 minutes

---

## Problem

815enterprises.com has redirect loop:
1. Homepage → redirects to /admin (isAdmin domain)
2. /admin → requires auth → redirects to login
3. /login → no vertical → redirects back
4. Loop

---

## Solution

Create simple landing page for 815enterprises.com with:
- Basic company info
- Discreet admin login link
- No redirect to /admin by default

---

## Part 1: Update Domain Config

**File:** `src/lib/domain/config.ts`

Change 815enterprises.com config:

```typescript
'815enterprises.com': {
  domain: '815enterprises.com',
  verticalId: null,
  isAdmin: false,  // Changed from true - don't auto-redirect
  isUmbrella: true,  // New flag for umbrella domain
  brandName: '815 Enterprises',
  logoPath: null
},
'www.815enterprises.com': {
  domain: '815enterprises.com',
  verticalId: null,
  isAdmin: false,
  isUmbrella: true,
  brandName: '815 Enterprises',
  logoPath: null
},
```

Also update the DomainConfig interface:

```typescript
export interface DomainConfig {
  domain: string
  verticalId: string | null
  isAdmin: boolean
  isUmbrella?: boolean  // Add this
  brandName: string
  logoPath: string | null
}
```

---

## Part 2: Update Homepage for Umbrella Domain

**File:** `src/app/page.tsx`

In the main HomePage component, add handling for umbrella domain:

```typescript
export default async function HomePage() {
  const domainConfig = await getServerDomainConfig()
  const supabase = createServerClient()
  
  // Umbrella domain: show company landing page
  if (domainConfig.isUmbrella) {
    return <UmbrellaHome />
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
```

Add the UmbrellaHome component:

```typescript
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
          <a 
            href="/admin"
            style={{ 
              color: '#666', 
              textDecoration: 'none',
              fontSize: 14
            }}
          >
            Admin Login
          </a>
        </div>
        <p style={{ fontSize: 14 }}>
          © 2026 815 Enterprises. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
```

---

## Part 3: Fix Admin Login Redirect

**File:** `src/app/admin/layout.tsx`

Update the requireAdmin function to handle domains without verticals:

Find the redirect for unauthorized users and change to:

```typescript
// In requireAdmin() - if user not logged in
if (error || !user) {
  // Get current domain to determine redirect
  const headersList = await headers()
  const host = headersList.get('host') || ''
  
  // For umbrella domain, redirect to admin login page
  if (host.includes('815enterprises.com')) {
    redirect('/admin/login')
  }
  
  // For vertical domains, redirect to vertical login
  redirect('/login?error=unauthorized')
}
```

---

## Part 4: Create Admin Login Page

**Create:** `src/app/admin/login/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/admin')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1a1a2e'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: 40,
        borderRadius: 12,
        width: '100%',
        maxWidth: 400
      }}>
        <h1 style={{ 
          marginBottom: 10,
          color: '#333',
          fontSize: 24
        }}>
          Admin Login
        </h1>
        <p style={{ 
          marginBottom: 30,
          color: '#666',
          fontSize: 14
        }}>
          815 Enterprises Administration
        </p>

        {error && (
          <div style={{
            padding: 12,
            backgroundColor: '#fee',
            color: '#c00',
            borderRadius: 6,
            marginBottom: 20,
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ 
              display: 'block', 
              marginBottom: 5,
              color: '#333',
              fontWeight: 600
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 6,
                border: '1px solid #ddd',
                fontSize: 16
              }}
            />
          </div>

          <div style={{ marginBottom: 30 }}>
            <label style={{ 
              display: 'block', 
              marginBottom: 5,
              color: '#333',
              fontWeight: 600
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 6,
                border: '1px solid #ddd',
                fontSize: 16
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 14,
              backgroundColor: loading ? '#ccc' : '#333',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ 
          marginTop: 30, 
          textAlign: 'center',
          paddingTop: 20,
          borderTop: '1px solid #eee'
        }}>
          <a 
            href="/"
            style={{ 
              color: '#666', 
              textDecoration: 'none',
              fontSize: 14
            }}
          >
            ← Back to 815enterprises.com
          </a>
        </div>
      </div>
    </div>
  )
}
```

---

## Part 5: Ensure Admin Login Page Bypasses Layout Auth

**Create:** `src/app/admin/login/layout.tsx`

```typescript
export default function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No auth check - this is the login page
  return <>{children}</>
}
```

---

## Testing

- [ ] https://815enterprises.com loads landing page
- [ ] About, Platforms, Contact sections work
- [ ] Platform cards link to correct domains
- [ ] "Admin Login" link in footer works
- [ ] /admin/login shows login form
- [ ] Login with admin credentials → redirects to /admin dashboard
- [ ] Non-admin login shows error or redirects appropriately

---

## Files Summary

**Modified:**
- `src/lib/domain/config.ts` - Add isUmbrella flag
- `src/app/page.tsx` - Add UmbrellaHome component
- `src/app/admin/layout.tsx` - Update redirect logic

**Created:**
- `src/app/admin/login/page.tsx` - Admin login page
- `src/app/admin/login/layout.tsx` - Bypass auth for login page
