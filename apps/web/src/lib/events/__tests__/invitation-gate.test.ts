/**
 * Invitation gate (mig 239, owner 2026-08-29) — the required-before-invitations
 * list in the owner's words:
 *   free or charged · run before? · spend per purchaser · Event Context (all
 *   but Themed) · background checks + cost · anything that could make vendors
 *   reconsider. Self-service only; admin-assisted is never held.
 */
import { describe, it, expect } from 'vitest'
import { invitationsHeld, missingInvitationDetails, type InvitationGateRow } from '../invitation-gate'

const complete: InvitationGateRow = {
  service_level: 'self_service',
  invitations_released_at: null,
  vendor_fee_decided_at: '2026-08-29T00:00:00Z',
  event_vendor_fee_cents: null,
  has_run_before: false,
  estimated_spend_per_attendee_cents: 1500,
  event_context_confirmed_at: '2026-08-29T00:00:00Z',
  has_competing_vendors: false,
  competing_food_options: null,
  logistics_confirmed_at: '2026-08-29T00:00:00Z',
  background_check_required: false,
  background_check_details: null,
}

describe('invitationsHeld', () => {
  it('holds a self-service event until the organizer releases', () => {
    expect(invitationsHeld({ service_level: 'self_service', invitations_released_at: null })).toBe(true)
    expect(invitationsHeld({ service_level: 'self_service', invitations_released_at: '2026-08-29T00:00:00Z' })).toBe(false)
  })
  it('never holds admin-assisted events (owner: admin assist later)', () => {
    expect(invitationsHeld({ service_level: 'full_service', invitations_released_at: null })).toBe(false)
    expect(invitationsHeld({ service_level: null, invitations_released_at: null })).toBe(false)
  })
})

describe('missingInvitationDetails', () => {
  it('is empty when every required detail is answered', () => {
    expect(missingInvitationDetails(complete)).toEqual([])
  })

  it('"no fee" saved counts as decided; an unsaved fee does not', () => {
    expect(missingInvitationDetails({ ...complete, vendor_fee_decided_at: null }).map(m => m.key)).toEqual(['fee'])
    // a positive fee is a decision even without the stamp (pre-239 rows)
    expect(missingInvitationDetails({ ...complete, vendor_fee_decided_at: null, event_vendor_fee_cents: 2500 })).toEqual([])
  })

  it('Budget: run-before must be answered either way, spend must be positive', () => {
    expect(missingInvitationDetails({ ...complete, has_run_before: null }).map(m => m.key)).toEqual(['has_run_before'])
    expect(missingInvitationDetails({ ...complete, has_run_before: true })).toEqual([])
    expect(missingInvitationDetails({ ...complete, estimated_spend_per_attendee_cents: 0 }).map(m => m.key)).toEqual(['estimated_spend'])
    expect(missingInvitationDetails({ ...complete, estimated_spend_per_attendee_cents: null }).map(m => m.key)).toEqual(['estimated_spend'])
  })

  it('Event Context: saving the section is the answer; other-food text only when other vendors are present', () => {
    expect(missingInvitationDetails({ ...complete, event_context_confirmed_at: null }).map(m => m.key)).toEqual(['event_context'])
    expect(missingInvitationDetails({ ...complete, has_competing_vendors: true, competing_food_options: '  ' }).map(m => m.key)).toEqual(['competing_food_options'])
    expect(missingInvitationDetails({ ...complete, has_competing_vendors: true, competing_food_options: 'lemonade stand' })).toEqual([])
  })

  it('Logistics: background-check answered, details when required, risk section saved ("none" counts)', () => {
    expect(missingInvitationDetails({ ...complete, background_check_required: null }).map(m => m.key)).toEqual(['background_check'])
    expect(missingInvitationDetails({ ...complete, background_check_required: true, background_check_details: '' }).map(m => m.key)).toEqual(['background_check_details'])
    expect(missingInvitationDetails({ ...complete, background_check_required: true, background_check_details: 'County check, $25, 5 days' })).toEqual([])
    expect(missingInvitationDetails({ ...complete, logistics_confirmed_at: null }).map(m => m.key)).toEqual(['risk_factors'])
  })

  it('reports every gap at once, grouped for the dashboard', () => {
    const missing = missingInvitationDetails({ service_level: 'self_service' })
    expect(missing.map(m => m.key)).toEqual(['fee', 'has_run_before', 'estimated_spend', 'event_context', 'background_check', 'risk_factors'])
    expect(new Set(missing.map(m => m.group))).toEqual(new Set(['fee', 'budget', 'context', 'logistics']))
  })
})
