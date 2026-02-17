'use client'

import { useState, useEffect } from 'react'
import { Smartphone, Download, Plus } from 'lucide-react'
import { spacing, typography, radius, getVerticalColors, getVerticalShadows } from '@/lib/design-tokens'
import { getContent } from '@/lib/vertical'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface GetTheAppProps {
  vertical: string
  variant?: 'full' | 'compact'
}

/**
 * Get The App Section
 * Encourages users to install as PWA (Progressive Web App)
 * Shows "Add to Home Screen" prompt
 */
export function GetTheApp({ vertical, variant = 'full' }: GetTheAppProps) {
  const colors = getVerticalColors(vertical)
  const shadows = getVerticalShadows(vertical)
  const { get_the_app } = getContent(vertical)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallTip, setShowInstallTip] = useState(false)

  // Listen for the beforeinstallprompt event (PWA install)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') {
        setDeferredPrompt(null)
      }
    } else {
      setShowInstallTip(true)
    }
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
                {get_the_app.headline}
              </p>
              <p style={{
                margin: 0,
                fontSize: typography.sizes.sm,
                color: colors.textSecondary
              }}>
                Add to your home screen for instant access
              </p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
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
            Install App
          </button>
        </div>
        {showInstallTip && (
          <p style={{
            textAlign: 'center',
            marginTop: spacing.sm,
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
          }}>
            Tap the share button in your browser, then select &quot;Add to Home Screen&quot; for the best experience.
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
              {get_the_app.headline}
            </h2>

            <p style={{
              fontSize: typography.sizes.lg,
              color: colors.textSecondary,
              marginBottom: spacing.lg,
              lineHeight: 1.6
            }}>
              {get_the_app.subtitle}
            </p>

            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: `0 0 ${spacing.lg} 0`,
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.sm
            }}>
              {get_the_app.features.map((feature, i) => (
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

            {/* Install button */}
            <button
              onClick={handleInstallClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `${spacing.sm} ${spacing.xl}`,
                backgroundColor: colors.primary,
                color: 'white',
                border: 'none',
                borderRadius: radius.lg,
                cursor: 'pointer',
                minHeight: 50,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
                boxShadow: shadows.primary,
              }}
            >
              <Plus style={{ width: 20, height: 20 }} />
              Add to Home Screen
            </button>

            {showInstallTip && (
              <p style={{
                marginTop: spacing.sm,
                fontSize: typography.sizes.sm,
                color: colors.textMuted
              }}>
                Tap the share button in your browser, then select &quot;Add to Home Screen&quot; for instant access.
              </p>
            )}
          </div>

          {/* Right side - Phone mockup with realistic product browse */}
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

              {/* Screen content - realistic product browse */}
              <div style={{
                height: '100%',
                background: `linear-gradient(180deg, ${colors.primary}10 0%, ${colors.surfaceBase} 100%)`,
                paddingTop: 40
              }}>
                {/* Search bar mockup */}
                <div style={{
                  margin: '0 16px 12px',
                  padding: '8px 12px',
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border}`,
                  fontSize: 11,
                  color: colors.textMuted,
                }}>
                  Search products...
                </div>

                {/* Product grid mockup - 2x2 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  padding: '0 12px',
                }}>
                  {get_the_app.phone_products.map((product, i) => (
                    <div key={i} style={{
                      backgroundColor: colors.surfaceElevated,
                      borderRadius: radius.sm,
                      overflow: 'hidden',
                      boxShadow: shadows.sm,
                    }}>
                      {/* Product image placeholder */}
                      <div style={{
                        height: 80,
                        backgroundColor: product.color + '25',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: product.color + '40',
                        }} />
                      </div>
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: colors.textPrimary,
                          marginBottom: 2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {product.name}
                        </div>
                        <div style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: colors.primary,
                        }}>
                          {product.price}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add to cart button mockup */}
                <div style={{
                  margin: '12px 12px 0',
                  padding: '8px',
                  backgroundColor: colors.primary,
                  borderRadius: radius.sm,
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'white',
                }}>
                  View Cart (2 items)
                </div>

                {/* Bottom nav mockup */}
                <div style={{
                  position: 'absolute',
                  bottom: 20,
                  left: 20,
                  right: 20,
                  height: 46,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.lg,
                  display: 'flex',
                  justifyContent: 'space-around',
                  alignItems: 'center',
                  boxShadow: shadows.md
                }}>
                  {['🏠', '🔍', '🛒', '👤'].map((icon, i) => (
                    <span key={i} style={{ fontSize: 18, opacity: i === 1 ? 1 : 0.4 }}>
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
