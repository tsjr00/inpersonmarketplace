import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import { getLocale } from '@/lib/locale/server'
import { t } from '@/lib/locale/messages'
import SettingsForm from './SettingsForm'
import ChangePasswordForm from './ChangePasswordForm'
import NotificationPreferences from './NotificationPreferences'
import DeleteAccountSection from './DeleteAccountSection'
import VendorTierManager from './VendorTierManager'
import BuyerTierManager from './BuyerTierManager'
import LanguageSelector from '@/components/shared/LanguageSelector'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface SettingsPageProps {
  params: Promise<{ vertical: string }>
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth + vertical membership
  await enforceVerticalAccess(vertical)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding + locale
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const locale = await getLocale()

  // Get user profile + vendor profile in parallel
  const [{ data: userProfile }, { data: vendorProfile }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('display_name, created_at, buyer_tier, tier_expires_at, stripe_subscription_id, phone, notification_preferences')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('vendor_profiles')
      .select('id, status, tier, updated_at, stripe_subscription_id')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single(),
  ])

  return (
    <div style={{
      maxWidth: containers.xl,
      margin: '0 auto',
      padding: spacing.md
    }}>
      <Link
        href={`/${vertical}/dashboard`}
        style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}
      >
        {t('settings.back', locale)}
      </Link>
      <h1 style={{
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.primary,
        marginBottom: spacing.md,
        marginTop: spacing.xs
      }}>
        {t('settings.title', locale)}
      </h1>

      {/* Account Details */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.md,
        border: `1px solid ${colors.border}`,
        padding: spacing.md,
        marginBottom: spacing.md
      }}>
        <h2 style={{
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
          marginTop: 0,
          marginBottom: spacing.md
        }}>
          {t('settings.account_details', locale)}
        </h2>

        <SettingsForm
          initialDisplayName={userProfile?.display_name || ''}
          userEmail={user.email || ''}
          primaryColor={branding.colors.primary}
          locale={locale}
        />

        <div style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>{t('settings.member_since', locale)}</p>
              <p style={{ margin: 0, color: colors.textPrimary, fontSize: typography.sizes.base }}>
                {userProfile?.created_at
                  ? new Date(userProfile.created_at).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US')
                  : t('settings.unknown', locale)}
              </p>
            </div>

            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>{t('settings.account_id', locale)}</p>
              <p style={{
                margin: 0,
                color: colors.textMuted,
                fontSize: typography.sizes.xs,
                fontFamily: 'monospace'
              }}>
                {user.id}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Buyer Membership */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.md,
        border: `1px solid ${colors.border}`,
        padding: spacing.md,
        marginBottom: spacing.md
      }}>
        <h2 style={{
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
          marginTop: 0,
          marginBottom: spacing.md
        }}>
          {t('settings.membership', locale)}
        </h2>

        <BuyerTierManager
          vertical={vertical}
          currentTier={userProfile?.buyer_tier || 'free'}
          tierExpiresAt={userProfile?.tier_expires_at}
          stripeSubscriptionId={userProfile?.stripe_subscription_id}
          primaryColor={branding.colors.primary}
        />
      </div>

      {/* Vendor Account Details (if vendor) */}
      {vendorProfile && (
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          padding: spacing.md,
          marginBottom: spacing.md
        }}>
          <h2 style={{
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
            marginTop: 0,
            marginBottom: spacing.md
          }}>
            {t('settings.vendor_account', locale)}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>{t('settings.vendor_id', locale)}</p>
              <p style={{
                margin: 0,
                color: colors.textMuted,
                fontSize: typography.sizes.xs,
                fontFamily: 'monospace'
              }}>
                {vendorProfile.id}
              </p>
            </div>

            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>{t('settings.status', locale)}</p>
              <span style={{
                display: 'inline-block',
                padding: `${spacing['3xs']} ${spacing.xs}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                backgroundColor: vendorProfile.status === 'approved' ? colors.primaryLight : colors.surfaceSubtle,
                color: vendorProfile.status === 'approved' ? colors.primaryDark : colors.accent
              }}>
                {vendorProfile.status.charAt(0).toUpperCase() + vendorProfile.status.slice(1)}
              </span>
            </div>

            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>{t('settings.tier', locale)}</p>
              {(() => {
                const tierValue = vendorProfile.tier || (vertical === 'food_trucks' ? 'free' : 'standard')
                const isFT = vertical === 'food_trucks'
                const tierBg = isFT
                  ? (tierValue === 'boss' ? '#fffbeb' : tierValue === 'pro' ? '#fff5f5' : tierValue === 'basic' ? '#f9fafb' : colors.surfaceMuted)
                  : (tierValue === 'premium' ? colors.surfaceSubtle : tierValue === 'featured' ? colors.primaryLight : colors.surfaceMuted)
                const tierColor = isFT
                  ? (tierValue === 'boss' ? '#545454' : tierValue === 'pro' ? '#ff3131' : tierValue === 'basic' ? '#737373' : colors.textSecondary)
                  : (tierValue === 'premium' ? colors.accent : tierValue === 'featured' ? colors.primaryDark : colors.textSecondary)
                return (
                  <span style={{
                    display: 'inline-block',
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.sm,
                    textTransform: 'capitalize',
                    backgroundColor: tierBg,
                    color: tierColor
                  }}>
                    {tierValue}
                  </span>
                )
              })()}
            </div>

            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>{t('settings.last_updated', locale)}</p>
              <p style={{ margin: 0, color: colors.textPrimary, fontSize: typography.sizes.base }}>
                {new Date(vendorProfile.updated_at).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US')}
              </p>
            </div>
          </div>

          {/* Tier Management */}
          <VendorTierManager
            vertical={vertical}
            vendorId={vendorProfile.id}
            currentTier={vendorProfile.tier || 'free'}
            stripeSubscriptionId={vendorProfile.stripe_subscription_id}
            primaryColor={branding.colors.primary}
          />
        </div>
      )}

      {/* Change Password */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.md,
        border: `1px solid ${colors.border}`,
        padding: spacing.md,
        marginBottom: spacing.md
      }}>
        <h2 style={{
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
          marginTop: 0,
          marginBottom: spacing.md
        }}>
          {t('settings.change_password', locale)}
        </h2>

        <ChangePasswordForm primaryColor={branding.colors.primary} />
      </div>

      {/* Notification Preferences */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.md,
        border: `1px solid ${colors.border}`,
        padding: spacing.md,
        marginBottom: spacing.md
      }}>
        <h2 style={{
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
          marginTop: 0,
          marginBottom: spacing.md
        }}>
          {t('settings.notification_prefs', locale)}
        </h2>

        <NotificationPreferences
          primaryColor={branding.colors.primary}
          initialPhone={userProfile?.phone || ''}
          initialSmsConsent={Boolean((userProfile?.notification_preferences as Record<string, unknown>)?.sms_order_updates)}
        />
      </div>

      {/* Language Preference */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.md,
        border: `1px solid ${colors.border}`,
        padding: spacing.md,
        marginBottom: spacing.md
      }}>
        <h2 style={{
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
          marginTop: 0,
          marginBottom: spacing.sm
        }}>
          {t('settings.language', locale)}
        </h2>
        <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing.sm} 0` }}>
          {t('settings.language_desc', locale)}
        </p>
        <LanguageSelector locale={locale} variant="full" />
      </div>

      {/* Delete Account */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.md,
        border: `1px solid #fecaca`,
        padding: spacing.md
      }}>
        <h2 style={{
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: '#dc2626',
          marginTop: 0,
          marginBottom: spacing.md
        }}>
          {t('settings.delete_account', locale)}
        </h2>

        <DeleteAccountSection vertical={vertical} userEmail={user.email || ''} />
      </div>
    </div>
  )
}
