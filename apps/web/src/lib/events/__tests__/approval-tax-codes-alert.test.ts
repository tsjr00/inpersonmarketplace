/**
 * Approving an event tells the admins its new market needs tax codes.
 *
 * Rule (owner 2026-10-03): every approved event creates a brand-new market
 * with no Texas sales-tax codes, and the checkout tax engine refuses taxable
 * items at a location without verified codes. The admins who can enter the
 * codes must be told at approval — nothing else tells them (the only other
 * sender is the vendor listing-attach route, which event menus never use).
 *
 *  - every admin for the vertical gets ONE `tax_codes_needed_admin` notice
 *    naming the event's market, its date, and the market id to open;
 *  - a non-Texas event is not alerted (the codes card accepts Texas only);
 *  - a notification failure never fails the approval;
 *  - the notice reads as an EVENT notice; the vendor-attach wording is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const H = vi.hoisted(() => ({
  sendNotification: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  adminRecipients: vi.fn<(...args: unknown[]) => Promise<string[]>>(async () => ['admin-1', 'admin-2']),
}))
vi.mock('@/lib/notifications/service', () => ({ sendNotification: H.sendNotification }))
vi.mock('@/lib/notifications/admin-recipients', () => ({ adminRecipientsForVertical: H.adminRecipients }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), init: vi.fn(), withScope: vi.fn() }))

import { approveEventRequest } from '../event-actions'
import { NOTIFICATION_REGISTRY } from '@/lib/notifications/types'

/** A service client that creates the market and its schedule successfully. */
function fakeClient() {
  return {
    from(table: string) {
      if (table === 'markets') {
        return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'market-evt-1' }, error: null }) }) }) }
      }
      if (table === 'market_schedules') {
        return { insert: async () => ({ error: null }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  } as never
}

const REQUEST = {
  id: 'req-1',
  vertical_id: 'food_trucks',
  company_name: 'Acme Co',
  event_date: '2026-11-14',
  event_end_date: null,
  event_start_time: '11:00:00',
  event_end_time: '14:00:00',
  headcount: 120,
  expected_meal_count: null,
  address: '100 Main St',
  city: 'Amarillo',
  state: 'TX',
  zip: '79101',
  vendor_count: 3,
  cuisine_preferences: null,
  event_type: 'corporate_lunch',
  payment_model: null,
}

describe('Event approval alerts the admins that the new event market needs tax codes', () => {
  beforeEach(() => {
    H.sendNotification.mockClear()
    H.adminRecipients.mockClear()
    H.adminRecipients.mockResolvedValue(['admin-1', 'admin-2'])
    H.sendNotification.mockResolvedValue({})
  })

  it('each admin for the vertical gets one notice naming the market, its date and the market to open', async () => {
    const result = await approveEventRequest(fakeClient(), REQUEST)
    expect(result.success).toBe(true)
    expect(H.adminRecipients).toHaveBeenCalledWith(expect.anything(), 'food_trucks')

    const taxCalls = H.sendNotification.mock.calls.filter((c) => c[1] === 'tax_codes_needed_admin')
    expect(taxCalls.map((c) => c[0])).toEqual(['admin-1', 'admin-2'])
    for (const call of taxCalls) {
      expect(call[2]).toMatchObject({
        marketId: 'market-evt-1',
        eventDate: '2026-11-14',
        vertical: 'food_trucks',
        dedupRef: 'market-evt-1',
      })
      expect(String((call[2] as { marketName: string }).marketName)).toContain('Acme Co')
      expect(call[3]).toEqual({ vertical: 'food_trucks' })
    }
  })

  it('a non-Texas event is not alerted — the codes card accepts Texas markets only', async () => {
    const result = await approveEventRequest(fakeClient(), { ...REQUEST, state: 'OK' })
    expect(result.success).toBe(true)
    expect(H.sendNotification).not.toHaveBeenCalled()
  })

  it('"Texas" spelled out counts as Texas', async () => {
    await approveEventRequest(fakeClient(), { ...REQUEST, state: 'Texas' })
    expect(H.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('a notification failure never fails the approval', async () => {
    H.adminRecipients.mockRejectedValueOnce(new Error('admin lookup down'))
    const result = await approveEventRequest(fakeClient(), REQUEST)
    expect(result.success).toBe(true)
    expect(result.market_id).toBe('market-evt-1')
  })

  it('the notice reads as an event notice and opens the market in the admin page', () => {
    const cfg = NOTIFICATION_REGISTRY.tax_codes_needed_admin
    const data = { marketName: 'Acme Co Event', marketId: 'market-evt-1', eventDate: '2026-11-14', vertical: 'food_trucks' }
    expect(cfg.title(data)).toBe('Tax codes needed for a new event — Acme Co Event')
    const message = cfg.message(data)
    expect(message).toContain('Acme Co Event (2026-11-14) was just approved')
    expect(message).toContain('Sales tax jurisdictions card')
    expect(message).not.toContain('vendor')
    expect(cfg.actionUrl?.(data)).toBe('/food_trucks/admin/markets?edit=market-evt-1')
  })

  it('the vendor listing-attach wording is unchanged (no event date → "a vendor is waiting")', () => {
    const cfg = NOTIFICATION_REGISTRY.tax_codes_needed_admin
    const data = { marketName: 'Amarillo Community Market', marketId: 'm-1', itemTitle: 'Tamales', vertical: 'farmers_market' }
    expect(cfg.title(data)).toBe('Tax codes needed at Amarillo Community Market — a vendor is waiting')
    expect(cfg.message(data)).toContain('added "Tamales" at Amarillo Community Market')
  })
})
