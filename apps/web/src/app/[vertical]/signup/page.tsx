'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding, VerticalBranding } from '@/lib/branding'

interface SignupPageProps {
  params: Promise<{ vertical: string }>
}

interface VerticalConfig {
  vertical_name_public?: string
  branding?: VerticalBranding
}

export default function SignupPage({ params }: SignupPageProps) {
  const { vertical } = use(params)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [startWithPremium, setStartWithPremium] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.fireworks)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`/api/vertical/${vertical}`)
        if (res.ok) {
          const cfg: VerticalConfig = await res.json()
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
          preferred_vertical: vertical,
          start_with_premium: startWithPremium,
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
        // If they selected premium, redirect to upgrade page to complete payment
        if (startWithPremium) {
          router.push(`/${vertical}/buyer/upgrade`)
        } else {
          router.push(`/${vertical}/dashboard`)
        }
        router.refresh()
      }, 2000)
    }
  }

  if (configLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: branding.colors.background,
        color: branding.colors.text
      }}>
        Loading...
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
          <p style={{ color: '#333' }}>
            Welcome to {branding.brand_name}.{' '}
            {startWithPremium
              ? 'Redirecting to complete your Premium membership...'
              : 'Redirecting to your dashboard...'
            }
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
                borderRadius: 4,
                boxSizing: 'border-box'
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
                borderRadius: 4,
                boxSizing: 'border-box'
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
              disabled={loading}
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

          {/* Premium Membership Option */}
          <div
            onClick={() => !loading && setStartWithPremium(!startWithPremium)}
            style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: startWithPremium ? '2px solid #2563eb' : '2px solid #e5e7eb',
              backgroundColor: startWithPremium ? '#eff6ff' : '#f9fafb',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12
            }}>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                border: startWithPremium ? '2px solid #2563eb' : '2px solid #d1d5db',
                backgroundColor: startWithPremium ? '#2563eb' : 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2
              }}>
                {startWithPremium && (
                  <span style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>✓</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 4
                }}>
                  <span style={{ fontSize: 16 }}>⭐</span>
                  <span style={{
                    fontWeight: 600,
                    color: startWithPremium ? '#1e40af' : '#374151'
                  }}>
                    Start with Premium
                  </span>
                  <span style={{
                    backgroundColor: '#059669',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600
                  }}>
                    SAVE 32%
                  </span>
                </div>
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  color: '#6b7280',
                  lineHeight: 1.4
                }}>
                  $9.99/month or $81.50/year — Early access to listings, priority support, and more
                </p>
              </div>
            </div>
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
