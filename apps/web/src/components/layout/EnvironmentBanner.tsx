'use client'

const ENV = process.env.NEXT_PUBLIC_VERCEL_ENV

const BANNER_HEIGHT = 20

export function EnvironmentBanner() {
  // Only show on non-production deployments
  if (ENV === 'production' || !ENV) return null

  const label = ENV === 'preview' ? 'STAGING' : 'DEV'
  const bg = ENV === 'preview' ? '#f59e0b' : '#8b5cf6'

  return (
    <>
      {/* Fixed banner */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          backgroundColor: bg,
          color: 'white',
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 700,
          height: BANNER_HEIGHT,
          lineHeight: `${BANNER_HEIGHT}px`,
          letterSpacing: '0.1em',
          pointerEvents: 'none',
        }}
      >
        {label} — NOT PRODUCTION
      </div>
      {/* Spacer so sticky header and content aren't hidden behind the banner */}
      <div style={{ height: BANNER_HEIGHT }} />
    </>
  )
}
