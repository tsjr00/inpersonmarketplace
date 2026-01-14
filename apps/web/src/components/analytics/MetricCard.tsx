'use client'

import React from 'react'

interface MetricCardProps {
  label: string
  value: number | string
  change?: number
  icon?: React.ReactNode
  format?: 'currency' | 'number' | 'percentage'
}

export default function MetricCard({
  label,
  value,
  change,
  icon,
  format = 'number'
}: MetricCardProps) {
  const formatValue = (val: number | string): string => {
    if (typeof val === 'string') return val

    switch (format) {
      case 'currency':
        // Value is in cents, convert to dollars
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2
        }).format(val / 100)
      case 'percentage':
        return `${val}%`
      case 'number':
      default:
        return new Intl.NumberFormat('en-US').format(val)
    }
  }

  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
      {/* Header with icon and label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: '#6b7280',
        fontSize: 14
      }}>
        {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
        <span>{label}</span>
      </div>

      {/* Value */}
      <div style={{
        fontSize: 28,
        fontWeight: 'bold',
        color: '#111827'
      }}>
        {formatValue(value)}
      </div>

      {/* Change indicator */}
      {change !== undefined && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: change >= 0 ? '#059669' : '#dc2626'
        }}>
          <span>{change >= 0 ? '↑' : '↓'}</span>
          <span>{Math.abs(change)}% from previous period</span>
        </div>
      )}
    </div>
  )
}
