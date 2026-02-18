'use client'

import React, { useState, useMemo } from 'react'

interface DateRange {
  start: Date
  end: Date
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  maxDays?: number
}

type PresetOption = 'last7' | 'last30' | 'last90' | 'custom'

export default function DateRangePicker({
  value,
  onChange,
  maxDays
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

  const buttonStyle = (isActive: boolean) => ({
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: isActive ? '#2563eb' : '#f3f4f6',
    color: isActive ? 'white' : '#374151',
    transition: 'all 0.15s ease'
  })

  return (
    <div>
      {/* Preset buttons */}
      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap'
      }}>
        {(!maxDays || maxDays >= 7) && (
          <button
            onClick={() => handlePresetClick('last7')}
            style={buttonStyle(activePreset === 'last7')}
          >
            Last 7 days
          </button>
        )}
        {(!maxDays || maxDays >= 30) && (
          <button
            onClick={() => handlePresetClick('last30')}
            style={buttonStyle(activePreset === 'last30')}
          >
            Last 30 days
          </button>
        )}
        {(!maxDays || maxDays >= 90) && (
          <button
            onClick={() => handlePresetClick('last90')}
            style={buttonStyle(activePreset === 'last90')}
          >
            Last 90 days
          </button>
        )}
        <button
          onClick={() => handlePresetClick('custom')}
          style={buttonStyle(activePreset === 'custom' || showCustom)}
        >
          Custom
        </button>
      </div>

      {/* Custom date picker */}
      {showCustom && (
        <div style={{
          marginTop: 12,
          padding: 12,
          backgroundColor: '#f9fafb',
          borderRadius: 8,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Start Date
            </label>
            <input
              type="date"
              value={customStart}
              min={minDate}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 4,
                border: '1px solid #d1d5db',
                fontSize: 14
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
              End Date
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 4,
                border: '1px solid #d1d5db',
                fontSize: 14
              }}
            />
          </div>
          <button
            onClick={handleCustomApply}
            style={{
              padding: '8px 16px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: '#2563eb',
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              marginTop: 18
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
