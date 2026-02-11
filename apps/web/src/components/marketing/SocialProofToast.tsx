'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface ActivityEvent {
  id: string
  event_type: 'purchase' | 'new_vendor' | 'sold_out' | 'new_listing'
  city: string | null
  item_name: string | null
  vendor_display_name: string | null
  item_category: string | null
  created_at: string
}

interface SocialProofToastProps {
  vertical: string
}

const DISMISS_KEY = 'social_proof_dismissed'
const ROTATION_INTERVAL = 8000
const FADE_DURATION = 400
const MIN_EVENTS = 3
const MAX_AGE_HOURS = 24

function formatEventMessage(event: ActivityEvent): string {
  switch (event.event_type) {
    case 'purchase':
      return event.city
        ? `Someone in ${event.city} just bought ${event.item_name || 'something great'}`
        : `Someone just bought ${event.item_name || 'something great'}`
    case 'new_vendor':
      return `${event.vendor_display_name || 'A new vendor'} just joined!`
    case 'sold_out':
      return `${event.item_name || 'An item'} just sold out!`
    case 'new_listing':
      return `${event.vendor_display_name || 'A vendor'} just listed ${event.item_name || 'something new'}`
    default:
      return ''
  }
}

function getEventIcon(eventType: string): string {
  switch (eventType) {
    case 'purchase': return '🛒'
    case 'new_vendor': return '🎉'
    case 'sold_out': return '🔥'
    case 'new_listing': return '✨'
    default: return '📢'
  }
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return 'recently'
}

export default function SocialProofToast({ vertical }: SocialProofToastProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(DISMISS_KEY) === 'true'
    }
    return false
  })
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch events
  useEffect(() => {
    if (dismissed) return

    const fetchEvents = async () => {
      try {
        const res = await fetch(`/api/marketing/activity-feed?vertical=${vertical}&limit=10`)
        if (!res.ok) return
        const data = await res.json()

        // Filter to events within MAX_AGE_HOURS
        const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000
        const recentEvents = (data.events || []).filter(
          (e: ActivityEvent) => new Date(e.created_at).getTime() > cutoff
        )

        if (recentEvents.length >= MIN_EVENTS) {
          setEvents(recentEvents)
        }
      } catch {
        // Non-critical — silently fail
      }
    }

    fetchEvents()
  }, [vertical, dismissed])

  // Show first event after data loads
  useEffect(() => {
    if (events.length > 0 && !dismissed) {
      // Small delay before showing first toast
      const delay = setTimeout(() => setVisible(true), 2000)
      return () => clearTimeout(delay)
    }
  }, [events, dismissed])

  // Rotate events
  const rotateToNext = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % events.length)
      setVisible(true)
    }, FADE_DURATION)
  }, [events.length])

  useEffect(() => {
    if (!visible || isPaused || events.length <= 1) return

    timerRef.current = setTimeout(rotateToNext, ROTATION_INTERVAL)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [visible, isPaused, rotateToNext, events.length])

  const handleDismiss = () => {
    setVisible(false)
    setDismissed(true)
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(DISMISS_KEY, 'true')
    }
  }

  if (dismissed || events.length < MIN_EVENTS) return null

  const currentEvent = events[currentIndex]
  if (!currentEvent) return null

  return (
    <>
      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          maxWidth: 340,
          padding: '12px 16px',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 50,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
          transition: `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`,
          pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          style={{
            position: 'absolute',
            top: 4,
            right: 8,
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            fontSize: 16,
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
          }}
          aria-label="Dismiss"
        >
          x
        </button>

        {/* Event content */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingRight: 16 }}>
          <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.2 }}>
            {getEventIcon(currentEvent.event_type)}
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{
              margin: 0,
              fontSize: 13,
              color: '#374151',
              lineHeight: 1.4,
            }}>
              {formatEventMessage(currentEvent)}
            </p>
            <p style={{
              margin: '4px 0 0',
              fontSize: 11,
              color: '#9ca3af',
            }}>
              {getTimeAgo(currentEvent.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Ensure toast doesn't conflict with existing Toast (bottom-right) */}
      <style>{`
        @media (max-width: 640px) {
          .social-proof-toast-wrapper {
            left: 12px !important;
            right: 12px !important;
            max-width: none !important;
          }
        }
      `}</style>
    </>
  )
}
