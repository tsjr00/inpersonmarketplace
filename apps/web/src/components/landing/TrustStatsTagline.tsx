'use client'

import { useLocationAreaName } from '@/hooks/useLocationAreaName'
import { typography, getVerticalColors } from '@/lib/design-tokens'
import { getContent } from '@/lib/vertical'

interface TrustStatsTaglineProps {
  vertical: string
}

/**
 * Client component for TrustStats tagline that shows personalized location.
 * Uses vertical content system for tagline text.
 */
export function TrustStatsTagline({ vertical }: TrustStatsTaglineProps) {
  const colors = getVerticalColors(vertical)
  const { trust_stats } = getContent(vertical)
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
        ? trust_stats.tagline_location.replace('{area}', areaName)
        : trust_stats.tagline
      }
    </p>
  )
}
