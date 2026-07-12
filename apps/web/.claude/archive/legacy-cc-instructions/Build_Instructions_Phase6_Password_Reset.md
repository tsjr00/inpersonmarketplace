# Build Instructions - Phase 6: Password Reset Flow

**Session Date:** January 6, 2026  
**Created by:** Chet (Claude Chat)  
**Phase:** 6 - Password Reset Flow  
**Prerequisites:** Phase 3 complete, session management working

---

## Objective

Implement complete password reset flow allowing users to reset forgotten passwords via email. Includes reset request page, email handling, and password update page.

---

## Overview

**User Flow:**
1. User clicks "Forgot Password?" on login page
2. Enters email address
3. Receives reset link via email
4. Clicks link → redirects to reset password page
5. Enters new password
6. Password updated, redirects to login

---

## Part 1: Add Forgot Password Link to Login

**Update:** `src/app/[vertical]/login/page.tsx`

**Add link below login form:**

```typescript
<p style={{ marginTop: 20, textAlign: 'center' }}>
  Don't have an account?{' '}
  <Link href={`/${vertical}/signup`} style={{ color: branding.colors.primary, fontWeight: 600 }}>
    Sign up
  </Link>
</p>

{/* ADD THIS */}
<p style={{ marginTop: 10, textAlign: 'center' }}>
  <Link 
    href={`/${vertical}/forgot-password`} 
    style={{ color: branding.colors.secondary, fontSize: 14 }}
  >
    Forgot your password?
  </Link>
</p>
```

---

## Part 2: Create Forgot Password Page

**Create:** `src/app/[vertical]/forgot-password/page.tsx`

```typescript
'use client'

import { useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { getVerticalConfig } from '@/lib/branding'

interface ForgotPasswordPageProps {
  params: Promise<{ vertical: string }>
}

export default function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const { vertical } = use(params)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const config = getVerticalConfig(vertical)
  const branding = config?.branding

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/${vertical}/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
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
        justifyContent: 'center',
        padding: 20
      }}>
        <div style={{ 
          maxWidth: 400, 
          padding: 30,
          backgroundColor: 'white',
          border: `2px solid ${branding.colors.accent}`,
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <h2 style={{ color: branding.colors.accent, marginBottom: 20 }}>
            Check Your Email
          </h2>
          <p style={{ marginBottom: 20, color: '#666' }}>
            We've sent a password reset link to <strong>{email}</strong>
          </p>
          <p style={{ marginBottom: 20, fontSize: 14, color: '#999' }}>
            The link will expire in 1 hour.
          </p>
          <Link 
            href={`/${vertical}/login`}
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 4,
              fontWeight: 600
            }}
          >
            Back to Login
          </Link>
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

      {/* Reset Form */}
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
          Reset Your Password
        </h2>

        <p style={{ marginBottom: 20, color: '#666', fontSize: 14 }}>
          Enter your email address and we'll send you a link to reset your password.
        </p>
        
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

        <form onSubmit={handleResetRequest}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="your@email.com"
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
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 15
            }}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <div style={{ textAlign: 'center' }}>
            <Link 
              href={`/${vertical}/login`}
              style={{ color: branding.colors.secondary, fontSize: 14 }}
            >
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
```

---

## Part 3: Create Reset Password Page

**Create:** `src/app/[vertical]/reset-password/page.tsx`

```typescript
'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getVerticalConfig } from '@/lib/branding'

interface ResetPasswordPageProps {
  params: Promise<{ vertical: string }>
}

export default function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { vertical } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validatingToken, setValidatingToken] = useState(true)
  const supabase = createClient()

  const config = getVerticalConfig(vertical)
  const branding = config?.branding

  // Validate reset token on mount
  useEffect(() => {
    const validateToken = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error || !session) {
        setError('Invalid or expired reset link. Please request a new one.')
        setValidatingToken(false)
        return
      }
      
      setValidatingToken(false)
    }
    
    validateToken()
  }, [supabase])

  const handlePasswordReset = async (e: React.FormEvent) => {
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

    const { error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
    
    // Redirect to login after 2 seconds
    setTimeout(() => {
      router.push(`/${vertical}/login`)
    }, 2000)
  }

  if (!branding) {
    return <div>Invalid marketplace</div>
  }

  if (validatingToken) {
    return (
      <div style={{ 
        minHeight: '100vh',
        backgroundColor: branding.colors.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: branding.colors.text }}>
          Validating reset link...
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={{ 
        minHeight: '100vh',
        backgroundColor: branding.colors.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}>
        <div style={{ 
          maxWidth: 400, 
          padding: 30,
          backgroundColor: 'white',
          border: `2px solid ${branding.colors.accent}`,
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <h2 style={{ color: branding.colors.accent, marginBottom: 20 }}>
            Password Reset Successful!
          </h2>
          <p style={{ color: '#666' }}>
            Redirecting to login...
          </p>
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

      {/* Reset Form */}
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
          Set New Password
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

        <form onSubmit={handlePasswordReset}>
          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              New Password (min 6 characters)
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
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 15
            }}
          >
            {loading ? 'Updating Password...' : 'Update Password'}
          </button>

          <div style={{ textAlign: 'center' }}>
            <Link 
              href={`/${vertical}/login`}
              style={{ color: branding.colors.secondary, fontSize: 14 }}
            >
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
```

---

## Part 4: Configure Email Templates (Optional)

**In Supabase Dashboard → Authentication → Email Templates:**

**Customize "Reset Password" template:**

```html
<h2>Reset Your Password</h2>
<p>Someone requested a password reset for your account.</p>
<p>Click the link below to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>
<p>This link expires in 1 hour.</p>
```

---

## Part 5: Test Password Reset Flow

### Test 1: Request Reset
1. Go to http://localhost:3002/fireworks/login
2. Click "Forgot your password?"
3. Enter existing user email
4. Click "Send Reset Link"
5. ✅ Should show "Check Your Email" message

### Test 2: Check Email
1. Open email inbox (check spam)
2. ✅ Should receive "Reset Password" email
3. Click reset link
4. ✅ Should open reset password page

### Test 3: Reset Password
1. Enter new password (min 6 chars)
2. Confirm new password
3. Click "Update Password"
4. ✅ Should show success message
5. ✅ Should redirect to login

### Test 4: Login with New Password
1. Login with email + new password
2. ✅ Should work
3. Try old password
4. ✅ Should fail

### Test 5: Expired Link
1. Wait for link to expire (1 hour) OR
2. Use link twice
3. ✅ Should show "Invalid or expired" error

---

## Migration Files

**No database migrations required** - Uses Supabase Auth built-in password reset

---

## Session Summary Requirements

**Tasks Completed:**
- [ ] Added "Forgot Password" link to login page
- [ ] Created forgot-password page
- [ ] Created reset-password page
- [ ] Configured email templates (optional)
- [ ] All test scenarios passed

**Files Created:**
```
src/app/[vertical]/forgot-password/page.tsx
src/app/[vertical]/reset-password/page.tsx
```

**Files Modified:**
```
src/app/[vertical]/login/page.tsx - Added forgot password link
```

**Testing Results:**
- Password reset request works
- Email received with reset link
- Reset password page loads
- Password successfully updated
- Can login with new password
- Old password no longer works

---

**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Priority:** High for MVP
