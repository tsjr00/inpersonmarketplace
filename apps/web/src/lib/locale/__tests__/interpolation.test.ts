/**
 * t() INTERPOLATION
 *
 * T-42, found by owner testing 2026-08-11: a buyer's order-confirmation email
 * arrived reading "confirmed by {vendorName}" — the literal token. Cause was
 * `msg.replace('{k}', v)`, which with a STRING pattern substitutes only the
 * FIRST occurrence. Five messages across en + es repeat a token, including the
 * Spanish plural suffix on market counts.
 *
 * These are behavioural tests against the real message catalogue, not source
 * assertions — the catalogue is where the repeated tokens actually live.
 */
import { describe, it, expect } from 'vitest'
import { t } from '../messages'
import { en } from '../messages/en'
import { es } from '../messages/es'

describe('t() interpolation', () => {
  it('fills EVERY occurrence of a repeated token, not just the first', () => {
    // The exact defect. Before the fix this returned "A ... {x}".
    const msg = t('notif.order_placed_msg', 'en', {
      brandName: 'Food Truck\'n',
      orderNumber: 'FO-2026-55913356',
      vendorName: 'Smokestack BBQ',
      marketName: 'Test Event',
      marketAddress: '1200 Streit Dr, Amarillo, TX',
      pickupTime: '12:30 PM',
      pickupDate: 'Thursday, September 10, 2026',
      signOff: 'Thanks again!',
    })
    expect(msg, 'no token may survive into a sent email').not.toMatch(/\{\w+\}/)
    // {vendorName} appears twice in this template; both must be filled.
    expect(msg.match(/Smokestack BBQ/g)?.length).toBe(2)
  })

  it('treats $ sequences in the VALUE as literal text', () => {
    // Why split/join and not replaceAll: with a string replacement, both
    // replace and replaceAll interpret $&, $', $` and $1 in the replacement.
    // These values are user data — vendor names, market names, buyer names.
    const msg = t('notif.order_placed_msg', 'en', {
      brandName: 'B',
      orderNumber: '1',
      vendorName: "Bob's $5 Tacos",
      marketName: 'M',
      marketAddress: 'A',
      pickupTime: 'T',
      pickupDate: 'D',
      signOff: 'S',
    })
    expect(msg, 'a $ in a vendor name must not be interpreted').toContain("Bob's $5 Tacos")
    expect(msg).not.toContain('$&')
  })

  it("fills the Spanish market-count plural suffix in both places", () => {
    // es markets.found / markets.found_within repeat {s}. Half-pluralised
    // Spanish shipped for as long as those strings have existed.
    for (const key of ['markets.found', 'markets.found_within']) {
      if (!es[key]) continue
      const tokens = [...es[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)
      const vars = Object.fromEntries(tokens.map((k) => [k, k === 's' ? 's' : 'X']))
      expect(t(key, 'es', vars), `${key} must leave no token behind`).not.toMatch(/\{\w+\}/)
    }
  })

  it('leaves a token alone when no value is supplied', () => {
    // Absent is different from empty: a missing var should be visible in dev
    // rather than silently blanked, which is how the original bug hid.
    expect(t('notif.order_placed_msg', 'en', { orderNumber: '1' })).toContain('{brandName}')
  })

  it('falls back to English when a key is missing in the target locale', () => {
    const enOnly = Object.keys(en).find((k) => !(k in es))
    if (!enOnly) return
    expect(t(enOnly, 'es')).toBe(en[enOnly])
  })

  it('returns the key itself when the message does not exist', () => {
    expect(t('no.such.key.exists', 'en')).toBe('no.such.key.exists')
  })
})
