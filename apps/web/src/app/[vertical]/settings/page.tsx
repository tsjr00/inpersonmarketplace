import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import SettingsForm from './SettingsForm'
import ChangePasswordForm from './ChangePasswordForm'
import NotificationPreferences from './NotificationPreferences'
import DeleteAccountSection from './DeleteAccountSection'
import VendorTierManager from './VendorTierManager'
import BuyerTierManager from './BuyerTierManager'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface SettingsPageProps {
  params: Promise<{ vertical: string }>
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Get user profile
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Get vendor profile if exists
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  return (
    <div style={{
      maxWidth: containers.xl,
      margin: '0 auto',
      padding: spacing.md
    }}>
      <h1 style={{
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.primary,
        marginBottom: spacing.md,
        marginTop: 0
      }}>
        Settings
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
          Account Details
        </h2>

        <SettingsForm
          initialDisplayName={userProfile?.display_name || ''}
          initialPhone={userProfile?.phone || ''}
          initialSmsConsent={Boolean((userProfile?.notification_preferences as Record<string, unknown>)?.sms_order_updates)}
          userEmail={user.email || ''}
          primaryColor={branding.colors.primary}
        />

        <div style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>Member Since</p>
              <p style={{ margin: 0, color: colors.textPrimary, fontSize: typography.sizes.base }}>
                {userProfile?.created_at
                  ? new Date(userProfile.created_at).toLocaleDateString()
                  : 'Unknown'}
              </p>
            </div>

            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>Account ID</p>
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
          Membership
        </h2>

        <BuyerTierManager
          vertical={vertical}
          currentTier={userProfile?.buyer_tier || 'free'}
          tierExpiresAt={userProfile?.buyer_tier_expires_at}
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
            Vendor Account
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>Vendor ID</p>
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
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>Status</p>
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
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>Tier</p>
              <span style={{
                display: 'inline-block',
                padding: `${spacing['3xs']} ${spacing.xs}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                textTransform: 'capitalize',
                backgroundColor:
                  vendorProfile.tier === 'premium' ? colors.surfaceSubtle :
                  vendorProfile.tier === 'featured' ? colors.primaryLight : colors.surfaceMuted,
                color:
                  vendorProfile.tier === 'premium' ? colors.accent :
                  vendorProfile.tier === 'featured' ? colors.primaryDark : colors.textSecondary
              }}>
                {vendorProfile.tier || 'standard'}
              </span>
            </div>

            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0` }}>Last Updated</p>
              <p style={{ margin: 0, color: colors.textPrimary, fontSize: typography.sizes.base }}>
                {new Date(vendorProfile.updated_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Tier Management */}
          <VendorTierManager
            vertical={vertical}
            vendorId={vendorProfile.id}
            currentTier={vendorProfile.tier || 'standard'}
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
          Change Password
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
          Notification Preferences
        </h2>

        <NotificationPreferences
          primaryColor={branding.colors.primary}
          smsEnabled={Boolean(userProfile?.phone && (userProfile?.notification_preferences as Record<string, unknown>)?.sms_order_updates)}
        />
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
          Delete Account
        </h2>

        <DeleteAccountSection vertical={vertical} userEmail={user.email || ''} />
      </div>
    </div>
  )
}
