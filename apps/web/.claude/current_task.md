# Current Task: Communications & Notifications System Build
Started: 2026-02-06
Last Updated: 2026-02-06 (end of Session 7)

## Session 7 Summary - COMPLETED

### Audit Fixes (COMMITTED - `027dd8f`)
- Atomic inventory decrement via RPC (race condition fix)
- Order ownership verification in checkout/success
- Batched inventory queries (single SELECT + parallel UPDATEs + batch notifications)
- Inventory validation at Stripe session creation
- Cart validation for ALL market types (not just traditional)
- Centralized LOW_STOCK_THRESHOLD in constants.ts
- Sanitized 41 console.log statements (sensitive data removed)
- Removed 17 debug console.log statements
- Admin rate limiting on 21 routes (37 handlers, 30/min)
- Migration `20260206_001_atomic_inventory_decrement.sql` applied to dev & staging, moved to `applied/`

### Notification System (COMMITTED - `450f911`)
- `src/lib/notifications/types.ts` — 16 notification types with urgency tiers, audience, templates, action URLs
- `src/lib/notifications/service.ts` — Channel-aware orchestrator (in-app works, email/SMS/push stubbed)
- `src/lib/notifications/index.ts` — Rewritten as public API with backward-compatible helpers
- `src/app/api/notifications/route.ts` — GET paginated list
- `src/app/api/notifications/count/route.ts` — GET unread count for badge
- `src/app/api/notifications/[id]/read/route.ts` — PATCH mark single as read
- `src/app/api/notifications/read-all/route.ts` — POST mark all as read
- `src/components/notifications/NotificationBell.tsx` — Bell icon + dropdown in Header
- `src/components/notifications/DashboardNotifications.tsx` — Dashboard card for both buyer/vendor
- Vendor dashboard: notifications card in 2-col grid with referral card, above promote/grow
- Buyer dashboard: notifications card in 2x2 grid with Browse/Orders/Feedback
- NO POLLING — navigation-driven refresh via usePathname() + visibility change

### Documentation (NOT COMMITTED)
- `src/lib/notifications/MESSAGE_TEMPLATES.md` — Full copy for all 16 types × all channels (needs user review)
- `docs/Regional_Franchise_Scaling_Plan.md` — Micro-franchise scaling plan with corrected revenue projections

### Key Decisions
- **No interval polling**: User strongly opposed. Refresh on navigation (pathname change) + tab visibility
- **Ready for Pickup stays on top**: Nothing above it on buyer dashboard
- **Vendor dashboard layout**: Notifications + Referral in 2-col grid, above Promote & Grow
- **Buyer dashboard**: 2x2 grid (Browse, Orders, Notifications, Feedback) — not 3-across
- **Revenue projections**: Must account for BOTH buyer fee (6.5%) AND vendor fee (6.5% Stripe / 3.5% external)
- **Blended rate**: 40/60 Stripe/external split → ~$3.48 avg fee per $30 order

## What Needs to Be Done NEXT SESSION

### Priority 1: Environment Setup (prerequisite for live communications)
1. Create production Supabase project
2. Apply all migrations to production
3. Point `farmersmarketing.app` to Vercel production deployment
4. Configure Vercel env vars (scoped: Production vs Preview vs Development)
5. Set up Resend account + DNS records on `farmersmarketing.app`
6. Set up Twilio account + sending number
7. Generate VAPID keys for web push
8. Connect API keys to the stubbed service layer

### Priority 2: Wire Live Channels
- Connect Resend SDK in `service.ts` email channel
- Connect Twilio SDK in `service.ts` SMS channel
- Implement web push subscription flow + service worker
- Wire message templates from MESSAGE_TEMPLATES.md into type registry

### Priority 3: Missing Notification Inserts
Wire up events that currently have ZERO notifications:
- Order confirmed by vendor → buyer
- Order ready for pickup → buyer (IMMEDIATE - push + SMS fallback)
- Order fulfilled → buyer
- Order cancelled by vendor → buyer (URGENT - push + SMS fallback)
- New paid order → vendor (STANDARD - email + in-app)
- Payout processed → vendor
- New vendor application → admin

### Regional Franchise Plan
- User is still thinking about it — no code work requested yet
- Document exists at `docs/Regional_Franchise_Scaling_Plan.md`
- Open questions in Section 11 need business decisions before building

## Communications Plan - APPROVED BY USER

### Strategy: Tiered by Urgency
| Urgency | Channels | Cost/msg |
|---------|----------|----------|
| Immediate | Push + In-app | Free |
| Urgent | SMS + In-app | ~$0.008 |
| Standard | Email + In-app | ~$0.001 |
| Informational | Email only | ~$0.001 |

### Services Chosen
- **Email**: Resend (free tier → $20/mo at scale)
- **SMS**: Twilio (~$2-3/mo at launch)
- **Push**: Web Push API (free, requires service worker)
- **In-app**: Existing notifications table

### SMS Strategy (keep volume low - 4 scenarios only)
1. Order ready for pickup → buyer at market
2. Buyer acknowledged receipt → vendor 30-second window
3. Order cancelled by vendor → buyer may be en route
4. Market box pickup ready → buyer at market
- SMS only fires if user HASN'T enabled push notifications (push is preferred, SMS is fallback)

## User Preferences
- Direct communication, verify before acting
- Doesn't like the structured Q&A format - prefers questions woven into narrative
- Budget-conscious but willing to invest where strategic value exists
- Wants competitive parity or better with other farmers market apps
- Strongly opposed to unnecessary polling / wasteful API calls
- Ready for Pickup must stay at top of buyer dashboard — nothing above it
