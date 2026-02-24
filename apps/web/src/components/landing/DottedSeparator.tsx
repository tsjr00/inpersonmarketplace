'use client'

interface DottedSeparatorProps {
  color?: string
  spacing?: number
}

/**
 * Dotted line separator used between landing page sections.
 * Uses radial-gradient for visible round dots (CSS border-style: dotted produces tiny dots).
 */
export function DottedSeparator({ color = '#d1d5db', spacing = 0 }: DottedSeparatorProps) {
  return (
    <div
      style={{
        width: '100%',
        height: 5,
        backgroundImage: `radial-gradient(circle, ${color} 1.5px, transparent 1.5px)`,
        backgroundSize: '14px 5px',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'center',
        marginTop: spacing,
        marginBottom: spacing,
      }}
    />
  )
}
