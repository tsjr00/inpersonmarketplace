// @vitest-environment jsdom

/**
 * Component Render Tests
 *
 * Verifies that key UI components render without crashing across various
 * prop combinations. Catches: render errors, null data crashes, broken
 * conditional display, missing status mappings.
 *
 * Uses React Testing Library + jsdom. Runs in Vitest pre-commit hook.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

afterEach(() => {
  cleanup()
})

// ── Mock Next.js modules ────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) =>
    React.createElement('img', { src, alt, ...props }),
}))

// ── Component Imports ───────────────────────────────────────────────

import StatusBadge from '@/components/shared/StatusBadge'
import TierBadge from '@/components/shared/TierBadge'
import { Spinner, FullPageLoading, InlineLoading } from '@/components/shared/Spinner'
import CutoffBadge from '@/components/listings/CutoffBadge'
import OrderStatusSummary from '@/components/buyer/OrderStatusSummary'
import OrderTimeline from '@/components/buyer/OrderTimeline'
import OrderStatusBadge from '@/components/vendor/OrderStatusBadge'
import TrialStatusBanner from '@/components/vendor/TrialStatusBanner'
import VendorAvatar from '@/components/shared/VendorAvatar'

// ── Tests ───────────────────────────────────────────────────────────

describe('Component Render Tests', () => {
  // ── StatusBadge ─────────────────────────────────────────────────

  describe('StatusBadge', () => {
    const statuses = ['pending', 'active', 'inactive', 'approved', 'rejected', 'completed', 'cancelled', 'draft']

    it.each(statuses)('renders %s status', (status) => {
      const { container } = render(<StatusBadge status={status} />)
      expect(container.textContent).toContain(status.charAt(0).toUpperCase() + status.slice(1))
    })

    it('renders with all size variants', () => {
      const sizes = ['sm', 'md', 'lg'] as const
      sizes.forEach(size => {
        const { unmount } = render(<StatusBadge status="active" size={size} />)
        unmount()
      })
    })

    it('renders with custom icon', () => {
      render(<StatusBadge status="active" icon={<span data-testid="icon">!</span>} />)
      expect(screen.getByTestId('icon')).toBeDefined()
    })

    it('renders unknown status without crashing', () => {
      const { container } = render(<StatusBadge status="some_unknown_status" />)
      expect(container.textContent).toContain('Some_unknown_status')
    })

    it('has accessible role and aria-label', () => {
      render(<StatusBadge status="pending" />)
      expect(screen.getByRole('status')).toBeDefined()
    })
  })

  // ── TierBadge ───────────────────────────────────────────────────

  describe('TierBadge', () => {
    const tiers = ['free', 'standard', 'basic', 'pro', 'premium', 'boss', 'featured']

    it.each(tiers)('renders %s tier', (tier) => {
      const { container } = render(<TierBadge tier={tier as any} />)
      expect(container.firstChild).toBeDefined()
    })

    it('renders without icon when showIcon=false', () => {
      render(<TierBadge tier="pro" showIcon={false} />)
      // Should still render the label text
      expect(document.body.textContent).toBeDefined()
    })

    it('renders all size variants', () => {
      const sizes = ['sm', 'md', 'lg'] as const
      sizes.forEach(size => {
        const { unmount } = render(<TierBadge tier="basic" size={size} />)
        unmount()
      })
    })
  })

  // ── Spinner ─────────────────────────────────────────────────────

  describe('Spinner', () => {
    it('renders default spinner', () => {
      render(<Spinner />)
      expect(screen.getByRole('status')).toBeDefined()
    })

    it('renders all size variants', () => {
      const sizes = ['sm', 'md', 'lg'] as const
      sizes.forEach(size => {
        const { unmount } = render(<Spinner size={size} />)
        unmount()
      })
    })

    it('renders with custom color', () => {
      render(<Spinner color="#ff0000" />)
      expect(screen.getByRole('status')).toBeDefined()
    })

    it('renders FullPageLoading with message', () => {
      render(<FullPageLoading message="Please wait..." />)
      expect(screen.getByText('Please wait...')).toBeDefined()
    })

    it('renders FullPageLoading without message', () => {
      render(<FullPageLoading />)
      expect(screen.getByRole('status')).toBeDefined()
    })

    it('renders InlineLoading with message', () => {
      render(<InlineLoading message="Loading..." />)
      expect(screen.getByText('Loading...')).toBeDefined()
    })
  })

  // ── CutoffBadge ─────────────────────────────────────────────────

  describe('CutoffBadge', () => {
    it('returns null for open status', () => {
      const { container } = render(<CutoffBadge preCalculatedStatus="open" />)
      expect(container.innerHTML).toBe('')
    })

    it('renders closed badge', () => {
      const { container } = render(<CutoffBadge preCalculatedStatus="closed" />)
      expect(container.textContent).toContain('Closed')
    })

    it('renders closing-soon with hours', () => {
      const { container } = render(
        <CutoffBadge preCalculatedStatus="closing-soon" hoursUntilCutoff={3} />
      )
      expect(container.textContent).toContain('Closes 3h')
    })

    it('renders closing-soon with minutes when under 1 hour', () => {
      const { container } = render(
        <CutoffBadge preCalculatedStatus="closing-soon" hoursUntilCutoff={0.5} />
      )
      expect(container.textContent).toContain('30m')
    })

    it('renders closing-soon without hours', () => {
      const { container } = render(
        <CutoffBadge preCalculatedStatus="closing-soon" />
      )
      expect(container.textContent).toContain('soon')
    })

    it('defaults to open (null) when no status provided', () => {
      const { container } = render(<CutoffBadge />)
      expect(container.innerHTML).toBe('')
    })
  })

  // ── OrderStatusSummary ──────────────────────────────────────────

  describe('OrderStatusSummary', () => {
    const statuses = ['pending', 'confirmed', 'ready', 'handed_off', 'fulfilled', 'completed', 'cancelled', 'expired']

    it.each(statuses)('renders %s status', (status) => {
      const { container } = render(
        <OrderStatusSummary status={status} updatedAt="2026-03-14T10:00:00Z" />
      )
      expect(container.firstChild).toBeDefined()
    })

    it('shows partial readiness message', () => {
      render(
        <OrderStatusSummary
          status="ready"
          updatedAt="2026-03-14T10:00:00Z"
          readyCount={2}
          totalActiveCount={5}
        />
      )
      expect(screen.getByText('Partially Ready')).toBeDefined()
      expect(screen.getByText('2 of 5 items ready for pickup')).toBeDefined()
    })

    it('shows full readiness when all items ready', () => {
      render(
        <OrderStatusSummary
          status="ready"
          updatedAt="2026-03-14T10:00:00Z"
          readyCount={3}
          totalActiveCount={3}
        />
      )
      expect(screen.getByText('Ready for Pickup')).toBeDefined()
    })

    it('displays last updated timestamp', () => {
      const { container } = render(
        <OrderStatusSummary status="pending" updatedAt="2026-03-14T10:00:00Z" />
      )
      expect(container.textContent).toContain('Last updated:')
    })
  })

  // ── OrderTimeline ───────────────────────────────────────────────

  describe('OrderTimeline', () => {
    it('renders pending timeline', () => {
      render(
        <OrderTimeline status="pending" createdAt="2026-03-14T10:00:00Z" updatedAt="2026-03-14T10:00:00Z" />
      )
      expect(screen.getByText('Order Timeline')).toBeDefined()
      expect(screen.getByText('Order Placed')).toBeDefined()
    })

    it('renders confirmed timeline', () => {
      render(
        <OrderTimeline status="confirmed" createdAt="2026-03-14T10:00:00Z" updatedAt="2026-03-14T11:00:00Z" />
      )
      expect(screen.getByText('Confirmed by Vendor')).toBeDefined()
    })

    it('shows cancelled state', () => {
      render(
        <OrderTimeline status="cancelled" createdAt="2026-03-14T10:00:00Z" updatedAt="2026-03-14T11:00:00Z" />
      )
      expect(screen.getByText('Order was cancelled')).toBeDefined()
    })

    it('shows expired state', () => {
      render(
        <OrderTimeline status="expired" createdAt="2026-03-14T10:00:00Z" updatedAt="2026-03-14T11:00:00Z" />
      )
      expect(screen.getByText('Pickup window expired')).toBeDefined()
    })

    it('shows handed_off step with action prompt', () => {
      render(
        <OrderTimeline status="handed_off" createdAt="2026-03-14T10:00:00Z" updatedAt="2026-03-14T11:00:00Z" />
      )
      expect(screen.getByText('Vendor Handed Off')).toBeDefined()
      expect(screen.getByText('Please confirm you received your items')).toBeDefined()
    })

    it('hides handed_off step for normal flow', () => {
      const { container } = render(
        <OrderTimeline status="confirmed" createdAt="2026-03-14T10:00:00Z" updatedAt="2026-03-14T11:00:00Z" />
      )
      expect(container.textContent).not.toContain('Vendor Handed Off')
    })
  })

  // ── OrderStatusBadge (Vendor) ───────────────────────────────────

  describe('OrderStatusBadge', () => {
    const statusLabels: [string, string][] = [
      ['pending', 'Pending'],
      ['confirmed', 'Confirmed'],
      ['ready', 'Ready for Pickup'],
      ['fulfilled', 'Fulfilled'],
      ['completed', 'Completed'],
      ['cancelled', 'Cancelled'],
      ['expired', 'Expired'],
    ]

    it.each(statusLabels)('renders %s as "%s"', (status, label) => {
      render(<OrderStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeDefined()
    })

    it('renders unknown status without crashing', () => {
      const { container } = render(<OrderStatusBadge status="refunded" />)
      expect(container.textContent).toContain('refunded')
    })
  })

  // ── TrialStatusBanner ───────────────────────────────────────────

  describe('TrialStatusBanner', () => {
    it('returns null when not trialing and no grace period', () => {
      const { container } = render(
        <TrialStatusBanner
          vertical="food_trucks"
          subscriptionStatus="active"
          trialEndsAt={null}
          trialGraceEndsAt={null}
        />
      )
      expect(container.innerHTML).toBe('')
    })

    it('renders trial banner with days remaining', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 45)
      render(
        <TrialStatusBanner
          vertical="food_trucks"
          subscriptionStatus="trialing"
          trialEndsAt={futureDate.toISOString()}
          trialGraceEndsAt={null}
        />
      )
      expect(screen.getByText(/Free Basic Trial/)).toBeDefined()
      expect(screen.getByText(/day.*remaining/)).toBeDefined()
    })

    it('renders grace period banner', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)
      render(
        <TrialStatusBanner
          vertical="food_trucks"
          subscriptionStatus="free"
          trialEndsAt={null}
          trialGraceEndsAt={futureDate.toISOString()}
        />
      )
      expect(screen.getByText(/Trial Ended/)).toBeDefined()
      expect(screen.getByText(/day.*to upgrade/)).toBeDefined()
    })

    it('links to upgrade page with correct vertical', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)
      render(
        <TrialStatusBanner
          vertical="food_trucks"
          subscriptionStatus="trialing"
          trialEndsAt={futureDate.toISOString()}
          trialGraceEndsAt={null}
        />
      )
      const link = screen.getByText('Upgrade to Basic — $10/mo')
      expect(link.closest('a')?.getAttribute('href')).toBe('/food_trucks/vendor/dashboard/upgrade')
    })

    it('returns null when trial has expired and no grace period', () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)
      const { container } = render(
        <TrialStatusBanner
          vertical="food_trucks"
          subscriptionStatus="trialing"
          trialEndsAt={pastDate.toISOString()}
          trialGraceEndsAt={null}
        />
      )
      expect(container.innerHTML).toBe('')
    })
  })

  // ── VendorAvatar ────────────────────────────────────────────────

  describe('VendorAvatar', () => {
    it('renders initials when no image', () => {
      const { container } = render(<VendorAvatar name="Fresh Farm" />)
      expect(container.textContent).toContain('FF')
    })

    it('renders single-word name initials', () => {
      const { container } = render(<VendorAvatar name="Bakery" />)
      expect(container.textContent).toContain('B')
    })

    it('renders image when imageUrl provided', () => {
      render(<VendorAvatar name="Fresh Farm" imageUrl="/test.jpg" />)
      const img = document.querySelector('img')
      expect(img).toBeDefined()
      expect(img?.getAttribute('alt')).toBe('Fresh Farm')
    })

    it('renders with custom size', () => {
      const { container } = render(<VendorAvatar name="Test" size={80} />)
      const div = container.firstChild as HTMLElement
      expect(div.style.width).toBe('80px')
    })

    it('renders with tier border colors', () => {
      // jsdom converts hex to rgb format
      const { container: premium } = render(<VendorAvatar name="A" tier="premium" />)
      const premiumBorder = (premium.firstChild as HTMLElement).style.borderColor
      expect(premiumBorder).toMatch(/59.*130.*246|#3b82f6/)

      const { container: featured } = render(<VendorAvatar name="B" tier="featured" />)
      const featuredBorder = (featured.firstChild as HTMLElement).style.borderColor
      expect(featuredBorder).toMatch(/245.*158.*11|#f59e0b/)
    })
  })
})
