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
      icon: '🧺',
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
      title: `Welcome, ${term(vertical, 'vendor')}!`,
      description: `You're ready to start selling on ${term(vertical, 'display_name')}! This quick guide will show you how to set up your shop, create ${term(vertical, 'listings').toLowerCase()}, and manage orders from local customers.`
    },
    {
      icon: '📝',
      title: `Create Your First ${term(vertical, 'listing')}`,
      description: `Click "${term(vertical, 'my_listings_nav')}" then "${term(vertical, 'create_listing_cta')}" to add your first ${term(vertical, 'product').toLowerCase()}. Add a clear photo, description, pricing, and set your available inventory. You can save as draft or publish immediately.`
    },
    {
      icon: '📍',
      title: 'Set Your Pickup Locations',
      description: `Go to "My ${term(vertical, 'markets')}" to connect with ${term(vertical, 'traditional_markets').toLowerCase()} where you sell, or set up a ${term(vertical, 'private_pickup').toLowerCase()} at your ${term(vertical, 'vendor_location')}. Customers will choose from your available pickup options at checkout.`
    },
    {
      icon: '🔔',
      title: 'Manage Incoming Orders',
      description: `When a customer places an order, you'll see it in "Orders" on your dashboard. Review the order details, confirm it to let the customer know you're preparing it, then mark it "Ready" when it's packed for pickup.`
    },
    {
      icon: '📦',
      title: 'Prepare for Pickup Day',
      description: `On ${term(vertical, 'market_day').toLowerCase()} or your scheduled pickup time, bring the confirmed orders. Customers will come to collect their pre-paid items. Mark orders as "Picked Up" once the customer has them.`
    },
    {
      icon: '📊',
      title: 'Track Your Performance',
      description: 'Visit "Analytics" to see your sales trends, top-selling products, and customer insights. Use this data to understand what\'s working and grow your business on the platform.'
    }
  ]
}

export default function TutorialModal({ vertical, mode, onComplete, onSkip }: TutorialModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const slides = mode === 'vendor' ? getVendorSlides(vertical) : getBuyerSlides(vertical)

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
              Vendor Guide
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
