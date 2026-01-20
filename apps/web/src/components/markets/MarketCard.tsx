'use client'

import Link from 'next/link'
import ScheduleDisplay from './ScheduleDisplay'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface Schedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

interface MarketCardProps {
  market: {
    id: string
    name: string
    market_type: 'traditional' | 'private_pickup'
    description?: string
    address?: string
    city?: string
    state?: string
    zip?: string
    active: boolean
    schedule_count?: number
    vendor_count?: number
    schedules?: Schedule[]
    distance_miles?: number
  }
  vertical: string
}

// Calculate next market date from schedules
function getNextMarketDate(schedules: Schedule[] | undefined): { date: Date; time: string } | null {
  if (!schedules || schedules.length === 0) return null

  const now = new Date()
  const currentDay = now.getDay()

  let nearestResult: { date: Date; time: string } | null = null

  for (const schedule of schedules) {
    if (!schedule.active) continue

    const scheduleDay = schedule.day_of_week
    let daysUntil = scheduleDay - currentDay
    if (daysUntil < 0) daysUntil += 7
    if (daysUntil === 0) {
      // Check if today's market time has passed
      const [hours, minutes] = (schedule.start_time || '00:00').split(':').map(Number)
      const marketTime = new Date(now)
      marketTime.setHours(hours, minutes, 0, 0)
      if (now > marketTime) daysUntil = 7
    }

    const nextDate = new Date(now)
    nextDate.setDate(now.getDate() + daysUntil)

    if (!nearestResult || nextDate < nearestResult.date) {
      nearestResult = {
        date: nextDate,
        time: schedule.start_time
      }
    }
  }

  return nearestResult
}

// Format time from 24h to 12h
function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 || 12
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
}

export default function MarketCard({ market, vertical }: MarketCardProps) {
  const locationParts = [market.city, market.state].filter(Boolean)
  const location = locationParts.join(', ')

  const nextMarket = getNextMarketDate(market.schedules)

  return (
    <Link
      href={`/${vertical}/markets/${market.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}
    >
      <div
        style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm,
          padding: spacing.md,
          transition: 'box-shadow 0.2s, transform 0.2s',
          cursor: 'pointer',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = shadows.md
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = shadows.sm
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.xs }}>
          <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary, flex: 1, minWidth: 0 }}>
            {market.name}
          </h3>
          <span
            style={{
              padding: `${spacing['2xs']} ${spacing.xs}`,
              borderRadius: radius.md,
              fontSize: '10px',
              fontWeight: typography.weights.bold,
              backgroundColor: '#e8f5e9',
              color: '#2e7d32',
              textAlign: 'center',
              lineHeight: 1.3,
              flexShrink: 0,
              whiteSpace: 'nowrap'
            }}
          >
            Farmers<br />Market
          </span>
        </div>

        {/* Next Market Date - Prominent */}
        {nextMarket && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            padding: `${spacing.xs} ${spacing.sm}`,
            backgroundColor: colors.primaryLight,
            borderRadius: radius.md,
            marginBottom: spacing.sm
          }}>
            <span style={{ fontSize: typography.sizes.lg }}>📅</span>
            <div>
              <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.primaryDark }}>
                {nextMarket.date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}
              </div>
              <div style={{ fontSize: typography.sizes.xs, color: colors.primary }}>
                {formatTime(nextMarket.time)}
              </div>
            </div>
          </div>
        )}

        {/* Description */}
        {market.description && (
          <p style={{
            margin: `0 0 ${spacing.sm} 0`,
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
            lineHeight: typography.leading.relaxed,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            flex: 1
          }}>
            {market.description}
          </p>
        )}

        {/* Location */}
        {location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], marginBottom: spacing.sm }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>{location}</span>
            {market.distance_miles !== undefined && (
              <span style={{
                marginLeft: 'auto',
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                color: colors.textMuted,
                fontWeight: typography.weights.medium
              }}>
                {market.distance_miles.toFixed(1)} mi
              </span>
            )}
          </div>
        )}

        {/* Schedule (compact) */}
        {market.schedules && market.schedules.length > 0 && (
          <div style={{ marginBottom: spacing.sm, fontSize: typography.sizes.sm }}>
            <ScheduleDisplay schedules={market.schedules} compact />
          </div>
        )}

        {/* Footer stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: spacing.sm,
          borderTop: `1px solid ${colors.borderMuted}`,
          marginTop: 'auto'
        }}>
          <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
            👥 {market.vendor_count || 0} vendor{(market.vendor_count || 0) !== 1 ? 's' : ''}
          </span>
          {!market.active && (
            <span style={{
              padding: `${spacing['3xs']} ${spacing.xs}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              backgroundColor: '#fee2e2',
              color: '#991b1b',
            }}>
              Inactive
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
