'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { getNotificationConfig, type NotificationSeverity, type NotificationUrgency } from '@/lib/notifications/types'
import { POLLING_INTERVALS, getPollingInterval } from '@/lib/polling-config'

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

// ── Web Audio API tone generator ────────────────────────────────────
// Different frequencies per urgency for distinct tones
const URGENCY_TONES: Record<NotificationUrgency, { freq: number; duration: number; gain: number }> = {
  immediate: { freq: 880, duration: 0.3, gain: 0.4 },   // A5 — sharp, attention-grabbing
  urgent:    { freq: 660, duration: 0.25, gain: 0.35 },  // E5 — moderately sharp
  standard:  { freq: 523, duration: 0.2, gain: 0.3 },    // C5 — neutral chime
  info:      { freq: 440, duration: 0.15, gain: 0.2 },   // A4 — soft, subtle
}

const VIBRATE_PATTERN = [200, 100, 200]

function playNotificationTone(urgency: NotificationUrgency): void {
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const tone = URGENCY_TONES[urgency] || URGENCY_TONES.standard

    // Main tone
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = tone.freq
    gainNode.gain.setValueAtTime(tone.gain, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + tone.duration)
    osc.connect(gainNode)
    gainNode.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + tone.duration)

    // Cleanup
    osc.onended = () => ctx.close()
  } catch {
    // Silently fail — audio not critical
  }
}

function vibrateDevice(): void {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(VIBRATE_PATTERN)
    }
  } catch {
    // Vibration API not available
  }
}

function getNotificationSeverity(type: string): NotificationSeverity {
  const config = getNotificationConfig(type)
  return config?.severity || 'info'
}

export function NotificationBell({ primaryColor = colors.primary, vertical }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [highestUnreadSeverity, setHighestUnreadSeverity] = useState<NotificationSeverity>('info')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const prevUnreadCountRef = useRef<number>(0)
  const hasInteractedRef = useRef(false)
  const router = useRouter()
  const pathname = usePathname()

  // Fetch user sound preference on mount
  useEffect(() => {
    async function loadSoundPref() {
      try {
        const res = await fetch('/api/user/notifications')
        if (res.ok) {
          const { preferences } = await res.json()
          if (preferences && typeof preferences.sound_enabled === 'boolean') {
            setSoundEnabled(preferences.sound_enabled)
          }
        }
      } catch {
        // Default to sound on
      }
    }
    loadSoundPref()
  }, [])

  // Track user interaction (required for Web Audio API autoplay policy)
  useEffect(() => {
    function markInteracted() { hasInteractedRef.current = true }
    document.addEventListener('click', markInteracted, { once: true })
    document.addEventListener('keydown', markInteracted, { once: true })
    return () => {
      document.removeEventListener('click', markInteracted)
      document.removeEventListener('keydown', markInteracted)
    }
  }, [])

  // Fetch unread count + check for critical severity + trigger sound/vibrate
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=10&unread_only=true')
      if (res.ok) {
        const { notifications: unread, pagination } = await res.json()
        const newCount = pagination?.total ?? unread?.length ?? 0
        setUnreadCount(newCount)

        // Determine highest severity/urgency among unread notifications
        let highest: NotificationSeverity = 'info'
        let highestUrgency: NotificationUrgency = 'info'
        for (const n of (unread || []) as Notification[]) {
          const sev = getNotificationSeverity(n.type)
          if (sev === 'critical') { highest = 'critical' }
          else if (sev === 'warning' && highest !== 'critical') { highest = 'warning' }

          const config = getNotificationConfig(n.type)
          if (config) {
            const u = config.urgency
            if (u === 'immediate') highestUrgency = 'immediate'
            else if (u === 'urgent' && highestUrgency !== 'immediate') highestUrgency = 'urgent'
            else if (u === 'standard' && highestUrgency === 'info') highestUrgency = 'standard'
          }
        }
        setHighestUnreadSeverity(highest)

        // Play sound + vibrate when NEW notifications arrive on active tab
        if (
          newCount > prevUnreadCountRef.current &&
          prevUnreadCountRef.current >= 0 &&
          document.visibilityState === 'visible' &&
          hasInteractedRef.current
        ) {
          if (soundEnabled) {
            playNotificationTone(highestUrgency)
          }
          vibrateDevice()
        }
        prevUnreadCountRef.current = newCount
      }
    } catch {
      // Silently fail - count badge is non-critical
    }
  }, [soundEnabled])

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

  // Polling interval for count — 5min active, 15min off-peak (10pm-6am)
  // Tab focus + page navigation give instant updates; this is a background safety net
  useEffect(() => {
    const pollMs = getPollingInterval(
      POLLING_INTERVALS.notificationCount,
      POLLING_INTERVALS.notificationCountOffPeak
    )
    const interval = setInterval(fetchCount, pollMs)
    return () => clearInterval(interval)
  }, [fetchCount])

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
    setHighestUnreadSeverity('info')
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

  // Badge color: RED for critical, YELLOW for warning, GREEN for info-only
  const BADGE_COLORS: Record<NotificationSeverity, { bg: string; text: string }> = {
    critical: { bg: '#dc2626', text: 'white' },
    warning: { bg: '#f59e0b', text: '#78350f' },
    info: { bg: '#16a34a', text: 'white' },
  }
  const badge = BADGE_COLORS[highestUnreadSeverity]

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
            backgroundColor: badge.bg,
            color: badge.text,
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
              notifications.map((notification) => {
                const severity = getNotificationSeverity(notification.type)
                const severityColors: Record<NotificationSeverity, string> = {
                  critical: '#dc2626',
                  warning: '#f59e0b',
                  info: primaryColor,
                }
                return (
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
                      borderLeft: severity !== 'info' ? `3px solid ${severityColors[severity]}` : 'none',
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
                          backgroundColor: severityColors[severity],
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
                )
              })
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
