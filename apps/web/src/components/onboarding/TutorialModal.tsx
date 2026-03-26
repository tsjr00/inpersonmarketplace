'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

interface TutorialSlide {
  icon: string
  title: string
  description: string
}

interface TutorialModalProps {
  vertical: string
  mode: 'buyer' | 'vendor'
  /** Vendor tutorial phase: 1 = Getting Approved (pre-onboarding), 2 = Your Dashboard (post-onboarding) */
  phase?: 1 | 2
  onComplete: () => void
  onSkip: () => void
}

function getBuyerSlides(vertical: string): TutorialSlide[] {
  return [
    {
      icon: '👋',
      title: `Welcome to ${term(vertical, 'display_name')}!`,
      description: `Connect with local ${term(vertical, 'vendor_people')} in your community. Pre-order ${term(vertical, 'product_examples')} and more — then pick up at your local ${term(vertical, 'traditional_market').toLowerCase()} or directly from the ${term(vertical, 'vendor').toLowerCase()}.`
    },
    {
      icon: '🔍',
      title: 'Start Shopping',
      description: `To find ${term(vertical, 'product_examples')} and more — click "${term(vertical, 'browse_products_cta')}" in the top navigation. Use filters to narrow by category, ${term(vertical, 'vendor').toLowerCase()}, or ${term(vertical, 'market').toLowerCase()}.`
    },
    {
      icon: term(vertical, 'market_icon_emoji'),
      title: `Find ${term(vertical, 'markets')} Near You`,
      description: `Click "${term(vertical, 'markets')}" in the navigation to discover ${term(vertical, 'traditional_markets').toLowerCase()} in your area. Each page shows which ${term(vertical, 'vendors').toLowerCase()} will be there and what ${term(vertical, 'products').toLowerCase()} are available for pre-order.`
    },
    {
      icon: '📍',
      title: 'Choose Your Pickup Location',
      description: `When you add items to your cart, you'll select where and when to pick up. Each ${term(vertical, 'vendor').toLowerCase()} offers specific pickup locations — either at a ${term(vertical, 'traditional_market').toLowerCase()} on ${term(vertical, 'market_day').toLowerCase()}, or at their own ${term(vertical, 'private_pickup').toLowerCase()}.`
    },
    {
      icon: '🛒',
      title: 'Pre-Order & Checkout',
      description: `This is a pre-order marketplace. Add items to your cart, complete checkout, and the ${term(vertical, 'vendor').toLowerCase()} will prepare your order fresh. You'll pay online and pick up at your selected location and time.`
    },
    {
      icon: '📦',
      title: 'Pick Up Your Order',
      description: 'When your order is ready, it will appear in "Ready for Pickup" on your dashboard. Head to your pickup location at the scheduled time — your order will be waiting for you!'
    }
  ]
}

function getVendorSlides(vertical: string): TutorialSlide[] {
  return [
    {
      icon: '🎉',
      title: 'You\'ve Been Preliminarily Approved!',
      description: `Great news — your application to sell on ${term(vertical, 'display_name')} has been preliminarily approved! There are a few more steps before you can publish ${term(vertical, 'listings').toLowerCase()} and start selling. This guide walks you through what's needed.`
    },
    {
      icon: '📋',
      title: 'Verify Your Business',
      description: 'Upload your business formation documents — such as your DBA filing, LLC articles, or sole proprietorship registration. You\'ll also need your Texas sales tax permit number. These are reviewed by our admin team.'
    },
    {
      icon: '📜',
      title: 'Registrations & Certifications',
      description: 'Based on your product categories, you may need specific permits or registrations. Your onboarding checklist will show exactly what\'s required — such as a Cottage Food Registration or DSHS permit. Links to state requirements are included.'
    },
    {
      icon: '🛡️',
      title: 'Certificate of Insurance',
      description: 'A Certificate of Insurance (COI) protects you and your customers. It\'s not required to start selling, but it is required if you want to participate in events. We recommend getting one as your business grows.'
    },
    {
      icon: '🏦',
      title: 'Connect Your Bank Account',
      description: 'Set up Stripe Connect to receive payments. Customers can pay with credit/debit cards, Apple Pay, Google Pay, Cash App, and more — all payments are deposited to your one bank account. Setup takes about 5 minutes.'
    },
    {
      icon: '🚀',
      title: 'What Happens Next',
      description: `Complete these steps in your onboarding checklist on the dashboard. Once your documents are reviewed and approved, you'll be able to publish ${term(vertical, 'listings').toLowerCase()} and start selling to customers in your area!`
    }
  ]
}

