'use client'

import React, { useState, useMemo } from 'react'
import { spacing, typography, radius, sizing, statusColors } from '@/lib/design-tokens'

interface DateRange {
  start: Date
  end: Date
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  maxDays?: number
  customEnabled?: boolean
}

type PresetOption = 'last7' | 'last30' | 'last90' | 'custom'

export default function DateRangePicker({
  value,
  onChange,
  maxDays,
  customEnabled = true
}: DateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [customStart, setCustomStart] = useState(value.start.toISOString().split('T')[0])
  const [customEnd, setCustomEnd] = useState(value.end.toISOString().split('T')[0])

  const getActivePreset = (): PresetOption => {
    const now = new Date()
    const daysDiff = Math.round((now.getTime() - value.start.getTime()) / (1000 * 60 * 60 * 24))

    if (daysDiff >= 6 && daysDiff <= 8) return 'last7'
    if (daysDiff >= 29 && daysDiff <= 31) return 'last30'
    if (daysDiff >= 89 && daysDiff <= 91) return 'last90'
    return 'custom'
  }

  const handlePresetClick = (preset: PresetOption) => {
    const now = new Date()
    now.setHours(23, 59, 59, 999)

    let start: Date

    switch (preset) {
      case 'last7':
        start = new Date(now)
        start.setDate(start.getDate() - 7)
        setShowCustom(false)
        break
      case 'last30':
        start = new Date(now)
        start.setDate(start.getDate() - 30)
        setShowCustom(false)
        break
      case 'last90':
        start = new Date(now)
        start.setDate(start.getDate() - 90)
        setShowCustom(false)
        break
      case 'custom':
        setShowCustom(true)
        return
      default:
        return
    }

    start.setHours(0, 0, 0, 0)
    onChange({ start, end: now })
  }

  const handleCustomApply = () => {
    const start = new Date(customStart)
    const end = new Date(customEnd)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    onChange({ start, end })
    setShowCustom(false)
  }

  const activePreset = getActivePreset()

  // Compute the earliest allowed date based on maxDays
  const minDate = useMemo(() => {
    if (!maxDays) return undefined
    const d = new Date()
    d.setDate(d.getDate() - maxDays)
    return d.toISOString().split('T')[0]
  }, [maxDays])

  const buttonStyle = (isActive: boolean, disabled?: boolean) => ({
    ...sizing.control,
    padding: `${spacing['2xs']} ${spacing.sm}`,
    border: 'none',
    fontWeight: typography.weights.medium as number,
    cursor: disabled ? 'not-allowed' as const : 'pointer' as const,
    opacity: disabled ? 0.5 : 1,
    backgroundColor: isActive ? 'var(--color-primary, #166534)' : statusColors.neutral100,
    color: isActive ? 'white' : statusColors.neutral700,
    transition: 'all 0.15s ease'
  })

  return (
    <div>
      {/* Preset buttons */}
      <div style={{
        display: 'flex',
        gap: spacing['2xs'],
        flexWrap: 'wrap'
      }}>
        {(!maxDays || maxDays >= 7) && (
          <button
            onClick={() => handlePresetClick('last7')}
            style={buttonStyle(activePreset === 'last7' && !showCustom)}
          >
            Last 7 days
          </button>
        )}
        {(!maxDays || maxDays >= 30) && (
          <button
            onClick={() => handlePresetClick('last30')}
            style={buttonStyle(activePreset === 'last30' && !showCustom)}
          >
            Last 30 days
          </button>
        )}
        {(!maxDays || maxDays >= 90) && (
          <button
            onClick={() => handlePresetClick('last90')}
            style={buttonStyle(activePreset === 'last90' && !showCustom)}
          >
            Last 90 days
          </button>
        )}
        <button
          onClick={() => customEnabled && handlePresetClick('custom')}
          style={buttonStyle(showCustom, !customEnabled)}
          title={!customEnabled ? 'Upgrade to Pro to use custom date ranges' : undefined}
        >
          Custom
        </button>
      </div>

      {/* Custom date picker */}
      {showCustom && (
        <div style={{
          marginTop: spacing.xs,
          padding: spacing.xs,
          backgroundColor: statusColors.neutral50,
          borderRadius: radius.md,
          display: 'flex',
          gap: spacing.xs,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div>
            <label style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, display: 'block', marginBottom: spacing['3xs'] }}>
              Start Date
            </label>
            <input
              type="date"
              value={customStart}
              min={minDate}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{
                ...sizing.control,
                border: `1px solid ${statusColors.neutral300}`,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, display: 'block', marginBottom: spacing['3xs'] }}>
              End Date
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{
                ...sizing.control,
                border: `1px solid ${statusColors.neutral300}`,
              }}
            />
          </div>
          <button
            onClick={handleCustomApply}
            style={{
              ...sizing.control,
              padding: `${spacing['2xs']} ${spacing.sm}`,
              border: 'none',
              backgroundColor: 'var(--color-primary, #166534)',
              color: 'white',
              fontWeight: typography.weights.medium,
              cursor: 'pointer',
              marginTop: spacing.sm
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
