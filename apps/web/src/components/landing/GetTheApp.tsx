'use client'

import { useState } from 'react'
import { Smartphone, Download } from 'lucide-react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { defaultBranding } from '@/lib/branding'

interface GetTheAppProps {
  vertical: string
  variant?: 'full' | 'compact'
}

/**
 * Get The App Section
 * Encourages users to install as PWA (Progressive Web App)
 * Shows download buttons for future app store listings
 */
export function GetTheApp({ vertical, variant = 'full' }: GetTheAppProps) {
  const branding = defaultBranding[vertical] || defaultBranding.fireworks
  const isFarmersMarket = vertical === 'farmers_market'
  const [showInstallTip, setShowInstallTip] = useState(false)

  const handleDownloadClick = () => {
    setShowInstallTip(true)
  }

  if (variant === 'compact') {
    return (
      <section style={{
        padding: `${spacing.xl} ${spacing.lg}`,
        backgroundColor: colors.surfaceElevated,
        borderTop: `1px solid ${colors.border}`,
        borderBottom: `1px solid ${colors.border}`
      }}>
        <div style={{
          maxWidth: 800,
          marginLeft: 'auto',
          marginRight: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: spacing.md
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: radius.lg,
              backgroundColor: colors.primary + '15',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Smartphone style={{ width: 24, height: 24, color: colors.primary }} />
            </div>
            <div>
              <p style={{
                margin: 0,
                fontSize: typography.sizes.lg,
                fontWeight: typography.weights.semibold,
                color: colors.textPrimary
              }}>
                Get the {branding.brand_name} App
              </p>
              <p style={{
                margin: 0,
                fontSize: typography.sizes.sm,
                color: colors.textSecondary
              }}>
                Shop faster with our mobile app
              </p>
            </div>
          </div>
          <button
            onClick={handleDownloadClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: radius.md,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer',
              minHeight: 44
            }}
          >
            <Download style={{ width: 18, height: 18 }} />
            Download
          </button>
        </div>
        {showInstallTip && (
          <p style={{
            textAlign: 'center',
            marginTop: spacing.sm,
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
          }}>
            Add this site to your home screen for the best app-like experience.
          </p>
        )}
      </section>
    )
  }

  return (
    <section
      className="landing-section"
      style={{
        backgroundColor: colors.surfaceSubtle,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background decoration */}
      <div style={{
        position: 'absolute',
        top: -100,
        right: -100,
        width: 300,
        height: 300,
        borderRadius: '50%',
        backgroundColor: colors.primary + '08',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: -50,
        left: -50,
        width: 200,
        height: 200,
        borderRadius: '50%',
        backgroundColor: colors.accent + '08',
        pointerEvents: 'none'
      }} />

      <div className="landing-container" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: spacing.xl,
          alignItems: 'center'
        }}>
          {/* Left side - Text content */}
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing.xs,
              padding: `${spacing.xs} ${spacing.sm}`,
              backgroundColor: colors.primary + '15',
              borderRadius: radius.full,
              marginBottom: spacing.md
            }}>
              <Smartphone style={{ width: 16, height: 16, color: colors.primary }} />
              <span style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                color: colors.primary
              }}>
                Mobile App
              </span>
            </div>

            <h2 style={{
              fontSize: typography.sizes['3xl'],
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
              marginBottom: spacing.sm,
              lineHeight: 1.2
            }}>
              Take {branding.brand_name} With You
            </h2>

            <p style={{
              fontSize: typography.sizes.lg,
              color: colors.textSecondary,
              marginBottom: spacing.lg,
              lineHeight: 1.6
            }}>
              {isFarmersMarket
                ? 'Browse vendors, place orders, and manage pickups right from your phone. Get notifications when your order is ready.'
                : 'Shop local vendors, track orders, and get pickup reminders. Everything you need in your pocket.'}
            </p>

            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: `0 0 ${spacing.lg} 0`,
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.sm
            }}>
              {[
                'Quick ordering from anywhere',
                'Real-time order notifications',
                'Easy vendor discovery',
                'Save favorites for fast reorder'
              ].map((feature, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  fontSize: typography.sizes.base,
                  color: colors.textSecondary
                }}>
                  <span style={{
                    width: 20,
                    height: 20,
                    borderRadius: radius.full,
                    backgroundColor: colors.primary + '20',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: typography.sizes.xs,
                    color: colors.primary
                  }}>
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            {/* Download buttons */}
            <div style={{
              display: 'flex',
              gap: spacing.sm,
              flexWrap: 'wrap'
            }}>
              <button
                onClick={handleDownloadClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: `${spacing.sm} ${spacing.lg}`,
                  backgroundColor: '#000',
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.lg,
                  cursor: 'pointer',
                  minHeight: 50
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'white' }}>
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25"/>
                </svg>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>Download on the</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: -2 }}>App Store</div>
                </div>
              </button>

              <button
                onClick={handleDownloadClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: `${spacing.sm} ${spacing.lg}`,
                  backgroundColor: '#000',
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.lg,
                  cursor: 'pointer',
                  minHeight: 50
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'white' }}>
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z"/>
                </svg>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>Get it on</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: -2 }}>Google Play</div>
                </div>
              </button>
            </div>

            <p style={{
              marginTop: spacing.md,
              fontSize: typography.sizes.sm,
              color: colors.textMuted
            }}>
              Coming soon to app stores. Add to home screen for the best experience now.
            </p>
          </div>

          {/* Right side - Phone mockup */}
          <div style={{
            display: 'flex',
            justifyContent: 'center'
          }}>
            <div style={{
              width: 280,
              height: 560,
              backgroundColor: colors.surfaceElevated,
              borderRadius: 40,
              border: `8px solid ${colors.textPrimary}`,
              boxShadow: shadows.xl,
              overflow: 'hidden',
              position: 'relative'
            }}>
              {/* Phone notch */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 120,
                height: 28,
                backgroundColor: colors.textPrimary,
                borderBottomLeftRadius: 20,
                borderBottomRightRadius: 20,
                zIndex: 10
              }} />

              {/* Screen content mockup */}
              <div style={{
                height: '100%',
                background: `linear-gradient(180deg, ${colors.primary}15 0%, ${colors.surfaceBase} 100%)`,
                padding: spacing.lg,
                paddingTop: 50
              }}>
                {/* App header mockup */}
                <div style={{
                  fontSize: typography.sizes.xl,
                  fontWeight: typography.weights.bold,
                  color: colors.primary,
                  marginBottom: spacing.lg,
                  textAlign: 'center'
                }}>
                  {branding.brand_name}
                </div>

                {/* Product cards mockup */}
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.md,
                    padding: spacing.sm,
                    marginBottom: spacing.sm,
                    display: 'flex',
                    gap: spacing.sm,
                    boxShadow: shadows.sm
                  }}>
                    <div style={{
                      width: 50,
                      height: 50,
                      backgroundColor: colors.surfaceMuted,
                      borderRadius: radius.sm
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        height: 12,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: 4,
                        marginBottom: 6,
                        width: '80%'
                      }} />
                      <div style={{
                        height: 10,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: 4,
                        width: '60%'
                      }} />
                    </div>
                  </div>
                ))}

                {/* Bottom nav mockup */}
                <div style={{
                  position: 'absolute',
                  bottom: 20,
                  left: 20,
                  right: 20,
                  height: 50,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.lg,
                  display: 'flex',
                  justifyContent: 'space-around',
                  alignItems: 'center',
                  boxShadow: shadows.md
                }}>
                  {['🏠', '🔍', '🛒', '👤'].map((icon, i) => (
                    <span key={i} style={{ fontSize: 20, opacity: i === 0 ? 1 : 0.4 }}>
                      {icon}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
