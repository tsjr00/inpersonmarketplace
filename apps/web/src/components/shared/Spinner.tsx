'use client'

import { colors, spacing, typography } from '@/lib/design-tokens'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

const SIZES = {
  sm: { width: 16, height: 16, border: 2 },
  md: { width: 32, height: 32, border: 3 },
  lg: { width: 48, height: 48, border: 4 },
}

export function Spinner({ size = 'md', color }: SpinnerProps) {
  const s = SIZES[size]
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width: s.width,
        height: s.height,
        border: `${s.border}px solid ${colors.border}`,
        borderTopColor: color || colors.primary,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}
    />
  )
}

export function FullPageLoading({ message }: { message?: string }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceBase,
    }}>
      <div style={{ textAlign: 'center' }}>
        <Spinner size="lg" />
        {message && (
          <p style={{
            color: colors.textMuted,
            marginTop: spacing.sm,
            fontSize: typography.sizes.base,
          }}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

export function InlineLoading({ message, color }: { message?: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing['2xs'],
    }}>
      <Spinner size="sm" color={color} />
      {message && (
        <span style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
          {message}
        </span>
      )}
    </span>
  )
}
