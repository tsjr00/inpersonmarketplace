import { Metadata } from 'next'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { Footer } from '@/components/landing'
import { term, getContent } from '@/lib/vertical'

interface FeaturesPageProps {
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: FeaturesPageProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  return {
    title: `Features & Benefits | ${branding.brand_name}`,
    description: `Discover how ${branding.brand_name} makes shopping local simple. Pre-order from verified vendors, pick up at your convenience, and support your community.`,
  }
}

export default async function FeaturesPage({ params }: FeaturesPageProps) {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.fireworks
  const content = getContent(vertical)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase }}>
      {/* Navigation */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${spacing.md} ${spacing.xl}`,
        backgroundColor: colors.surfaceElevated,
        borderBottom: `1px solid ${colors.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <Link href={`/${vertical}`} style={{ textDecoration: 'none' }}>
          <span style={{
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
            color: colors.primary
          }}>
            {branding.brand_name}
          </span>
        </Link>
        <div style={{ display: 'flex', gap: spacing.md, alignItems: 'center' }}>
          <Link
            href={`/${vertical}/browse`}
            style={{
              color: colors.textSecondary,
              textDecoration: 'none',
              fontWeight: typography.weights.medium
            }}
          >
            Browse
          </Link>
          <Link
            href={`/${vertical}/login`}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.semibold
            }}
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        padding: `${spacing['3xl']} ${spacing.xl}`,
        textAlign: 'center',
        background: `linear-gradient(135deg, ${colors.primary}08 0%, ${colors.accent}08 100%)`
      }}>
        <h1 style={{
          fontSize: typography.sizes['4xl'],
          fontWeight: typography.weights.bold,
          color: colors.textPrimary,
          marginBottom: spacing.md,
          maxWidth: 800,
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          Simple. Local. Connected.
        </h1>
        <p style={{
          fontSize: typography.sizes.xl,
          color: colors.textSecondary,
          maxWidth: 600,
          marginLeft: 'auto',
          marginRight: 'auto',
          lineHeight: 1.6
        }}>
          {content.features_page.hero_subtitle}
        </p>
      </section>

      {/* Our Promise */}
      <section style={{
        padding: `${spacing['3xl']} ${spacing.xl}`,
        maxWidth: 1000,
        marginLeft: 'auto',
        marginRight: 'auto'
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: spacing['2xl']
        }}>
          <h2 style={{
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
            marginBottom: spacing.sm
          }}>
            Built for Simplicity
          </h2>
          <p style={{
            fontSize: typography.sizes.lg,
            color: colors.textSecondary,
            maxWidth: 600,
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            No complicated apps. No confusing interfaces. Just straightforward shopping and selling.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: spacing.lg
        }}>
          {[
            { icon: '3️⃣', title: 'Three Clicks to Order', desc: 'Find a product, add to cart, checkout. That\'s it.' },
            { icon: '📱', title: 'Works on Any Device', desc: 'Phone, tablet, or computer. No app download required.' },
            { icon: '🔒', title: 'Secure Payments', desc: 'All payments processed securely through Stripe.' },
            { icon: '📍', title: 'Local Only', desc: 'Find vendors within 25 miles of your location.' }
          ].map((item, i) => (
            <div key={i} style={{
              padding: spacing.lg,
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.lg,
              boxShadow: shadows.sm,
              border: `1px solid ${colors.border}`
            }}>
              <div style={{ fontSize: '2rem', marginBottom: spacing.sm }}>{item.icon}</div>
              <h3 style={{
                fontSize: typography.sizes.lg,
                fontWeight: typography.weights.semibold,
                color: colors.textPrimary,
                marginBottom: spacing.xs
              }}>
                {item.title}
              </h3>
              <p style={{
                fontSize: typography.sizes.base,
                color: colors.textSecondary,
                lineHeight: 1.5,
                margin: 0
              }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* For Shoppers */}
      <section style={{
        padding: `${spacing['3xl']} ${spacing.xl}`,
        backgroundColor: colors.surfaceSubtle
      }}>
        <div style={{ maxWidth: 1000, marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            marginBottom: spacing.lg
          }}>
            <span style={{ fontSize: '2rem' }}>🛒</span>
            <h2 style={{
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
              margin: 0
            }}>
              For Shoppers
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: spacing.lg
          }}>
            {[
              {
                title: 'Never Miss Your Favorites',
                desc: content.features_page.shopper_preorder_desc,
                icon: '✓'
              },
              {
                title: 'Skip the Lines',
                desc: content.features_page.shopper_skip_lines_desc,
                icon: '⚡'
              },
              {
                title: 'Shop on Your Schedule',
                desc: 'Browse products anytime from your phone or computer. Place orders when it\'s convenient for you, not just during market hours.',
                icon: '🕐'
              },
              {
                title: 'Know Your Vendors',
                desc: 'Every vendor is verified. See their story, what they offer, and reviews from other shoppers before you buy.',
                icon: '👤'
              },
              {
                title: 'Order Updates',
                desc: 'Get notifications when your order is confirmed and ready for pickup. No guessing, no phone calls needed.',
                icon: '🔔'
              },
              {
                title: 'Support Local',
                desc: 'Every purchase goes directly to local vendors and makers in your community. Know exactly where your money goes.',
                icon: '❤️'
              }
            ].map((item, i) => (
              <div key={i} style={{
                padding: spacing.lg,
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.lg,
                boxShadow: shadows.sm
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  marginBottom: spacing.sm
                }}>
                  <span style={{
                    fontSize: typography.sizes.lg,
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.primary + '15',
                    borderRadius: radius.full,
                    color: colors.primary
                  }}>
                    {item.icon}
                  </span>
                  <h3 style={{
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                    margin: 0
                  }}>
                    {item.title}
                  </h3>
                </div>
                <p style={{
                  fontSize: typography.sizes.base,
                  color: colors.textSecondary,
                  lineHeight: 1.6,
                  margin: 0
                }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: spacing.xl }}>
            <Link
              href={`/${vertical}/browse`}
              style={{
                display: 'inline-block',
                padding: `${spacing.md} ${spacing.xl}`,
                backgroundColor: colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: radius.lg,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.lg
              }}
            >
              Start Shopping
            </Link>
          </div>
        </div>
      </section>

      {/* For Vendors */}
      <section style={{
        padding: `${spacing['3xl']} ${spacing.xl}`,
        backgroundColor: colors.surfaceElevated
      }}>
        <div style={{ maxWidth: 1000, marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            marginBottom: spacing.lg
          }}>
            <span style={{ fontSize: '2rem' }}>🏪</span>
            <h2 style={{
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
              margin: 0
            }}>
              For Vendors
            </h2>
          </div>

          <p style={{
            fontSize: typography.sizes.lg,
            color: colors.textSecondary,
            marginBottom: spacing.xl,
            maxWidth: 700
          }}>
            Run the online side of your business without the complexity. We handle the technology so you can focus on what you do best.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: spacing.lg
          }}>
            {[
              {
                title: 'Set Up in Minutes',
                desc: 'Create your vendor profile, add your products, and start accepting orders. No technical skills required.',
                icon: '⏱️'
              },
              {
                title: 'Simple Product Management',
                desc: 'Add photos, set prices, and manage inventory from your phone. Update availability in real-time.',
                icon: '📦'
              },
              {
                title: 'Know Before Market Day',
                desc: 'See exactly what\'s ordered before you arrive. Pack with confidence, reduce waste, and prepare the right quantities.',
                icon: '📋'
              },
              {
                title: 'Automatic Cutoff Times',
                desc: 'Set when orders close before each market. Customers order on time, you get predictable prep schedules.',
                icon: '⏰'
              },
              {
                title: 'Get Paid Reliably',
                desc: 'Secure payment processing through Stripe. Funds deposited directly to your bank account.',
                icon: '💰'
              },
              {
                title: 'Build Customer Loyalty',
                desc: 'Your profile showcases your story and products. Customers can find and follow you across multiple markets.',
                icon: '⭐'
              },
              {
                title: 'Multiple Pickup Options',
                desc: content.features_page.vendor_pickup_desc,
                icon: '📍'
              },
              {
                title: 'Real-Time Order Management',
                desc: 'View orders, confirm them with one tap, and mark as ready for pickup. Everything in one simple dashboard.',
                icon: '✅'
              }
            ].map((item, i) => (
              <div key={i} style={{
                padding: spacing.lg,
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radius.lg,
                border: `1px solid ${colors.border}`
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  marginBottom: spacing.sm
                }}>
                  <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
                  <h3 style={{
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                    margin: 0
                  }}>
                    {item.title}
                  </h3>
                </div>
                <p style={{
                  fontSize: typography.sizes.base,
                  color: colors.textSecondary,
                  lineHeight: 1.6,
                  margin: 0
                }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: spacing.xl }}>
            <Link
              href={`/${vertical}/vendor-signup`}
              style={{
                display: 'inline-block',
                padding: `${spacing.md} ${spacing.xl}`,
                backgroundColor: colors.accent,
                color: 'white',
                textDecoration: 'none',
                borderRadius: radius.lg,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.lg
              }}
            >
              {term(vertical, 'vendor_signup_cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works Summary */}
      <section style={{
        padding: `${spacing['3xl']} ${spacing.xl}`,
        backgroundColor: colors.primary,
        color: 'white',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: 800, marginLeft: 'auto', marginRight: 'auto' }}>
          <h2 style={{
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            marginBottom: spacing.xl
          }}>
            Ready to Get Started?
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: spacing.lg,
            marginBottom: spacing.xl
          }}>
            <div>
              <div style={{
                fontSize: '2.5rem',
                marginBottom: spacing.sm
              }}>1</div>
              <p style={{ fontSize: typography.sizes.lg, margin: 0 }}>
                {content.features_page.get_started_step1}
              </p>
            </div>
            <div>
              <div style={{
                fontSize: '2.5rem',
                marginBottom: spacing.sm
              }}>2</div>
              <p style={{ fontSize: typography.sizes.lg, margin: 0 }}>
                Place your order online
              </p>
            </div>
            <div>
              <div style={{
                fontSize: '2.5rem',
                marginBottom: spacing.sm
              }}>3</div>
              <p style={{ fontSize: typography.sizes.lg, margin: 0 }}>
                Pick up at your convenience
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: spacing.md, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href={`/${vertical}/browse`}
              style={{
                padding: `${spacing.md} ${spacing.xl}`,
                backgroundColor: 'white',
                color: colors.primary,
                textDecoration: 'none',
                borderRadius: radius.lg,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.lg
              }}
            >
              Shop Now
            </Link>
            <Link
              href={`/${vertical}/vendor-signup`}
              style={{
                padding: `${spacing.md} ${spacing.xl}`,
                backgroundColor: 'transparent',
                color: 'white',
                border: '2px solid white',
                textDecoration: 'none',
                borderRadius: radius.lg,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.lg
              }}
            >
              Start Selling
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer vertical={vertical} />
    </div>
  )
}
