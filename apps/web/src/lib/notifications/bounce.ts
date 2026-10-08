/**
 * Bounce classification for the Resend webhook (app/api/webhooks/resend).
 *
 * Resend reports `data.bounce.type` as "Permanent" or "Temporary"
 * (docs: resend.com/docs/webhooks/emails/bounced; a real Prod payload on
 * 2026-10-08 carried "Permanent"). Only a PERMANENT bounce may suppress a
 * user's email (NOT-5, mig 202). "hard" is kept for any older stored value.
 * Anything else — "Temporary", a value we do not know, or no type at all —
 * is NOT a hard bounce: wrongly silencing a user is the costlier mistake.
 *
 * Lives outside the route file because Next.js route modules may export only
 * HTTP handlers, and the rule needs a unit test.
 */
export function isPermanentBounce(bounceType: string | null | undefined): boolean {
  const t = (bounceType || '').trim().toLowerCase()
  return t === 'permanent' || t === 'hard'
}
