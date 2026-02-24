'use client'

import { useRouter } from 'next/navigation'
import LocationSearchInline from '@/components/location/LocationSearchInline'
import { term, getRadiusOptions } from '@/lib/vertical'
import { spacing, typography, getVerticalColors } from '@/lib/design-tokens'

interface BrowseLocationPromptProps {
  vertical: string
}

export default function BrowseLocationPrompt({ vertical }: BrowseLocationPromptProps) {
  const router = useRouter()
  const colors = getVerticalColors(vertical)
  const radiusOptions = getRadiusOptions(vertical)

  return (
    <div style={{ marginBottom: spacing.md }}>
      <p
        style={{
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          marginBottom: spacing.xs,
        }}
      >
        Enter your location to find {term(vertical, 'vendors').toLowerCase()} near you
      </p>
      <LocationSearchInline
        onLocationSet={() => {
          // Cookie is set by LocationSearchInline — refresh to re-render with filtered results
          router.refresh()
        }}
        labelPrefix={`${term(vertical, 'listings')} near`}
        radiusOptions={radiusOptions}
      />
    </div>
  )
}
