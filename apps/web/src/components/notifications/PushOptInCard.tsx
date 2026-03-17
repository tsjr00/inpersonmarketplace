'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface PushOptInCardProps {
  vertical: string
  /** Compact mode shows a smaller nudge (e.g., on order detail page) */
  compact?: boolean
}

export default function PushOptInCard({ vertical, compact = false }: PushOptInCardProps) {
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<string>('default')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true)
      setPushPermission(Notification.permission)
    }
  }, [])

  // Don't show if: push not supported, already granted, already denied, or dismissed
  if (!pushSupported || pushPermission === 'granted' || pushPermission === 'denied' || dismissed || done) {
    return null
  }

  const handleEnable = async () => {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
      if (permission !== 'granted') {
        setLoading(false)
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })

      const sub = subscription.toJSON()
      await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: sub.keys,
        }),
      })

      setDone(true)
    } catch {
      // Permission denied or subscription failed — hide the card
      setDismissed(true)
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <div style={{
        padding: spacing.xs,
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: radius.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.xs,
      }}>
        <span style={{ fontSize: typography.sizes.xs, color: '#1e40af' }}>
          🔔 Get instant alerts when your order is ready
        </span>
        <button
          onClick={handleEnable}
          disabled={loading}
          style={{
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            cursor: loading ? 'wait' : 'pointer',
            whiteSpace: 'nowrap' as const,
          }}
        >
          {loading ? 'Enabling...' : 'Enable'}
        </button>
      </div>
    )
  }

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: '#eff6ff',
      border: '1px solid #bfdbfe',
      borderRadius: radius.md,
      marginBottom: spacing.sm,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.xs,
        marginBottom: spacing.xs,
      }}>
        <span style={{ fontSize: typography.sizes.lg }}>🔔</span>
        <div>
          <h3 style={{
            margin: 0,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            color: '#1e40af',
          }}>
            Want to know when your order is ready?
          </h3>
          <p style={{
            margin: `${spacing['2xs']} 0 0 0`,
            fontSize: typography.sizes.sm,
            color: '#1e40af',
            lineHeight: typography.leading.relaxed,
          }}>
            Enable push notifications to get instant alerts — even when the app is closed.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
        <button
          onClick={handleEnable}
          disabled={loading}
          style={{
            padding: `${spacing['2xs']} ${spacing.md}`,
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Enabling...' : 'Enable Push Notifications'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: 'transparent',
            color: '#6b7280',
            border: 'none',
            fontSize: typography.sizes.sm,
            cursor: 'pointer',
          }}
        >
          Not now
        </button>
      </div>

      <p style={{
        margin: `${spacing.xs} 0 0 0`,
        fontSize: typography.sizes.xs,
        color: '#6b7280',
        fontStyle: 'italic',
      }}>
        If you choose not to enable push notifications, check your email or open the app to see order status updates.
      </p>
    </div>
  )
}
