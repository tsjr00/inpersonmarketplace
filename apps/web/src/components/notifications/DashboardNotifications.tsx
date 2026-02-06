'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { getNotificationConfig } from '@/lib/notifications/types'

interface Notification {
  id: string
  type: string
  title: string
  message: string | null
  data: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

interface DashboardNotificationsProps {
  vertical: string
  /** Max notifications to show in the card */
  limit?: number
}

export function DashboardNotifications({ vertical, limit = 5 }: DashboardNotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const fetchNotifications = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        fetch(`/api/notifications?limit=${limit}`),
        fetch('/api/notifications/count'),
      ])

      if (listRes.ok) {
        const { notifications: items } = await listRes.json()
        setNotifications(items)
      }
      if (countRes.ok) {
        const { count } = await countRes.json()
        setUnreadCount(count)
      }
    } catch {
      // Non-critical UI — fail silently
    } finally {
      setIsLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read_at) {
      await fetch(`/api/notifications/${notification.id}/read`, { method: 'PATCH' })
      setUnreadCount((prev) => Math.max(0, prev - 1))
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n))
      )
    }

    // Navigate
    const config = getNotificationConfig(notification.type)
    if (config) {
      const actionUrl = config.actionUrl({
        ...(notification.data as Record<string, string> | null),
        vertical,
      })
      router.push(actionUrl)
    }
  }

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setUnreadCount(0)
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    )
  }

  const formatTimeAgo = (dateStr: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString()
  }

  // Don't render anything while loading to avoid layout shift
  if (isLoading) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        boxShadow: shadows.sm,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing['2xs'],
        }}>
          <span style={{ fontSize: typography.sizes['2xl'] }}>🔔</span>
          <h3 style={{
            margin: 0,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
          }}>
            Notifications
          </h3>
        </div>
        <p style={{
          margin: `${spacing.xs} 0 0`,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
        }}>
          Loading...
        </p>
      </div>
    )
  }

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: unreadCount > 0 ? '#eff6ff' : colors.surfaceElevated,
      border: unreadCount > 0 ? '2px solid #3b82f6' : `1px solid ${colors.border}`,
      borderRadius: radius.md,
      boxShadow: unreadCount > 0 ? '0 0 0 3px rgba(59, 130, 246, 0.15)' : shadows.sm,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: notifications.length > 0 ? spacing.xs : 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing['2xs'],
        }}>
          <span style={{ fontSize: typography.sizes['2xl'] }}>🔔</span>
          <h3 style={{
            margin: 0,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
          }}>
            Notifications
          </h3>
          {unreadCount > 0 && (
            <span style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: `2px ${spacing['2xs']}`,
              borderRadius: radius.full,
              fontSize: '12px',
              fontWeight: typography.weights.bold,
              minWidth: 22,
              textAlign: 'center',
            }}>
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#3b82f6',
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.medium,
              padding: spacing['3xs'],
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Empty state */}
      {notifications.length === 0 && (
        <p style={{
          margin: `${spacing.xs} 0 0`,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
        }}>
          No notifications yet. You'll see order updates, alerts, and more here.
        </p>
      )}

      {/* Notification list */}
      {notifications.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          backgroundColor: colors.border,
          borderRadius: radius.sm,
          overflow: 'hidden',
        }}>
          {notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing['2xs'],
                padding: `${spacing['2xs']} ${spacing.xs}`,
                backgroundColor: notification.read_at ? colors.surfaceElevated : '#f0f7ff',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              {/* Unread dot */}
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: notification.read_at ? 'transparent' : '#3b82f6',
                flexShrink: 0,
                marginTop: 5,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: spacing['2xs'],
                }}>
                  <span style={{
                    fontWeight: notification.read_at
                      ? typography.weights.normal
                      : typography.weights.semibold,
                    fontSize: typography.sizes.sm,
                    color: colors.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {notification.title}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: colors.textMuted,
                    flexShrink: 0,
                  }}>
                    {formatTimeAgo(notification.created_at)}
                  </span>
                </div>
                {notification.message && (
                  <p style={{
                    margin: `2px 0 0`,
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {notification.message}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Footer link */}
      {notifications.length > 0 && (
        <button
          onClick={() => router.push(`/${vertical}/notifications`)}
          style={{
            display: 'block',
            width: '100%',
            marginTop: spacing.xs,
            padding: spacing['3xs'],
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#3b82f6',
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.medium,
            textAlign: 'center',
          }}
        >
          View all notifications →
        </button>
      )}
    </div>
  )
}
