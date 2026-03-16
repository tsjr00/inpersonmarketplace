'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getNotificationConfig, type NotificationSeverity } from '@/lib/notifications/types'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface Notification {
  id: string
  type: string
  title: string
  message: string | null
  data: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  critical: '#dc2626',
  warning: '#f59e0b',
  info: 'transparent',
}

function getNotificationSeverity(type: string): NotificationSeverity {
  const config = getNotificationConfig(type)
  return config?.severity || 'info'
}

function formatDate(dateStr: string, locale?: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return t('notif_page.today', locale)
  if (date.toDateString() === yesterday.toDateString()) return t('notif_page.yesterday', locale)

  return date.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(dateStr: string, locale?: string): string {
  return new Date(dateStr).toLocaleTimeString(locale === 'es' ? 'es-ES' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function NotificationsPage() {
  const params = useParams()
  const router = useRouter()
  const locale = getClientLocale()
  const vertical = params.vertical as string

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [markingAllRead] = useState(false)

  const fetchNotifications = useCallback(async (page = 1, append = false) => {
    if (page === 1) setLoading(true)
    else setLoadingMore(true)

    try {
      const res = await fetch(`/api/notifications?page=${page}&limit=20&vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        if (append) {
          setNotifications(prev => [...prev, ...(data.notifications || [])])
        } else {
          setNotifications(data.notifications || [])
        }
        setPagination(data.pagination)
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read (don't await — navigate immediately for responsiveness)
    if (!notification.read_at) {
      fetch(`/api/notifications/${notification.id}/read`, { method: 'PATCH' })
      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)
      )
    }

    // Navigate to the action URL
    const config = getNotificationConfig(notification.type)
    const actionUrl = config
      ? config.actionUrl({
          ...(notification.data as Record<string, string> | null),
          vertical,
        })
      : `/${vertical}/dashboard`
    router.push(actionUrl)
  }

  const handleMarkAllRead = () => {
    // Optimistically mark all as read immediately
    setNotifications(prev =>
      prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    )
    // Fire API in background — no need to await
    fetch(`/api/notifications/read-all?vertical=${vertical}`, { method: 'POST' })
  }

  const handleLoadMore = () => {
    if (pagination && pagination.page < pagination.totalPages) {
      fetchNotifications(pagination.page + 1, true)
    }
  }

  const unreadCount = notifications.filter(n => !n.read_at).length

  // Group notifications by date
  const grouped = notifications.reduce((acc, notification) => {
    const dateKey = formatDate(notification.created_at, locale)
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(notification)
    return acc
  }, {} as Record<string, Notification[]>)

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: `${spacing.xl} ${spacing.md}`,
    }}>
      <div style={{ maxWidth: containers.md, margin: '0 auto' }}>
        {/* Back link */}
        <Link
          href={`/${vertical}/dashboard`}
          style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}
        >
          {t('notif_page.back', locale)}
        </Link>

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: spacing.sm,
          marginBottom: spacing.md,
        }}>
          <h1 style={{
            margin: 0,
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
          }}>
            {t('notif_page.title', locale)}
          </h1>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAllRead}
              style={{
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: 'transparent',
                color: colors.primary,
                border: `1px solid ${colors.primary}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                cursor: markingAllRead ? 'not-allowed' : 'pointer',
                opacity: markingAllRead ? 0.6 : 1,
              }}
            >
              {markingAllRead ? t('notif_page.marking', locale) : t('notif_page.mark_all', locale, { count: String(unreadCount) })}
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{
            padding: spacing['3xl'],
            textAlign: 'center',
            color: colors.textMuted,
            fontSize: typography.sizes.base,
          }}>
            {t('notif_page.loading', locale)}
          </div>
        )}

        {/* Empty state */}
        {!loading && notifications.length === 0 && (
          <div style={{
            padding: spacing['3xl'],
            textAlign: 'center',
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
          }}>
            <p style={{ fontSize: typography.sizes['2xl'], margin: `0 0 ${spacing.xs}` }}>🔔</p>
            <h3 style={{ margin: `0 0 ${spacing['2xs']}`, color: colors.textSecondary }}>
              {t('notif_page.empty_title', locale)}
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              {t('notif_page.empty_desc', locale)}
            </p>
          </div>
        )}

        {/* Notification list grouped by date */}
        {!loading && Object.entries(grouped).map(([dateLabel, items]) => (
          <div key={dateLabel} style={{ marginBottom: spacing.md }}>
            {/* Date header */}
            <h2 style={{
              margin: `0 0 ${spacing.xs}`,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              {dateLabel}
            </h2>

            {/* Notifications for this date */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              overflow: 'hidden',
              boxShadow: shadows.sm,
            }}>
              {items.map((notification, idx) => {
                const severity = getNotificationSeverity(notification.type)
                const borderColor = SEVERITY_COLORS[severity]
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: spacing.xs,
                      padding: `${spacing.xs} ${spacing.sm}`,
                      backgroundColor: notification.read_at ? 'transparent' : colors.primaryLight,
                      border: 'none',
                      borderBottom: idx < items.length - 1 ? `1px solid ${colors.borderMuted}` : 'none',
                      borderLeft: severity !== 'info' ? `3px solid ${borderColor}` : 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
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
                    {/* Unread/severity dot */}
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: !notification.read_at
                        ? (severity === 'critical' ? '#dc2626' : severity === 'warning' ? '#f59e0b' : colors.primary)
                        : 'transparent',
                      flexShrink: 0,
                      marginTop: 5,
                    }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: spacing.xs,
                      }}>
                        <span style={{
                          fontWeight: notification.read_at
                            ? typography.weights.normal
                            : typography.weights.semibold,
                          fontSize: typography.sizes.base,
                          color: colors.textPrimary,
                        }}>
                          {notification.title}
                        </span>
                        <span style={{
                          fontSize: typography.sizes.xs,
                          color: colors.textMuted,
                          flexShrink: 0,
                        }}>
                          {formatTime(notification.created_at, locale)}
                        </span>
                      </div>
                      {notification.message && (
                        <p style={{
                          margin: `${spacing['3xs']} 0 0`,
                          fontSize: typography.sizes.sm,
                          color: colors.textSecondary,
                          lineHeight: 1.5,
                        }}>
                          {notification.message}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Load More */}
        {pagination && pagination.page < pagination.totalPages && (
          <div style={{ textAlign: 'center', marginTop: spacing.md }}>
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                padding: `${spacing.xs} ${spacing.lg}`,
                backgroundColor: 'transparent',
                color: colors.primary,
                border: `1px solid ${colors.primary}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                cursor: loadingMore ? 'not-allowed' : 'pointer',
                opacity: loadingMore ? 0.6 : 1,
              }}
            >
              {loadingMore ? t('notif_page.loading_more', locale) : t('notif_page.load_more', locale)}
            </button>
            <p style={{
              margin: `${spacing['2xs']} 0 0`,
              fontSize: typography.sizes.xs,
              color: colors.textMuted,
            }}>
              {t('notif_page.showing', locale, { count: String(notifications.length), total: String(pagination.total) })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
