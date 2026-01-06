# Build Instructions - Phase 3: Session Management & Infrastructure

**Session Date:** January 5, 2026  
**Created by:** Chet (Claude Chat)  
**Phase:** 3 - Session Management & Infrastructure  
**Prerequisites:** Phase 2 complete, signup working

---

## Objective

Implement session management middleware, configure Supabase auth properly, and establish infrastructure for production-ready authentication system.

---

## Part 1: Middleware for Session Management (PRIORITY 1)

### Why This Matters
- **Without middleware:** Sessions don't persist across page refreshes
- **With middleware:** User stays logged in, protected routes work correctly
- **Critical for:** Dashboard access, vendor profile management, any protected pages

### Step 1: Create Root Middleware

**Create:** `src/middleware.ts` (at root of src directory, not in app)

```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public assets (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**What this does:**
- Runs on every request (except static files)
- Refreshes user session
- Updates auth cookies
- Required for persistent login

### Step 2: Verify Middleware Utility Exists

**Check file:** `src/lib/supabase/middleware.ts`

**Should contain:**
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  await supabase.auth.getUser()

  return response
}
```

**If file doesn't exist or is incomplete, create/update it.**

### Step 3: Test Middleware

**Test sequence:**
1. Restart dev server
2. Visit http://localhost:3002/fireworks/signup
3. Sign up with new test account
4. Should redirect to dashboard
5. **Refresh page** (F5)
6. Should stay logged in (not kicked to login page)
7. **Close browser tab**
8. Reopen http://localhost:3002/fireworks/dashboard
9. Should still be logged in

**Expected:**
- ✅ Session persists across refreshes
- ✅ User stays logged in
- ✅ Dashboard accessible after browser close

**If fails:**
- Check middleware.ts exists at correct location
- Check matcher pattern includes dashboard routes
- Check browser cookies (should see sb-access-token)

---

## Part 2: Configure Supabase Auth Settings (PRIORITY 2)

### Step 1: Dev Environment Settings

**In Supabase Dev Dashboard:**

1. **Go to:** Authentication → Settings

2. **Email Auth:**
   - ✅ Enable email provider: ON
   - ❌ Confirm email: OFF (for dev speed)
   - ❌ Secure email change: OFF (for dev)

3. **Site URL:**
   ```
   http://localhost:3002
   ```

4. **Redirect URLs (Add these):**
   ```
   http://localhost:3002/**
   http://localhost:3002/fireworks/dashboard
   http://localhost:3002/farmers_market/dashboard
   ```

5. **JWT Expiry:**
   - Keep default (3600 seconds / 1 hour)
   - Will auto-refresh via middleware

6. **Email Templates:**
   - Leave default for now
   - Can customize later

### Step 2: Staging Environment Settings

**In Supabase Staging Dashboard:**

1. **Site URL:**
   ```
   https://inpersonmarketplace.vercel.app
   ```

2. **Redirect URLs:**
   ```
   https://inpersonmarketplace.vercel.app/**
   https://inpersonmarketplace.vercel.app/fireworks/dashboard
   https://inpersonmarketplace.vercel.app/farmers_market/dashboard
   ```

3. **Email Settings:**
   - ❌ Confirm email: OFF (for testing)
   - Can enable later for production

---

## Part 3: Protect Routes with Server-Side Auth Check (PRIORITY 3)

### Step 1: Update Dashboard to Enforce Auth

**Update:** `src/app/[vertical]/dashboard/page.tsx`

**Ensure it has proper auth check:**

```typescript
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getVerticalConfig } from '@/lib/branding'
import LogoutButton from './LogoutButton'

interface DashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { vertical } = await params
  const supabase = createServerClient()

  // CRITICAL: Check auth - redirect if not logged in
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

  // Get user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Get vendor profile for THIS vertical
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
        <h2>Welcome, {profile?.display_name || user.email}!</h2>
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

### Step 2: Create Protected Route Wrapper (Optional but Recommended)

**Create:** `src/lib/auth/protected-route.tsx`

```typescript
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

interface ProtectedRouteProps {
  children: React.ReactNode
  redirectTo?: string
}

export async function ProtectedRoute({ 
  children, 
  redirectTo = '/login' 
}: ProtectedRouteProps) {
  const supabase = createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect(redirectTo)
  }

  return <>{children}</>
}
```

**Usage example:**
```typescript
// In any protected page:
import { ProtectedRoute } from '@/lib/auth/protected-route'

