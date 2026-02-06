'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
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

interface NotificationBellProps {
  primaryColor?: string
  vertical: string
}

export function NotificationBell({ primaryColor = colors.primary, vertical }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()

  // Fetch unread count
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/count')
      if (res.ok) {
        const { count } = await res.json()
        setUnreadCount(count)
      }
    } catch {
      // Silently fail - count badge is non-critical
    }
  }, [])

  // Fetch recent notifications for dropdown
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=8')
      if (res.ok) {
        const { notifications: items } = await res.json()
        setNotifications(items)
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Refresh count on every page navigation (pathname change)
  useEffect(() => {
    fetchCount()
  }, [pathname, fetchCount])

  // Refresh count when user returns to the tab
  useEffect(() => {
    function handleVisibilityChange() {
      if (!document.hidden) {
        fetchCount()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchCount])

  // When dropdown opens, fetch latest notifications
  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen, fetchNotifications])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Mark single notification as read and navigate
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read_at) {
      await fetch(`/api/notifications/${notification.id}/read`, { method: 'PATCH' })
      setUnreadCount((prev) => Math.max(0, prev - 1))
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n))
      )
    }

    // Navigate to the action URL if the type has one
    const config = getNotificationConfig(notification.type)
    if (config) {
      const actionUrl = config.actionUrl({
        ...(notification.data as Record<string, string> | null),
        vertical,
      })
      router.push(actionUrl)
    }

    setIsOpen(false)
  }

  // Mark all as read
  const handleMarkAllRead = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setUnreadCount(0)
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    )
  }

  // Format relative time
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

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          padding: '8px',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 44,
          minWidth: 44,
          color: primaryColor,
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        {/* Bell SVG */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            backgroundColor: '#dc3545',
            color: 'white',
            borderRadius: 9,
            fontSize: 11,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          marginTop: spacing['2xs'],
          width: 340,
          maxHeight: 440,
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          boxShadow: shadows.lg,
          border: `1px solid ${colors.border}`,
          overflow: 'hidden',
          zIndex: 100,
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: `${spacing.xs} ${spacing.sm}`,
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <span style={{
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.sm,
              color: colors.textPrimary,
            }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: primaryColor,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.medium,
                  padding: `${spacing['3xs']} ${spacing['2xs']}`,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div style={{ overflowY: 'auto', maxHeight: 360 }}>
            {isLoading ? (
              <div style={{
                padding: spacing.lg,
                textAlign: 'center',
                color: colors.textMuted,
                fontSize: typography.sizes.sm,
              }}>
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{
                padding: spacing.lg,
                textAlign: 'center',
                color: colors.textMuted,
                fontSize: typography.sizes.sm,
              }}>
                No notifications yet
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: `${spacing.xs} ${spacing.sm}`,
                    textAlign: 'left',
                    background: notification.read_at ? 'transparent' : colors.primaryLight,
                    border: 'none',
                    borderBottom: `1px solid ${colors.borderMuted}`,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = notification.read_at
                      ? colors.surfaceMuted
                      : colors.primaryLight
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = notification.read_at
                      ? 'transparent'
                      : colors.primaryLight
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: spacing['2xs'],
                  }}>
                    <span style={{
                      fontWeight: notification.read_at
                        ? typography.weights.normal
                        : typography.weights.semibold,
                      fontSize: typography.sizes.sm,
                      color: colors.textPrimary,
                      lineHeight: 1.3,
                    }}>
                      {notification.title}
                    </span>
                    {!notification.read_at && (
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: primaryColor,
                        flexShrink: 0,
                        marginTop: 4,
                      }} />
                    )}
                  </div>
                  {notification.message && (
                    <p style={{
                      margin: `${spacing['3xs']} 0 0`,
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {notification.message}
                    </p>
                  )}
                  <span style={{
                    display: 'block',
                    marginTop: spacing['3xs'],
                    fontSize: '11px',
                    color: colors.textMuted,
                  }}>
                    {formatTimeAgo(notification.created_at)}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{
              padding: `${spacing['2xs']} ${spacing.sm}`,
              borderTop: `1px solid ${colors.border}`,
              textAlign: 'center',
            }}>
              <button
                onClick={() => {
                  router.push(`/${vertical}/notifications`)
                  setIsOpen(false)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: primaryColor,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.medium,
                  padding: spacing['3xs'],
                }}
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
