'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding, VerticalBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import { Turnstile, useTurnstile } from '@/components/auth/Turnstile'

interface SignupPageProps {
  params: Promise<{ vertical: string }>
}

interface VerticalConfig {
  vertical_name_public?: string
  branding?: VerticalBranding
}

export default function SignupPage({ params }: SignupPageProps) {
  const { vertical } = use(params)
  const locale = getClientLocale()
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
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.farmers_market)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEventRef = searchParams.get('ref') === 'event'
  const prefillEmail = searchParams.get('email') || ''
  const returnTo = searchParams.get('returnTo')
  const dashboardUrl = returnTo || `/${vertical}/dashboard${isEventRef ? '?section=events' : ''}`
  const supabase = createClient()
  const { token: turnstileToken, isVerified: captchaVerified, handleVerify, handleError: handleCaptchaError, handleExpire } = useTurnstile()

  useEffect(() => {
    if (prefillEmail && !email) setEmail(prefillEmail)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      setError(t('signup.passwords_mismatch', locale))
      setLoading(false)
      return
    }

    if (password.length < 9) {
      setError(t('signup.password_length', locale))
      setLoading(false)
      return
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError(t('signup.password_complexity', locale))
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
          signup_redirect_to: dashboardUrl,
        },
        emailRedirectTo: `${window.location.origin}${dashboardUrl}`,
        captchaToken: turnstileToken || undefined,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Supabase returns a user with empty identities when the email already exists
    // (security behavior to prevent email enumeration)
    if (data.user && data.user.identities?.length === 0) {
      setError(`An account with this email already exists. Log in with your existing password to start using ${branding.brand_name}. Your password is the same across all 815 Enterprises platforms.`)
      setLoading(false)
      return
    }

    if (data.user) {
      setSuccess(true)
      // Don't auto-redirect — user needs to confirm their email first
      // returnTo is stored in user_metadata (set above) and read by confirm-email page
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
        {t('signup.loading', locale)}
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
            {t('signup.account_created', locale)}
          </h2>
          <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base, marginBottom: spacing.sm }}>
            {t('signup.welcome', locale, { brand: branding.brand_name })}
          </p>
          <div style={{
            padding: spacing.sm,
            backgroundColor: '#eff6ff',
            border: '1px solid #93c5fd',
            borderRadius: radius.sm,
          }}>
            <p style={{ margin: 0, fontSize: typography.sizes.sm, color: '#1e40af', fontWeight: typography.weights.medium }}>
              Check your email to confirm your account.
            </p>
            <p style={{ margin: `${spacing['2xs']} 0 0 0`, fontSize: typography.sizes.xs, color: '#1e40af' }}>
              Click the confirmation link in the email we just sent you, then you&#39;ll be ready to go.
            </p>
          </div>
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
        <Link href="/" style={{ color: colors.textMuted, textDecoration: 'none' }}>{t('nav.home', locale)}</Link>
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
          {t('signup.create_account', locale)}
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
              {t('signup.full_name', locale)}
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
              {t('signup.email', locale)}
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
              {t('signup.password_label', locale)}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={9}
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
                title={showPassword ? t('signup.hide_password', locale) : t('signup.show_password', locale)}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
            {password.length > 0 && (
              <div style={{ marginTop: spacing['2xs'], display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing['3xs']} ${spacing.sm}` }}>
                {[
                  { met: password.length >= 9, label: '9+ characters' },
                  { met: /[A-Z]/.test(password), label: 'Uppercase letter' },
                  { met: /[a-z]/.test(password), label: 'Lowercase letter' },
                  { met: /[0-9]/.test(password), label: 'Number' },
                  { met: /[^A-Za-z0-9]/.test(password), label: 'Special character' },
                ].map(req => (
                  <span key={req.label} style={{
                    fontSize: typography.sizes.xs,
                    color: req.met ? '#16a34a' : colors.textMuted,
                  }}>
                    {req.met ? '✓' : '○'} {req.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: spacing.md }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
              {t('signup.confirm_password', locale)}
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
                title={showConfirmPassword ? t('signup.hide_password', locale) : t('signup.show_password', locale)}
              >
                {showConfirmPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <Turnstile onVerify={handleVerify} onError={handleCaptchaError} onExpire={handleExpire} />

          <button
            type="submit"
            disabled={loading || (!captchaVerified && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)}
            style={{
              width: '100%',
              padding: spacing.xs,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              backgroundColor: (loading || (!captchaVerified && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) ? colors.textMuted : colors.primary,
              color: colors.textInverse,
              border: 'none',
              borderRadius: radius.sm,
              cursor: (loading || (!captchaVerified && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) ? 'not-allowed' : 'pointer',
              boxShadow: (loading || (!captchaVerified && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) ? 'none' : shadows.primary
            }}
          >
            {loading ? t('signup.creating', locale) : t('signup.submit', locale)}
          </button>
        </form>

        <p style={{ marginTop: spacing.md, textAlign: 'center', color: colors.textMuted, fontSize: typography.sizes.base }}>
          {t('signup.already_have_account', locale)}{' '}
          <Link href={`/${vertical}/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} style={{ color: colors.primary, fontWeight: typography.weights.semibold }}>
            {t('header.login', locale)}
          </Link>
        </p>
      </div>
    </div>
  )
}
