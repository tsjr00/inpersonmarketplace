'use client'

import { useState, useCallback, useRef } from 'react'
import { spacing, radius, shadows, typography } from '@/lib/design-tokens'

type BannerType = 'success' | 'error' | 'warning' | 'info'

interface BannerState {
  message: string
  type: BannerType
}

const bannerStyles: Record<BannerType, { bg: string; border: string; color: string }> = {
  error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' },
  success: { bg: '#ecfdf5', border: '#6ee7b7', color: '#065f46' },
  warning: { bg: '#fffbeb', border: '#fcd34d', color: '#92400e' },
  info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af' },
}

export function useStatusBanner(autoDismissMs = 5000) {
  const [banner, setBanner] = useState<BannerState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showBanner = useCallback((type: BannerType, message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setBanner({ type, message })
    if (autoDismissMs > 0) {
      timerRef.current = setTimeout(() => setBanner(null), autoDismissMs)
    }
  }, [autoDismissMs])

  const clearBanner = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setBanner(null)
  }, [])

  function StatusBanner() {
    if (!banner) return null
    const style = bannerStyles[banner.type]
    return (
      <div style={{
        position: 'fixed',
        bottom: spacing.md,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: `${spacing.xs} ${spacing.lg}`,
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        color: style.color,
        borderRadius: radius.md,
        boxShadow: shadows.lg,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.medium,
        zIndex: 1000,
        maxWidth: '90vw',
        textAlign: 'center' as const,
      }}>
        {banner.message}
        <button
          onClick={clearBanner}
          style={{
            marginLeft: spacing.xs,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.bold,
          }}
        >
          ×
        </button>
      </div>
    )
  }

  return { showBanner, clearBanner, StatusBanner }
}
