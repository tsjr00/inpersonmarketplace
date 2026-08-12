/**
 * ORDER-PLACED CONFIRMATION MESSAGE
 *
 * T-05, found by owner testing 2026-08-10 (order FA-2026-69424470): a buyer
 * paid for items from TWO markets and the confirmation email described one,
 * leaving no record of where the rest of the order was.
 *
 * A cart may legitimately span markets — the buyer acknowledges exactly that at
 * checkout — so the confirmation has to name every pickup. These test the
 * rendered message, not the source, because the defect was in what a buyer read.
 */
import { describe, it, expect } from 'vitest'
import { NOTIFICATION_REGISTRY } from '../types'

const render = (data: Record<string, unknown>, locale = 'en') =>
  NOTIFICATION_REGISTRY.order_placed.message(data, locale)

const TWO_PICKUPS = [
  {
    marketName: 'Canyon Farmers Market',
    marketAddress: '100 Canyon Dr, Amarillo, TX',
    pickupDate: 'Saturday, September 12, 2026',
    pickupTime: '9:00 AM',
  },
  {
    marketName: 'Westgate Mall Farmers Market',
    marketAddress: '7701 W Interstate 40, Amarillo, TX',
    pickupDate: 'Sunday, September 13, 2026',
    pickupTime: '2:00 PM',
  },
]

describe('order_placed confirmation message', () => {
  it('names EVERY market when the order spans more than one pickup', () => {
    const msg = render({
      orderNumber: 'FA-2026-69424470',
      vendorName: '2 vendors',
      brandName: 'Farmers Marketing',
      pickups: TWO_PICKUPS,
      vertical: 'farmers_market',
    })
    for (const p of TWO_PICKUPS) {
      expect(msg, `must name ${p.marketName}`).toContain(p.marketName)
      expect(msg, `must give the address for ${p.marketName}`).toContain(p.marketAddress)
      expect(msg, `must give the time for ${p.marketName}`).toContain(p.pickupTime)
    }
    expect(msg, 'must say how many locations').toContain('2 pickup locations')
  })

  it('leaves no unfilled token in the multi-pickup message', () => {
    // The whole message reaches a real inbox. A literal {token} is a defect
    // a buyer sees (cf. T-42).
    const msg = render({
      orderNumber: 'X', vendorName: 'V', brandName: 'B',
      pickups: TWO_PICKUPS, vertical: 'farmers_market',
    })
    expect(msg).not.toMatch(/\{\w+\}/)
  })

  it('single-pickup orders render exactly as before — no `pickups` key', () => {
    // The common case must not churn: `pickups` is only sent when the order
    // genuinely spans locations, so this path is the untouched original.
    const msg = render({
      orderNumber: 'FO-1', vendorName: 'Smokestack BBQ', brandName: "Food Truck'n",
      marketName: 'Test Event', marketAddress: '1200 Streit Dr, Amarillo, TX',
      pickupTime: '12:30 PM', pickupDate: 'Thursday, September 10, 2026',
      vertical: 'food_trucks',
    })
    expect(msg).toContain('Test Event')
    expect(msg).toContain('12:30 PM')
    expect(msg).not.toContain('pickup locations')
    expect(msg).not.toMatch(/\{\w+\}/)
  })

  it('a single-element pickups array still uses the single-pickup wording', () => {
    // Guards the boundary: "more than one", not "present".
    const msg = render({
      orderNumber: 'FO-1', vendorName: 'V', brandName: 'B',
      marketName: 'Only Market', marketAddress: 'A',
      pickupTime: '10:00 AM', pickupDate: 'Monday',
      pickups: [TWO_PICKUPS[0]!], vertical: 'food_trucks',
    })
    expect(msg).not.toContain('pickup locations')
    expect(msg).toContain('Only Market')
  })

  it('renders the multi-pickup message in Spanish too', () => {
    const msg = render({
      orderNumber: 'X', vendorName: 'V', brandName: 'B',
      pickups: TWO_PICKUPS, vertical: 'farmers_market',
    }, 'es')
    expect(msg, 'must be the Spanish catalogue entry').toContain('lugares de recogida')
    expect(msg).toContain('Canyon Farmers Market')
    expect(msg).toContain('Westgate Mall Farmers Market')
    expect(msg).not.toMatch(/\{\w+\}/)
  })
})