export default async function MyProtectedPage() {
  return (
    <ProtectedRoute redirectTo="/fireworks/login">
      <div>Protected content here</div>
    </ProtectedRoute>
  )
}
```

---

## Part 4: Test Complete Auth Flow (PRIORITY 4)

### Test 1: Basic Signup Flow
1. Clear browser cookies
2. Visit http://localhost:3002/fireworks/signup
3. Create new account
4. Should redirect to dashboard
5. ✅ User sees welcome message with name
6. ✅ Dashboard shows "Become a Vendor"

### Test 2: Session Persistence
1. While logged in, refresh page (F5)
2. ✅ Should stay logged in
3. Close browser tab
4. Reopen http://localhost:3002/fireworks/dashboard
5. ✅ Should still be logged in (until session expires)

### Test 3: Protected Routes
1. Logout
2. Try to visit http://localhost:3002/fireworks/dashboard directly
3. ✅ Should redirect to login page
4. Login
5. ✅ Should redirect back to dashboard

### Test 4: Login Flow
1. Logout
2. Visit http://localhost:3002/fireworks/login
3. Login with existing account
4. ✅ Should redirect to dashboard
5. ✅ Dashboard accessible

### Test 5: Logout Flow
1. While logged in, click Logout button
2. ✅ Should redirect to login page
3. Try to visit dashboard
4. ✅ Should redirect to login (session cleared)

### Test 6: Multi-Vertical
1. Login to fireworks
2. Visit http://localhost:3002/farmers_market/dashboard
3. ✅ Should be logged in (same session)
4. ✅ Dashboard shows "Become a Vendor" (no farmers market vendor profile yet)

---

## Part 5: Update Vendor Signup Flow (PRIORITY 5)

### Ensure Vendor Signup Requires Auth

**Update:** `src/app/[vertical]/vendor-signup/page.tsx`

**Add auth check at top of component:**

```typescript
'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
// ... other imports

export default function VendorSignupPage({ params }: VendorSignupPageProps) {
  const { vertical } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        // Not logged in - redirect to signup/login
        router.push(`/${vertical}/signup`)
        return
      }
      
      setUser(user)
      setLoading(false)
    }
    
    checkAuth()
  }, [vertical, router, supabase])
  
  if (loading) {
    return <div>Loading...</div>
  }
  
  if (!user) {
    return null // Will redirect
  }
  
  // Rest of component...
}
```

---

## Testing Checklist

**After implementing all parts:**

- [ ] Middleware file exists at `src/middleware.ts`
- [ ] Middleware utility exists at `src/lib/supabase/middleware.ts`
- [ ] Dev server restarts without errors
- [ ] Can create new account
- [ ] Session persists across page refresh
- [ ] Session persists across browser close/reopen (until expiry)
- [ ] Dashboard redirects to login when not authenticated
- [ ] Login redirects to dashboard when successful
- [ ] Logout clears session and redirects to login
- [ ] Vendor signup requires login
- [ ] Vendor signup links profile to user
- [ ] Multi-vertical support works (same user, different dashboards)
- [ ] Supabase Dev auth settings configured
- [ ] Supabase Staging auth settings configured

---

## Migration Files

**No new migrations required for this phase.**

All changes are:
- Code updates (middleware, route protection)
- Configuration (Supabase dashboard settings)
- No database schema changes

---

## Session Summary Requirements

**Tasks Completed:**
- [ ] Created middleware.ts at src root
- [ ] Verified/created middleware utility
- [ ] Updated dashboard with auth check
- [ ] Created protected route wrapper (optional)
- [ ] Updated vendor signup to require auth
- [ ] Configured Supabase Dev auth settings
- [ ] Configured Supabase Staging auth settings
- [ ] All test scenarios passed

**Files Created:**
```
src/middleware.ts - Session management middleware
src/lib/auth/protected-route.tsx - Reusable auth wrapper (optional)
```

**Files Modified:**
```
src/app/[vertical]/dashboard/page.tsx - Added auth enforcement
src/app/[vertical]/vendor-signup/page.tsx - Requires login
```

**Testing Results:**
- Signup flow working
- Session persists
- Protected routes working
- Login/logout working
- Multi-vertical support confirmed

**Configuration Changes:**
- Supabase Dev: Site URL, redirect URLs configured
- Supabase Staging: Site URL, redirect URLs configured
- Email confirmation disabled for dev/staging

---

## Common Issues & Solutions

### Issue: Session doesn't persist
**Cause:** Middleware not running or not at correct location  
**Fix:** Ensure `middleware.ts` is at `src/middleware.ts` (not in app folder)

### Issue: Redirect loop
**Cause:** Middleware redirecting protected routes incorrectly  
**Fix:** Check matcher pattern, ensure dashboard routes not excluded

### Issue: "Cannot read properties of undefined"
**Cause:** Trying to access user before auth check completes  
**Fix:** Add loading state, wait for auth check

### Issue: Logout doesn't clear session
**Cause:** Not calling `supabase.auth.signOut()`  
**Fix:** Ensure LogoutButton calls signOut before redirect

---

**Estimated Time:** 1-2 hours  
**Complexity:** Medium (critical for production)  
**Test Thoroughly:** Every auth scenario
