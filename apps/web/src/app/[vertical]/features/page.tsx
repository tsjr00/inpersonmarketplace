import { Metadata } from 'next'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows, getVerticalColors } from '@/lib/design-tokens'
import { Footer } from '@/components/landing'
import { term, getContent } from '@/lib/vertical'
import { breadcrumbJsonLd } from '@/lib/marketing/json-ld'

interface FeaturesPageProps {
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: FeaturesPageProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'

  return {
    title: isFT
      ? `Food Truck Ordering Features | ${branding.brand_name}`
      : `Farmers Market Online Ordering Features | ${branding.brand_name}`,
    description: isFT
      ? 'Order from food trucks online with pre-orders, skip-the-line pickup, Chef Box meal subscriptions, and real-time order updates. Features for food truck customers and operators.'
      : 'Order from farmers markets online with pre-orders, local pickup, Market Box subscriptions, and verified vendor profiles. Features for shoppers and vendors.',
  }
}

export default async function FeaturesPage({ params }: FeaturesPageProps) {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const content = getContent(vertical)
  // Actual hex values needed for hex+alpha concatenation (CSS var() can't be concatenated)
  const hexColors = getVerticalColors(vertical)

  const isFT = vertical === 'food_trucks'
  const baseUrl = `https://${branding.domain}`

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', url: `${baseUrl}/${vertical}` },
    { name: 'Features', url: `${baseUrl}/${vertical}/features` },
  ])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      {/* Hero Section */}
      <section style={{
        padding: `${spacing['3xl']} ${spacing.xl}`,
        textAlign: 'center',
        background: `linear-gradient(135deg, ${hexColors.primary}08 0%, ${hexColors.accent}08 100%)`
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
          {isFT ? 'Order from Food Trucks Online' : 'Order from Farmers Markets Online'}
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
            {isFT ? 'Mobile Food Ordering Made Simple' : 'Local Food Pre-Ordering Made Simple'}
          </h2>
          <p style={{
            fontSize: typography.sizes.lg,
            color: colors.textSecondary,
            maxWidth: 600,
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            {isFT
              ? 'No complicated apps to download. Browse menus, pre-order online, and skip the line at your favorite food trucks.'
              : 'No complicated apps to download. Browse products, pre-order from your local farmers market online, and pick up on your schedule.'}
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
              },
              {
                title: `${term(vertical, 'market_boxes')}`,
                desc: content.features_page.subscription_feature_desc,
                icon: '📦'
              },
              {
                title: 'Favorite Vendors',
                desc: `Save your favorite ${term(vertical, 'vendors').toLowerCase()} and quickly find them when you\'re ready to order again.`,
                icon: '❤️'
              },
              ...(vertical === 'food_trucks' ? [{
                title: 'Tips at Checkout',
                desc: `Show your appreciation with optional tips at checkout. 100% of the food cost tip goes to the ${term(vertical, 'vendor').toLowerCase()}.`,
                icon: '💝'
              }] : []),
              {
                title: 'Buyer Premium',
                desc: `Upgrade to Premium for early access to new ${term(vertical, 'products').toLowerCase()} before they\'re available to everyone.`,
                icon: '⭐'
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
                    backgroundColor: hexColors.primary + '15',
                    borderRadius: radius.full,
                    color: hexColors.primary
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
                backgroundColor: 'transparent',
                color: colors.primary,
                textDecoration: 'none',
                borderRadius: radius.lg,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.lg,
                border: `2px solid ${colors.primary}`
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
            <span style={{ fontSize: '2rem' }}>{term(vertical, 'vendor_section_emoji')}</span>
            <h2 style={{
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
              margin: 0
            }}>
              For {term(vertical, 'vendors')}
            </h2>
          </div>

          <p style={{
            fontSize: typography.sizes.lg,
            color: colors.textSecondary,
            marginBottom: spacing.xl,
            maxWidth: 700
          }}>
            {isFT
              ? 'Run the online side of your food truck business without the complexity. Accept pre-orders, manage your menu, and grow your customer base — we handle the technology.'
              : 'Run the online side of your farmers market business without the complexity. Accept pre-orders, manage your listings, and grow your customer base — we handle the technology.'}
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
              },
              {
                title: 'Analytics Dashboard',
                desc: content.features_page.analytics_feature_desc,
                icon: '📊'
              },
              {
                title: 'Flexible Plans & Tiers',
                desc: content.features_page.tiers_feature_desc,
                icon: '🏷️'
              },
              {
                title: 'Free Trial Period',
                desc: content.features_page.trial_feature_desc,
                icon: '🎁'
              },
              {
                title: 'Events & Special Markets',
                desc: `List your ${term(vertical, 'products').toLowerCase()} at special events, pop-ups, and seasonal ${term(vertical, 'markets').toLowerCase()}.`,
                icon: '🎪'
              },
              {
                title: 'Instant Notifications',
                desc: 'Get push notifications for new orders, confirmations, and important updates. Never miss an order.',
                icon: '🔔'
              },
              {
                title: 'Quality Standards',
                desc: 'Our platform quality checks help maintain high standards and build trust with your customers.',
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
            {isFT ? 'Ready to Skip the Line?' : 'Ready to Shop Local?'}
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
