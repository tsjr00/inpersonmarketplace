'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding, VerticalBranding } from '@/lib/branding'

interface ResetPasswordPageProps {
  params: Promise<{ vertical: string }>
}

export default function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { vertical } = use(params)
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validatingToken, setValidatingToken] = useState(true)
  const [configLoading, setConfigLoading] = useState(true)
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.fireworks)
  const supabase = createClient()

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`/api/vertical/${vertical}`)
        if (res.ok) {
          const cfg = await res.json()
          if (cfg.branding) {
            setBranding(cfg.branding)
          }
        }
      } catch (err) {
        console.error('Failed to load config:', err)
      } finally {
        setConfigLoading(false)
      }
    }
    loadConfig()
  }, [vertical])

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

  if (configLoading || validatingToken) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: branding.colors.background,
        color: branding.colors.text
      }}>
        {validatingToken ? 'Validating reset link...' : 'Loading...'}
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
          textAlign: 'center',
          color: '#333'
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
      color: branding.colors.text
    }}>
      {/* Navigation */}
      <nav style={{
        padding: '15px 40px',
        borderBottom: `1px solid ${branding.colors.secondary}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Link href={`/${vertical}`} style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, textDecoration: 'none' }}>
          {branding.brand_name}
        </Link>
        <Link href="/" style={{ color: branding.colors.secondary, textDecoration: 'none' }}>Home</Link>
      </nav>

      {/* Logo/Header */}
      <div style={{ textAlign: 'center', marginBottom: 40, paddingTop: 40, padding: 20 }}>
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
            {error.includes('expired') && (
              <div style={{ marginTop: 10 }}>
                <Link
                  href={`/${vertical}/forgot-password`}
                  style={{ color: branding.colors.primary, fontWeight: 600 }}
                >
                  Request a new reset link
                </Link>
              </div>
            )}
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
              disabled={loading || !!error}
              minLength={6}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4,
                boxSizing: 'border-box'
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
              disabled={loading || !!error}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !!error}
            style={{
              width: '100%',
              padding: 12,
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: (loading || !!error) ? '#ccc' : branding.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: (loading || !!error) ? 'not-allowed' : 'pointer',
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
