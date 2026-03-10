'use client'

import Link from 'next/link'
import { spacing, typography, radius } from '@/lib/design-tokens'

interface TrialStatusBannerProps {
  vertical: string
  subscriptionStatus: string | null
  trialEndsAt: string | null
  trialGraceEndsAt: string | null
}

export default function TrialStatusBanner({
  vertical,
  subscriptionStatus,
  trialEndsAt,
  trialGraceEndsAt,
}: TrialStatusBannerProps) {
  const now = new Date()

  // Active trial: subscription_status = 'trialing' and trial hasn't ended
  const isTrialing = subscriptionStatus === 'trialing' && trialEndsAt && new Date(trialEndsAt) > now

  // Grace period: trial ended (tier dropped to free) but grace hasn't expired yet
  const isGracePeriod = !isTrialing && trialGraceEndsAt && new Date(trialGraceEndsAt) > now

  if (!isTrialing && !isGracePeriod) return null

  const targetDate = isTrialing ? new Date(trialEndsAt!) : new Date(trialGraceEndsAt!)
  const daysRemaining = Math.max(0, Math.ceil((targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))

  const bgColor = isGracePeriod ? '#fef3c7' : '#eff6ff'
  const borderColor = isGracePeriod ? '#f59e0b' : '#93c5fd'
  const textColor = isGracePeriod ? '#92400e' : '#1e40af'
  const icon = isGracePeriod ? '⚠️' : '🎉'

  return (
    <div style={{
      padding: '12px 16px',
      backgroundColor: bgColor,
      border: `2px solid ${borderColor}`,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
    }}>
      <p style={{
        margin: 0,
        fontSize: typography.sizes.sm,
        fontWeight: 600,
        color: textColor,
      }}>
        {icon}{' '}
        {isTrialing
          ? `Free Basic Trial — ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`
          : `Trial Ended — ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} to upgrade`
        }
      </p>
      <p style={{
        margin: '4px 0 0 0',
        fontSize: typography.sizes.xs,
        color: textColor,
        opacity: 0.85,
      }}>
        {isTrialing
          ? 'You have full access to Basic tier features during your trial. Upgrade anytime to keep them after your trial ends.'
          : 'Your free trial has ended. Upgrade to Basic to keep all your menu items, locations, and Chef Boxes. Items beyond Free tier limits will be paused after the grace period.'
        }
      </p>
      <Link
        href={`/${vertical}/vendor/dashboard/upgrade`}
        style={{
          display: 'inline-block',
          marginTop: 8,
          padding: '6px 16px',
          fontSize: typography.sizes.xs,
          fontWeight: 600,
          color: 'white',
          backgroundColor: isGracePeriod ? '#f59e0b' : '#3b82f6',
          borderRadius: radius.md,
          textDecoration: 'none',
        }}
      >
        Upgrade to Basic — $10/mo
      </Link>
    </div>
  )
}
