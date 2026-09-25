'use client'

import Link from 'next/link'
import { colors, statusColors } from '@/lib/design-tokens'
import { computeMarketSteps, type MarketStepKey } from '@/lib/vendor/market-steps'
import type { Market } from './types'

/**
 * The vendor Markets card's action row, in the order the work happens
 * (owner 2026-09-25, OB-030 (f)): Apply → Set Schedule → Book → Manage
 * Listings → Prep Sheet. Each button carries its step number; a finished step
 * shows ✓; the next step is the one filled button, marked "Next". Numbers, not
 * arrows: the row wraps on phones and an arrow at a line end points at nothing.
 * The sequence itself is lib/vendor/market-steps.ts.
 */
export default function MarketStepButtons({
  market,
  vertical,
  onSetSchedule,
  onManageListings,
}: {
  market: Market
  vertical: string
  onSetSchedule: () => void
  onManageListings: () => void
}) {
  const isFoodTruck = vertical === 'food_trucks'
  const { steps, awaitingApproval } = computeMarketSteps({
    isManaged: market.isManaged === true,
    rosterStatus: market.rosterStatus ?? null,
    hasAttendance: market.hasAttendance === true,
    hasListings: market.hasListings === true,
    bookable: market.bookable === true,
    bookDone: market.bookDone ?? null,
  })

  const label = (key: MarketStepKey): string => {
    switch (key) {
      case 'apply': return awaitingApproval ? 'Application sent' : 'Apply'
      case 'schedule': return market.hasAttendance ? 'Manage Schedule' : 'Set Schedule'
      case 'book': return isFoodTruck ? 'Book a Spot' : 'Book a Booth Space'
      case 'listings': return 'Manage Listings'
      case 'prep': return '📋 Prep Sheet'
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {steps.map((s) => {
        const style = {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          backgroundColor: s.isNext ? colors.primary : 'transparent',
          color: s.isNext ? 'white' : s.done ? statusColors.success : colors.primary,
          border: `1px solid ${s.isNext ? colors.primary : s.done ? statusColors.success : colors.primary}`,
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          cursor: 'pointer',
        } as const
        const content = (
          <>
            <span aria-hidden style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 18, height: 18, borderRadius: 9, fontSize: 11, fontWeight: 700,
              backgroundColor: s.isNext ? 'white' : 'transparent',
              color: s.isNext ? colors.primary : 'inherit',
              border: s.isNext ? 'none' : '1px solid currentColor',
            }}>
              {s.done ? '✓' : s.number}
            </span>
            {s.isNext && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>NEXT:</span>}
            {label(s.key)}
          </>
        )
        const title = `Step ${s.number}${s.done ? ' — done' : s.isNext ? ' — do this next' : ''}`
        if (s.key === 'apply') {
          return <Link key={s.key} href={`/${vertical}/markets/${market.id}`} style={style} title={title}>{content}</Link>
        }
        if (s.key === 'book') {
          return <Link key={s.key} href={`/${vertical}/markets/${market.id}/${isFoodTruck ? 'book-spot' : 'book'}`} style={style} title={title}>{content}</Link>
        }
        if (s.key === 'prep') {
          return <Link key={s.key} href={`/${vertical}/vendor/markets/${market.id}/prep`} style={style} title={title}>{content}</Link>
        }
        return (
          <button key={s.key} type="button" onClick={s.key === 'schedule' ? onSetSchedule : onManageListings} style={style} title={title}>
            {content}
          </button>
        )
      })}
    </div>
  )
}
