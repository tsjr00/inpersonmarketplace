'use client'

import { useState } from 'react'
import Link from 'next/link'
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

    // M8 FIX: Use rate-limited API endpoint instead of direct Supabase auth
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Login failed')
        setLoading(false)
        return
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
      return
    }

    // API verified credentials + admin role. Now sign in client-side for session.
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Check if MFA is required (only on staging/production)
    const requireMFA = process.env.NEXT_PUBLIC_REQUIRE_ADMIN_MFA === 'true'

    if (requireMFA) {
      // Check MFA status
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const hasMFA = factors?.totp?.some(f => f.status === 'verified')

      if (!hasMFA) {
        // Redirect to MFA setup
        router.push('/admin/mfa/setup')
        return
      }

      // Has MFA, redirect to verification
      router.push('/admin/mfa/verify')
      return
    }

    // MFA not required, go directly to admin
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
                fontSize: 16,
                boxSizing: 'border-box'
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
                fontSize: 16,
                boxSizing: 'border-box'
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
          <Link
            href="/"
            style={{
              color: '#666',
              textDecoration: 'none',
              fontSize: 14
            }}
          >
            ← Back to 815enterprises.com
          </Link>
        </div>
      </div>
    </div>
  )
}
