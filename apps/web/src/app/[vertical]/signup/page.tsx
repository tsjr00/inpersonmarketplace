'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding, VerticalBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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

  if (configLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase,
        color: colors.textPrimary
      }}>
        Loading...
      </div>
    )
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          maxWidth: containers.sm,
          margin: '0 auto',
          padding: spacing.lg,
          backgroundColor: colors.surfaceElevated,
          border: `2px solid ${colors.accent}`,
          borderRadius: radius.md
        }}>
          <h2 style={{ color: colors.accent, marginBottom: spacing.xs, fontSize: typography.sizes.xl }}>
            Account Created!
          </h2>
          <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base }}>
            Welcome to {branding.brand_name}. Redirecting to your dashboard...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textSecondary
    }}>
      {/* Navigation */}
      <nav style={{
        padding: `${spacing.sm} ${spacing.xl}`,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Link href={`/${vertical}`} style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.primary, textDecoration: 'none' }}>
          {branding.brand_name}
        </Link>
        <Link href="/" style={{ color: colors.textMuted, textDecoration: 'none' }}>Home</Link>
      </nav>

      {/* Logo/Header */}
      <div style={{ textAlign: 'center', marginBottom: spacing.xl, paddingTop: spacing.xl, padding: spacing.md }}>
        <h1 style={{
          fontSize: typography.sizes['3xl'],
          fontWeight: typography.weights.bold,
          color: colors.textPrimary,
          marginBottom: spacing.xs
        }}>
          {branding.brand_name}
        </h1>
        <p style={{ fontSize: typography.sizes.lg, color: colors.textSecondary }}>
          {branding.tagline}
        </p>
      </div>

      {/* Signup Form */}
      <div style={{
        maxWidth: containers.sm,
        margin: '0 auto',
        padding: spacing.lg,
        backgroundColor: colors.surfaceElevated,
        color: colors.textSecondary,
        border: `2px solid ${colors.primary}`,
        borderRadius: radius.md,
        boxShadow: shadows.md
      }}>
        <h2 style={{
          marginBottom: spacing.md,
          color: colors.textPrimary,
          textAlign: 'center',
          fontSize: typography.sizes.xl
        }}>
          Create Your Account
        </h2>

        {error && (
          <div style={{
            padding: spacing.xs,
            marginBottom: spacing.md,
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: radius.sm,
            color: '#c00'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: spacing.sm }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
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
                padding: spacing.xs,
                fontSize: typography.sizes.base,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: spacing.sm }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
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
                padding: spacing.xs,
                fontSize: typography.sizes.base,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: spacing.sm }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
              Password (min 6 characters)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
                style={{
                  width: '100%',
                  padding: spacing.xs,
                  paddingRight: '44px',
                  fontSize: typography.sizes.base,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: colors.textMuted,
                  fontSize: typography.sizes.lg
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: spacing.md }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
              Confirm Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%',
                  padding: spacing.xs,
                  paddingRight: '44px',
                  fontSize: typography.sizes.base,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: colors.textMuted,
                  fontSize: typography.sizes.lg
                }}
                title={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: spacing.xs,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              backgroundColor: loading ? colors.textMuted : colors.primary,
              color: colors.textInverse,
              border: 'none',
              borderRadius: radius.sm,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : shadows.primary
            }}
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p style={{ marginTop: spacing.md, textAlign: 'center', color: colors.textMuted, fontSize: typography.sizes.base }}>
          Already have an account?{' '}
          <Link href={`/${vertical}/login`} style={{ color: colors.primary, fontWeight: typography.weights.semibold }}>
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
