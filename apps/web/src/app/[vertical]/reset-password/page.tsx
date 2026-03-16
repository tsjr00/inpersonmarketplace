'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding, VerticalBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface ResetPasswordPageProps {
  params: Promise<{ vertical: string }>
}

export default function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { vertical } = use(params)
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validatingToken, setValidatingToken] = useState(true)
  const [configLoading, setConfigLoading] = useState(true)
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.farmers_market)
  const supabase = createClient()
  const locale = getClientLocale()

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
        setError(t('reset.invalid_link', locale))
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
      setError(t('reset.passwords_mismatch', locale))
      setLoading(false)
      return
    }

    if (password.length < 9) {
      setError(t('reset.password_length', locale))
      setLoading(false)
      return
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError(t('reset.password_complexity', locale))
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
        backgroundColor: colors.surfaceBase,
        color: colors.textPrimary
      }}>
        {validatingToken ? t('reset.validating', locale) : t('reset.loading', locale)}
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
        justifyContent: 'center',
        padding: spacing.md
      }}>
        <div style={{
          maxWidth: containers.sm,
          margin: '0 auto',
          padding: spacing.lg,
          backgroundColor: colors.surfaceElevated,
          border: `2px solid ${colors.accent}`,
          borderRadius: radius.md,
          textAlign: 'center',
          color: colors.textSecondary
        }}>
          <h2 style={{ color: colors.accent, marginBottom: spacing.md, fontSize: typography.sizes.xl }}>
            {t('reset.success_title', locale)}
          </h2>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.base }}>
            {t('reset.success_redirect', locale)}
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

      {/* Reset Form */}
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
          {t('reset.title', locale)}
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
            {error.includes('expired') && (
              <div style={{ marginTop: spacing.xs }}>
                <Link
                  href={`/${vertical}/forgot-password`}
                  style={{ color: colors.primary, fontWeight: typography.weights.semibold }}
                >
                  {t('reset.request_new', locale)}
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handlePasswordReset}>
          <div style={{ marginBottom: spacing.sm }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
              {t('reset.new_password_label', locale)}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading || !!error}
                minLength={6}
                style={{
                  width: '100%',
                  padding: `${spacing.xs} 40px ${spacing.xs} ${spacing.xs}`,
                  fontSize: typography.sizes.base,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('login.hide_password', locale) : t('login.show_password', locale)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  fontSize: 18,
                  color: '#9ca3af',
                  lineHeight: 1,
                  minHeight: 44,
                  minWidth: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: spacing.md }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
              {t('reset.confirm_label', locale)}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading || !!error}
                style={{
                  width: '100%',
                  padding: `${spacing.xs} 40px ${spacing.xs} ${spacing.xs}`,
                  fontSize: typography.sizes.base,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? t('login.hide_password', locale) : t('login.show_password', locale)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  fontSize: 18,
                  color: '#9ca3af',
                  lineHeight: 1,
                  minHeight: 44,
                  minWidth: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {showConfirmPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !!error}
            style={{
              width: '100%',
              padding: spacing.xs,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              backgroundColor: (loading || !!error) ? colors.textMuted : colors.primary,
              color: colors.textInverse,
              border: 'none',
              borderRadius: radius.sm,
              cursor: (loading || !!error) ? 'not-allowed' : 'pointer',
              marginBottom: spacing.sm,
              boxShadow: (loading || !!error) ? 'none' : shadows.primary
            }}
          >
            {loading ? t('reset.updating', locale) : t('reset.submit', locale)}
          </button>

          <div style={{ textAlign: 'center' }}>
            <Link
              href={`/${vertical}/login`}
              style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}
            >
              {t('reset.back_to_login', locale)}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
