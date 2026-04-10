'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding, VerticalBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface LoginPageProps {
  params: Promise<{ vertical: string }>
}

interface VerticalConfig {
  vertical_name_public?: string
  branding?: VerticalBranding
}

export default function LoginPage({ params }: LoginPageProps) {
  const { vertical } = use(params)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.farmers_market)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEventRef = searchParams.get('ref') === 'event'
  const dashboardSuffix = isEventRef ? '?section=events' : ''
  const supabase = createClient()
  const locale = getClientLocale()

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      // Post-login vertical check: verify user belongs to this vertical
      // If not, redirect to their home vertical instead
      let { data: profile } = await supabase
        .from('user_profiles')
        .select('role, roles, verticals')
        .eq('user_id', data.user.id)
        .single()

      // Lazy profile creation: if no profile exists, create one via RPC
      if (!profile) {
        await supabase.rpc('ensure_user_profile', {
          p_user_id: data.user.id,
          p_email: data.user.email || email,
          p_display_name: '',
        })
        // Re-fetch the newly created profile
        const { data: newProfile } = await supabase
          .from('user_profiles')
          .select('role, roles, verticals')
          .eq('user_id', data.user.id)
          .single()
        profile = newProfile
      }

      const isAdmin = profile?.role === 'admin' ||
        profile?.role === 'platform_admin' ||
        profile?.roles?.includes('admin') ||
        profile?.roles?.includes('platform_admin')

      const userVerticals = (profile?.verticals as string[] | null) || []

      // Auto-add this vertical to user's profile if not already present
      // Enables cross-vertical login: one account, multiple verticals
      if (!isAdmin && !userVerticals.includes(vertical)) {
        const updatedVerticals = [...userVerticals, vertical]
        await supabase
          .from('user_profiles')
          .update({ verticals: updatedVerticals })
          .eq('user_id', data.user.id)
      }

      router.push(`/${vertical}/dashboard${dashboardSuffix}`)
      router.refresh()
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
        {t('login.loading', locale)}
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

      {/* Login Form */}
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
          {t('login.title', locale)}
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

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: spacing.sm }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
              {t('login.email', locale)}
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

          <div style={{ marginBottom: spacing.md }}>
            <label style={{ display: 'block', marginBottom: spacing['3xs'], fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
              {t('login.password', locale)}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                title={showPassword ? t('login.hide_password', locale) : t('login.show_password', locale)}
              >
                {showPassword ? '🙈' : '👁'}
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
            {loading ? t('login.logging_in', locale) : t('login.submit', locale)}
          </button>
        </form>

        <p style={{ marginTop: spacing.md, textAlign: 'center', color: colors.textMuted, fontSize: typography.sizes.base }}>
          {t('login.no_account', locale)}{' '}
          <Link href={`/${vertical}/signup`} style={{ color: colors.primary, fontWeight: typography.weights.semibold }}>
            {t('login.signup_link', locale)}
          </Link>
        </p>

        <p style={{ marginTop: spacing.xs, textAlign: 'center' }}>
          <Link
            href={`/${vertical}/forgot-password`}
            style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}
          >
            {t('login.forgot_password', locale)}
          </Link>
        </p>
      </div>
    </div>
  )
}
