/**
 * The two ways an organizer can run an event — one copy of the wording, read
 * by both the public events page (a SERVER component) and the intake form (a
 * CLIENT component).
 *
 * ⚠ WHY THIS LIVES IN lib/ AND NOT IN THE FORM: it started in
 * `components/events/EventRequestForm.tsx`, which is `'use client'`. Exporting
 * a plain function from a client module and calling it inside a server
 * component does not work — the server gets a client reference, not the
 * function, and the page throws and renders nothing. Caught by the pre-push
 * Playwright smoke test on 2026-08-13 (`h1` not found on
 * /farmers_market/events). Shared helpers used by both sides belong here.
 *
 * ⚠ `full_service` is DISPLAY-ONLY today. `service_level` is hardcoded to
 * 'self_service' at form init and on submit, so every event created through
 * the public form is self-service, and the page marks the full-service card
 * "Coming soon" with no way to pick it. The moment that changes, code that has
 * only ever seen self-service events starts seeing something new — including
 * the matching engine, and the organizer dashboard's "Select vendors" link,
 * which renders only for self_service. Wiring the choice is a behaviour change
 * to existing paths, not just a new form field. See backlog → "PUBLIC EVENTS
 * PAGE REDESIGN" and T-56.
 *
 * Copy note (owner, 2026-08-13): self-service must read as *working with an
 * automated system on your own*, not as being left to fend for yourself.
 */
export interface ServiceLevel {
  value: 'self_service' | 'full_service'
  label: string
  /** False renders the card as "Coming soon" with no way to select it. */
  available: boolean
  description: string
}

export function getServiceLevels(vertical: string): ServiceLevel[] {
  const vendorTerm = vertical === 'farmers_market' ? 'vendors' : 'food trucks'
  return [
    {
      value: 'self_service',
      label: 'Run it yourself',
      available: true,
      description: `Tell us about your event and our system automatically matches and invites ${vendorTerm} that fit. You pick from the ones who say yes. No platform fee.`,
    },
    {
      value: 'full_service',
      label: 'Work with our team',
      available: false,
      description: `A member of our team coordinates the event with you — choosing ${vendorTerm}, logistics, and support on the day.`,
    },
  ]
}