function getVendorDashboardSlides(vertical: string): TutorialSlide[] {
  const isFoodTruck = vertical === 'food_trucks'

  return [
    {
      icon: '🎉',
      title: 'You\'re Fully Approved!',
      description: `Congratulations — your account is fully approved and you're ready to sell on ${term(vertical, 'display_name')}! Before you jump in, let's walk through how the system works so your customers can find you, place orders, and pay you.`
    },
    {
      icon: '🔗',
      title: 'How Pre-Orders Work',
      description: `${term(vertical, 'display_name')} is a pre-order marketplace. For a customer to purchase from you, three things must be connected: a location (where they pick it up), a schedule (when it's available), and a ${term(vertical, 'listing').toLowerCase()} (what you're selling). Let's walk through each one.`
    },
    {
      icon: '📍',
      title: 'Add Your Locations',
      description: `Start by adding the places where customers pick up orders — a ${isFoodTruck ? 'food truck stop' : 'market'} you attend, or a private pickup at your ${isFoodTruck ? 'kitchen' : 'farm'}. Each location needs an address so customers can find you. Your plan includes multiple locations, and you can upgrade anytime if you need more.`
    },
    {
      icon: '🕐',
      title: 'Set Your Schedule',
      description: isFoodTruck
        ? 'For each location, set the hours you\'re open. Your schedule determines when customers can place orders AND when they can pick up. If you\'re open 11am\u20132pm, customers choose a pickup time within those hours. When you\'re closed, your menu is unavailable for new orders \u2014 but customers can still browse and see what\'s available when you\'re open again. For event-approved vendors, catering orders are also available and can come in multiple days in advance.'
        : 'Each market has set hours that customers see. Orders automatically close 18 hours before market time (or 10 hours for private pickups) \u2014 giving you time to prepare without scrambling at the last minute to fill surprise orders. Customers place orders before the cutoff, then pick up during your scheduled hours.'
    },
    {
      icon: '📝',
      title: `Create Your ${term(vertical, 'listings')}`,
      description: `Now that your locations and schedules are set, create your ${term(vertical, 'listings').toLowerCase()}. Each ${isFoodTruck ? 'menu item' : 'product'} gets a photo, description, price, and inventory count. Connect each ${term(vertical, 'listing').toLowerCase()} to the locations where you sell it \u2014 one location or many. You can also choose to sell certain items only at certain locations. This flexibility lets you tailor what's available at each spot.`
    },
    {
      icon: '💰',
      title: 'Get Paid with Stripe',
      description: 'Stripe Connect is how you receive payments. Customers can pay with cards, Apple Pay, Google Pay, Cash App, and more \u2014 all deposited to your one bank account. Without Stripe connected, customers can\'t check out. This is the final piece that makes everything work.'
    },
    {
      icon: '🚀',
      title: 'Let\'s Go!',
      description: `To recap: add your locations, set your schedules, create ${term(vertical, 'listings').toLowerCase()} and connect them, and connect Stripe. Once these pieces are in place, customers in your area can find your ${term(vertical, 'products').toLowerCase()}, place pre-orders, and pay \u2014 no more chasing payments or juggling social media updates. Orders appear on your dashboard ready to fulfill.`
    }
  ]
}

export default function TutorialModal({ vertical, mode, phase = 1, onComplete, onSkip }: TutorialModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  const getSlides = () => {
    if (mode === 'buyer') return getBuyerSlides(vertical)
    if (phase === 2) return getVendorDashboardSlides(vertical)
    return getVendorSlides(vertical)
  }
  const slides = getSlides()

  const isLastSlide = currentSlide === slides.length - 1
  const isFirstSlide = currentSlide === 0

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onSkip])

  const handleNext = () => {
    if (isLastSlide) {
      onComplete()
    } else {
      setCurrentSlide(prev => prev + 1)
    }
  }

  const handlePrev = () => {
    if (!isFirstSlide) {
      setCurrentSlide(prev => prev - 1)
    }
  }

  const slide = slides[currentSlide]

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: spacing.md
    }}>
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.xl,
        boxShadow: shadows.xl,
        maxWidth: 480,
        width: '100%',
        overflow: 'hidden',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        {/* Header with skip button (buyers only) */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `${spacing.sm} ${spacing.md}`,
          borderBottom: `1px solid ${colors.border}`
        }}>
          <span style={{
            fontSize: typography.sizes.xs,
            color: colors.textMuted
          }}>
            {currentSlide + 1} of {slides.length}
          </span>
          {mode === 'buyer' ? (
            <button
              onClick={onSkip}
              style={{
                background: 'none',
                border: 'none',
                color: colors.textMuted,
                fontSize: typography.sizes.sm,
                cursor: 'pointer',
                padding: spacing['2xs']
              }}
            >
              Skip tutorial
            </button>
          ) : (
            <span style={{
              fontSize: typography.sizes.xs,
              color: colors.textMuted
            }}>
              {phase === 2 ? 'Your Dashboard' : 'Getting Approved'}
            </span>
          )}
        </div>

        {/* Slide content */}
        <div style={{
          padding: spacing.lg,
          textAlign: 'center'
        }}>
          {/* Icon */}
          <div style={{
            fontSize: '4rem',
            marginBottom: spacing.md,
            lineHeight: 1
          }}>
            {slide.icon}
          </div>

          {/* Title */}
          <h2 style={{
            margin: `0 0 ${spacing.sm}`,
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary
          }}>
            {slide.title}
          </h2>

          {/* Description */}
          <p style={{
            margin: 0,
            fontSize: typography.sizes.base,
            color: colors.textSecondary,
            lineHeight: typography.leading.relaxed
          }}>
            {slide.description}
          </p>
        </div>

        {/* Progress dots */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: spacing['2xs'],
          padding: `0 ${spacing.md} ${spacing.sm}`
        }}>
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              style={{
                width: 8,
                height: 8,
                borderRadius: radius.full,
                border: 'none',
                backgroundColor: index === currentSlide ? colors.primary : colors.border,
                cursor: 'pointer',
                padding: 0,
                transition: 'background-color 0.2s'
              }}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div style={{
          display: 'flex',
          gap: spacing.sm,
          padding: spacing.md,
          borderTop: `1px solid ${colors.border}`
        }}>
          <button
            onClick={handlePrev}
            disabled={isFirstSlide}
            style={{
              flex: 1,
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: isFirstSlide ? colors.surfaceMuted : colors.surfaceElevated,
              color: isFirstSlide ? colors.textMuted : colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              cursor: isFirstSlide ? 'not-allowed' : 'pointer',
              opacity: isFirstSlide ? 0.5 : 1
            }}
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            style={{
              flex: 1,
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              border: 'none',
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer'
            }}
          >
            {isLastSlide ? 'Get Started!' : 'Next'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  )
}
