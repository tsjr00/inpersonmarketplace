# 18 — Notifications

<!-- map-stamp: domain=notifications; verified=2026-07-18; commit=b9f82116 -->
<!-- map-claims
src/app/api/notifications/**
src/app/api/webhooks/resend/**
src/lib/notifications/**
src/components/notifications/**
src/app/[vertical]/notifications/**
src/app/[vertical]/account/**
-->

One send pipe, 100 notification types, four channels. **Communication cost is a first-class design constraint here** — the channel mapping is a spending decision as much as a UX one.

---

## Read this first

1. `lib/notifications/index.ts` (123 lines) — the public surface.
2. `lib/notifications/types.ts:22-37` — channels, urgencies, and the mapping. **Fifteen lines that determine the cost of every send.**
3. `lib/notifications/service.ts:398-680` — `sendNotification` in full.

Skip the 1,300-line registry body unless you're adding a type.

**Three behaviors that surprise people:** `info` costs nothing (in-app only) · `immediate` and `urgent` bypass tier gating entirely · dedup keys on `dedupRef`/`orderNumber` rather than plain type.

## The two contracts you must not break

1. **`sendNotification()` never throws.** Every await inside is guarded — even the error logger is try/caught. Callers can `await` it safely without defensive wrapping.
2. **You must `await` it anyway.** Vercel terminates the function once the response is sent; an un-awaited send silently does not happen.

Also: **the vertical goes in the OPTIONS parameter (4th arg), not in `templateData`.**

## Urgency → channels (`types.ts:27-37`)

| Urgency | Channels | Cost |
|---|---|---|
| `immediate` | `['push', 'in_app']` | Free |
| `urgent` | `['sms', 'in_app']` | Paid (Twilio) |
| `standard` | `['email', 'in_app']` | Paid (Resend) |
| `info` | `['in_app']` only | **Free** |

`info` was changed to free in-app-only under a 2026-07-17 cost review — spending a paid email on a low-priority FYI was judged the inverse of frugal. Every urgency includes `in_app`, so the free bell is always populated regardless of channel spend.

## The pipeline

`sendNotification(userId, type, templateData, options)` — `service.ts:398`:

1. **Registry lookup** — an unknown type returns a failed result rather than throwing.
2. **Dedup** — a 10-second window on `user_id` + `type`, **refined by reference**: when `templateData.dedupRef` or `.orderNumber` is present, dedup keys on that reference, so two distinct orders to one vendor during a lunch rush aren't cross-suppressed. The coarse window applies only when neither is present.
3. **Urgency resolution** — `getNotificationUrgency(type, vertical)` checks `VERTICAL_URGENCY_OVERRIDES[type][vertical]` first, then the registry default.
4. **Channel selection** from `URGENCY_CHANNELS`.
5. **Profile load** — from `options.prefetched` (batch path) or a per-recipient fetch, which also yields locale and `email_suppressed_at`.
6. **Tier gating** — non-critical notifications intersect the channel list with the vendor's tier allowance. **`immediate` and `urgent` bypass tier gating entirely.**
7. **Dispatch loop** — per channel, check user preferences, then: in-app insert · email · SMS (gated on `sms_order_updates`) · push, with an **SMS fallback when push fails outright** and SMS isn't already in the list.
8. **Failure logging** — any failed channel logs `ERR_NOTIF_001`; even that logging call is guarded so it cannot break the never-throws contract.

### Batch sends

`sendNotificationBatch(userIds, type, data, options)` bulk-loads full profiles in **one query** and vendor tiers in **a second**, builds a prefetch map, then dispatches with `prefetched`. **N recipients → 2 reads instead of ~2N.** If the bulk fetch throws it degrades silently to per-recipient fetches.

This batch path existed but was never called until the July 2026 efficiency pass wired it into the market-day reminder and both event broadcasts — one broadcast previously made ~600 individual admin-API calls.

## Notification types

**Exactly 100 types.** The `NotificationType` union and `NOTIFICATION_REGISTRY` are kept in sync by `Record<NotificationType, …>` typing, and the count is pinned by a tripwire test in `cutoff-and-sort-functional.test.ts` — adding a type requires deliberately bumping that number with a dated reason. That is the mechanism that keeps notification sprawl visible.

## Email suppression

**Write path** (`app/api/webhooks/resend/route.ts`): Resend posts a Svix-signed event. Only `email.bounced`, `email.complained` and `email.delivery_delayed` are stored. On a **hard bounce or spam complaint**, the handler stamps `user_profiles.email_suppressed_at` + `email_suppression_reason`. Soft bounces and delivery delays are transient and **never** suppress. The update carries `.is('email_suppressed_at', null)` so the first qualifying event wins and re-bounces don't re-stamp. Each newly suppressed user gets one free in-app `email_suppressed_notice`.

**Read path**: `sendNotification` reads suppression from the profile or the prefetched bundle, and the email channel then skips with a success-and-skipped result — **in-app still delivers**. Both fetch paths tolerate the column being absent pre-migration.

**Clearing**: a database trigger auto-clears suppression when the user changes their email address.

Cost note: the suppression check rides the existing prefetch, so it adds **zero extra queries**.

## Files

| File | Purpose |
|---|---|
| `lib/notifications/index.ts` | Public barrel: `sendNotification`, `sendNotificationBatch`, registry, types, plus six backward-compatible helpers (`notifyVendorNewOrder`, `notifyBuyerOrderConfirmed`, `notifyBuyerOrderReady`, `notifyBuyerOrderCancelled`, `notifyVendorOrderCancelled`, `notifyOrderExpired`) |
| `lib/notifications/service.ts` | The orchestrator (~780 lines): dedup, urgency, tier gating, suppression, dispatch, batch prefetch |
| `lib/notifications/types.ts` | Channels, urgencies, `URGENCY_CHANNELS`, the 100-member `NotificationType` union, `NOTIFICATION_REGISTRY`, `VERTICAL_URGENCY_OVERRIDES`, `getNotificationUrgency` (~1,720 lines) |
| `lib/notifications/email-config.ts` | Per-vertical verified Resend FROM addresses + `getEmailBranding()` (logo, color, domain) |
| `lib/notifications/auth-email-templates.ts` | Standalone HTML for auth emails (signup, reset) — outside the registry |
| `lib/notifications/MESSAGE_TEMPLATES.md` | Prose reference for message copy |
| `app/api/notifications/route.ts` | GET — paginated fetch of the caller's notifications |
| `app/api/notifications/count/route.ts` | GET — unread badge count, index-served |
| `app/api/notifications/read-all/route.ts` · `[id]/read/route.ts` | Mark all / mark one read |
| `app/api/notifications/push/subscribe/route.ts` | Register / remove a Web Push subscription |
| `app/api/webhooks/resend/route.ts` | Svix-verified Resend webhook; stores bounce events and writes the suppression stamp |
| `components/notifications/NotificationBell.tsx` | Header bell + unread badge + dropdown |
| `components/notifications/DashboardNotifications.tsx` | In-dashboard notification list |
| `components/notifications/PushOptInCard.tsx` | Push-permission opt-in prompt |

## The cost principle

A 2026-07-17 review re-scoped channels by **cost per send**, not by convenience. The operating principle, worth carrying into any new notification:

> Prefer free `in_app` plus next-page-load delivery over a paid send whenever the recipient can reasonably wait until they next open the app. Reserve email for things they must know while away, and SMS for genuinely urgent, time-boxed events. Batch and digest low-priority messages.

Concrete outcomes: market-day reminders moved to push · order-refunded dropped SMS · FM new-order dropped the per-order email in favor of push · surveys became a single opt-out-honoring email with lazy in-app generation for returners.
