'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { defaultBranding, VerticalBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import { Turnstile, useTurnstile } from '@/components/auth/Turnstile'

interface ForgotPasswordPageProps {
  params: Promise<{ vertical: string }>
}

export default function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const { vertical } = use(params)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.farmers_market)
  const supabase = createClient()
  const locale = getClientLocale()
  const { token: turnstileToken, isVerified: captchaVerified, handleVerify, handleError: handleCaptchaError, handleExpire } = useTurnstile()

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

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/${vertical}/reset-password`,
      captchaToken: turnstileToken || undefined,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
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
        {t('forgot.loading', locale)}
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
            {t('forgot.success_title', locale)}
          </h2>
          <p style={{ marginBottom: spacing.md, color: colors.textMuted, fontSize: typography.sizes.base }}>
            {t('forgot.success_sent', locale)} <strong>{email}</strong>
          </p>
          <p style={{ marginBottom: spacing.md, fontSize: typography.sizes.sm, color: colors.textMuted }}>
            {t('forgot.success_expiry', locale)}
          </p>
          <Link
            href={`/${vertical}/login`}
            style={{
              display: 'inline-block',
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: 'transparent',
              color: colors.primary,
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.base,
              border: `2px solid ${colors.primary}`
            }}
          >
            {t('forgot.back_to_login', locale)}
          </Link>
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
          {t('forgot.title', locale)}
        </h2>

        <p style={{ marginBottom: spacing.sm, color: colors.textMuted, fontSize: typography.sizes.sm }}>
          {t('forgot.instructions', locale)}
        </p>
        <p style={{ marginBottom: spacing.md, color: colors.textMuted, fontSize: typography.sizes.xs, fontStyle: 'italic' }}>
          Your password is shared across all 815 Enterprises platforms (Farmers Marketing, Food Truck{"'"}n). Resetting it here updates your password everywhere.
        </p>

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

        <form onSubmit={handleResetRequest}>
          <div style={{ marginBottom: spacing.md }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
              {t('forgot.email_label', locale)}
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
                padding: spacing.xs,
                fontSize: typography.sizes.base,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                boxSizing: 'border-box'
              }}
            />
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
              marginBottom: spacing.sm,
              boxShadow: (loading || (!captchaVerified && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) ? 'none' : shadows.primary
            }}
          >
            {loading ? t('forgot.sending', locale) : t('forgot.submit', locale)}
          </button>

          <div style={{ textAlign: 'center' }}>
            <Link
              href={`/${vertical}/login`}
              style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}
            >
              {t('forgot.back_to_login', locale)}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
