'use client'

import { useLocationAreaName } from '@/hooks/useLocationAreaName'
import { colors, typography } from '@/lib/design-tokens'

interface TrustStatsTaglineProps {
  defaultText: string
}

/**
 * Client component for TrustStats tagline that shows personalized location.
 * Used as Option B fallback - if Hero doesn't show location (slow load),
 * this component will show it when the user scrolls to the TrustStats section.
 */
export function TrustStatsTagline({ defaultText }: TrustStatsTaglineProps) {
  const { areaName } = useLocationAreaName({ timeout: 5000 })

  return (
    <p
      className="text-center"
      style={{
        color: colors.textSecondary,
        fontSize: typography.sizes.base,
        transition: 'opacity 0.3s ease-in',
        fontWeight: areaName ? typography.weights.semibold : typography.weights.normal,
      }}
    >
      {areaName
        ? `Supporting local producers and artisans in the ${areaName} area`
        : defaultText
      }
    </p>
  )
}
