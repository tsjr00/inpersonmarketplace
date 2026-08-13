/**
 * T-75 — the event market's NAME is the organizer's identity.
 *
 * `approveEventRequest` names every event market
 * `${company_name} ${suffix}` (lib/events/event-actions.ts), so a market row
 * is literally called "Acme Corp Vendor Event". The disclosure policy — a
 * vendor never sees the organizer's identity or address until they ACCEPT the
 * invitation (T-09, T-67) — was defeated by the name field on every
 * pre-acceptance surface: the invitation payload and the vendor events list.
 * The invite NOTIFICATIONS were already masked ("Private Event"); the API
 * responses were not.
 *
 * The name cannot simply be changed at the source: attendees are SUPPOSED to
 * see the company name — the shop page's identity is the market name. So the
 * mask is applied per-viewer at the API layer, exactly like the address.
 *
 * Owner decision 2026-08-13: masking applies to vendors who have NOT ACCEPTED
 * (undecided or declined). Accepted vendors see the real name, as with the
 * address. Public events (is_private false) are never masked — the organizer
 * chose to be public.
 */
// @paired-rule organizer-identity — the shared mask; surfaces that skip it leak.
export function maskedEventName(
  city: string | null | undefined,
  eventStartDate: string | null | undefined
): string {
  const datePart = eventStartDate
    // Parse as local midnight — bare `new Date('YYYY-MM-DD')` is UTC and
    // shifts the displayed day for US timezones.
    ? new Date(`${eventStartDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  if (city && datePart) return `Private event — ${city}, ${datePart}`
  if (city) return `Private event — ${city}`
  if (datePart) return `Private event — ${datePart}`
  return 'Private event'
}
