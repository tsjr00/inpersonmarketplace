import { Metadata } from 'next'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows, getVerticalColors } from '@/lib/design-tokens'
import { Footer } from '@/components/landing'
import { term, getContent } from '@/lib/vertical'
import { breadcrumbJsonLd } from '@/lib/marketing/json-ld'
import { getLocale } from '@/lib/locale/server'
import { t } from '@/lib/locale/messages'

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
  const locale = await getLocale()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const content = getContent(vertical, locale)
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
          {isFT ? t('features.hero_title_ft', locale) : t('features.hero_title_fm', locale)}
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
            {isFT ? t('features.promise_title_ft', locale) : t('features.promise_title_fm', locale)}
          </h2>
          <p style={{
            fontSize: typography.sizes.lg,
            color: colors.textSecondary,
            maxWidth: 600,
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            {isFT
              ? t('features.promise_desc_ft', locale)
              : t('features.promise_desc_fm', locale)}
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: spacing.lg
        }}>
          {[
            { icon: '3️⃣', title: t('features.three_clicks', locale), desc: t('features.three_clicks_desc', locale) },
            { icon: '📱', title: t('features.any_device', locale), desc: t('features.any_device_desc', locale) },
            { icon: '🔒', title: t('features.secure_payments', locale), desc: t('features.secure_payments_desc', locale) },
            { icon: '📍', title: t('features.local_only', locale), desc: t('features.local_only_desc', locale) }
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
              {t('features.for_shoppers', locale)}
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: spacing.lg
          }}>
            {[
              {
                title: t('features.never_miss', locale),
                desc: content.features_page.shopper_preorder_desc,
                icon: '✓'
              },
              {
                title: t('features.skip_lines', locale),
                desc: content.features_page.shopper_skip_lines_desc,
                icon: '⚡'
              },
              {
                title: t('features.shop_schedule', locale),
                desc: t('features.shop_schedule_desc', locale),
                icon: '🕐'
              },
              {
                title: t('features.know_vendors', locale),
                desc: t('features.know_vendors_desc', locale),
                icon: '👤'
              },
              {
                title: t('features.order_updates', locale),
                desc: t('features.order_updates_desc', locale),
                icon: '🔔'
              },
              {
                title: t('features.support_local', locale),
                desc: t('features.support_local_desc', locale),
                icon: '❤️'
              },
              {
                title: `${term(vertical, 'market_boxes', locale)}`,
                desc: content.features_page.subscription_feature_desc,
                icon: '📦'
              },
              {
                title: t('features.favorite_vendors', locale),
                desc: t('features.favorite_vendors_desc', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() }),
                icon: '❤️'
              },
              ...(vertical === 'food_trucks' ? [{
                title: t('features.tips_checkout', locale),
                desc: t('features.tips_checkout_desc', locale, { vendor: term(vertical, 'vendor', locale).toLowerCase() }),
                icon: '💝'
              }] : []),
              {
                title: t('features.buyer_premium', locale),
                desc: t('features.buyer_premium_desc', locale, { products: term(vertical, 'products', locale).toLowerCase() }),
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
              {t('features.start_shopping', locale)}
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
            <span style={{ fontSize: '2rem' }}>{term(vertical, 'vendor_section_emoji', locale)}</span>
            <h2 style={{
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
              margin: 0
            }}>
              {t('footer.for_vendors', locale)}
            </h2>
          </div>

          <p style={{
            fontSize: typography.sizes.lg,
            color: colors.textSecondary,
            marginBottom: spacing.xl,
            maxWidth: 700
          }}>
            {isFT
              ? t('features.vendor_desc_ft', locale)
              : t('features.vendor_desc_fm', locale)}
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: spacing.lg
          }}>
            {[
              {
                title: t('features.setup_minutes', locale),
                desc: t('features.setup_minutes_desc', locale),
                icon: '⏱️'
              },
              {
                title: t('features.product_mgmt', locale),
                desc: t('features.product_mgmt_desc', locale),
                icon: '📦'
              },
              {
                title: t('features.know_before', locale),
                desc: t('features.know_before_desc', locale),
                icon: '📋'
              },
              {
                title: t('features.auto_cutoff', locale),
                desc: t('features.auto_cutoff_desc', locale),
                icon: '⏰'
              },
              {
                title: t('features.get_paid', locale),
                desc: t('features.get_paid_desc', locale),
                icon: '💰'
              },
              {
                title: t('features.build_loyalty', locale),
                desc: t('features.build_loyalty_desc', locale),
                icon: '⭐'
              },
              {
                title: t('features.pickup_options', locale),
                desc: content.features_page.vendor_pickup_desc,
                icon: '📍'
              },
              {
                title: t('features.realtime_orders', locale),
                desc: t('features.realtime_orders_desc', locale),
                icon: '✅'
              },
              {
                title: t('features.analytics', locale),
                desc: content.features_page.analytics_feature_desc,
                icon: '📊'
              },
              {
                title: t('features.plans_tiers', locale),
                desc: content.features_page.tiers_feature_desc,
                icon: '🏷️'
              },
              {
                title: t('features.free_trial', locale),
                desc: content.features_page.trial_feature_desc,
                icon: '🎁'
              },
              {
                title: t('features.events', locale),
                desc: t('features.events_desc', locale, { products: term(vertical, 'products', locale).toLowerCase(), markets: term(vertical, 'markets', locale).toLowerCase() }),
                icon: '🎪'
              },
              {
                title: t('features.notifications', locale),
                desc: t('features.notifications_desc', locale),
                icon: '🔔'
              },
              {
                title: t('features.quality', locale),
                desc: t('features.quality_desc', locale),
                icon: '✅'
              },
              ...(vertical !== 'food_trucks' ? [{
                title: t('features.cottage_food', locale),
                desc: t('features.cottage_food_desc', locale),
                icon: '🏠'
              }] : [])
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
              {term(vertical, 'vendor_signup_cta', locale)}
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
            {isFT ? t('features.ready_ft', locale) : t('features.ready_fm', locale)}
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
                {t('features.place_order', locale)}
              </p>
            </div>
            <div>
              <div style={{
                fontSize: '2.5rem',
                marginBottom: spacing.sm
              }}>3</div>
              <p style={{ fontSize: typography.sizes.lg, margin: 0 }}>
                {t('features.pickup_convenience', locale)}
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
              {t('features.shop_now', locale)}
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
              {t('features.start_selling', locale)}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer vertical={vertical} locale={locale} />
    </div>
  )
}
