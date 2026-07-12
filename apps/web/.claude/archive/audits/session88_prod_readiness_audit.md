# Session 88 — Prod Readiness Audit (Market Manager data / Booth Rentals / Events)

**Date:** 2026-06-03
**Trigger:** User request — verify that (a) market manager data/grant-support features are robust and functional, (b) booth rentals and event purchases can run in Prod, (c) identify any new env vars or Stripe product settings needed.

**Method:** 3 parallel agent audits + synthesis.

---

## Bottom line

**Good news:** No new env vars or Stripe Products need to be created for booth rentals or events to run in Prod. Most of the infrastructure is already shared with buyer checkout, which works today.

**5 items need verification on the Stripe Live account** before booth rentals fully work for the first manager.

**5 functional gaps** exist in the market manager data/grant story — the most important being **no CSV/PDF export** (managers can see the data on dashboards but can't easily extract it for grant applications).

---

## Part 1 — Market manager data + grant-support features

### What was proposed (from `market_manager_v2_plan.md` Phases D + E)

8 of 14 features shipped. The "grant support" narrative was an implicit framing — the data exists on the manager dashboard but no explicit grant-export UI was built.

### ✅ Shipped + functional

| # | Feature | Where |
|---|---|---|
| 1 | Aggregate transaction count (7d / 30d / season) | `MarketTransactionsCard.tsx` + `getMarketTransactionsAggregates()` |
| 2 | Vendor attendance list (booth #, status, active-schedule flag) | `VendorBoothList.tsx` + `/api/market-manager/[marketId]/vendors` |
| 3 | Schedule view (editable with soft-delete) | `MarketScheduleCard.tsx` |
| 4 | Weekly bookings list (pending/paid/cancelled) | `WeeklyBookingsCard.tsx` + `WeeklyBookingsList.tsx` |
| 5 | Booth occupancy grid (per-tier, with over-capacity warning) | `BoothOccupancyGrid.tsx` |
| 6 | Post-market surveys (vendor + buyer, full cron delivery) | `market_surveys` table + `/api/cron/surveys` + survey pages |
| 7 | Survey results card (aggregates + recent comments) | `SurveyResultsCard.tsx` |
| 8 | Vendor vetting story (4-gate system + public marketing) | `/market-manager-program` |

### ❌ Gaps — ranked by impact on the grant-support story

| Severity | Gap | What's missing | Impact |
|---|---|---|---|
| **HIGH (for grant story)** | **G2 — No CSV/PDF export** | Manager dashboard has the data but no "Download report" / "Export for grant application" UI | Manager has to manually screenshot or transcribe data when applying for grants. The narrative falls apart at the moment of use. |
| MEDIUM | G1 — Buyer "See all surveys" page 404s | Email link points to `/buyer/surveys`; route does not exist | Buyer confusion; survey response rate likely lower |
| MEDIUM | G4 — Schedule-change notifications don't fire to booth renters | Only fires to `market_vendors.approved=true`; ignores `weekly_booth_rentals.status='paid'` for future weeks | Vendors who paid for a specific week don't learn about hour changes |
| MEDIUM | G5 — Cancellation refund flow not built for paid bookings | Manager can't cancel a paid booking + auto-refund the vendor | Manager intervention required (manual Stripe refund) when a market is cancelled mid-week |
| LOW | G3 — Share button + templates (Phase E) not built | Plan called for web-share + 2 templates (market-day with vendor list, generic) | Word-of-mouth growth narrative weakened |

### What's intentionally NOT in scope (per planning docs)

- Manager financial dashboard / booth revenue analytics (deferred to post-v1)
- Custom vetting criteria per market (deferred)
- Comparative benchmarks across markets (deferred — vendor financial privacy boundary)
- Same-day / festival transaction data (deferred to separate future build)
- Decline page / per-vendor performance metrics (deferred)

### Recommendation — for the grant-support story specifically

**G2 (CSV/PDF export) is the keystone.** Without it, the manager has rich data on screen but no way to put it in front of a grant reviewer. Recommended scope for a quick fix:

1. Add a "Download report" button to the manager dashboard
2. Server route generates a single PDF or CSV containing: vendor count + names, transaction totals (3 windows), schedule, booth occupancy snapshot, survey response stats (aggregate ratings + response rate)
3. ~3-4 hours of work; one server route + one client button + a simple PDF template (use `@react-pdf/renderer` or output HTML→print-styled CSS)

G1 (buyer surveys page) is a quick 1-2 hour build that improves survey response rate by closing a broken link in outgoing emails.

G4 + G5 are operational gaps that affect manager trust — recommend including in the next manager-feature batch.

---

## Part 2 — Booth rentals Prod readiness

### Env vars — no new ones needed

All env vars used by booth rental code paths are already required for buyer checkout (which works in Prod today). Same Stripe keys, same Supabase keys, same `CRON_SECRET`.

### ⚠️ Stripe Live account — 4 items to verify before going live

| Item | Why | How to check |
|---|---|---|
| **1. Connect Express enabled on Live account** | `connect.ts:14-32` creates Express accounts for managers. Test mode allowing this doesn't guarantee live mode does. | https://dashboard.stripe.com/settings/connect → confirm Express enabled |
| **2. Webhook endpoint registered** + signing secret matches `STRIPE_WEBHOOK_SECRET` | Booth rental rides the same `checkout.session.completed` event handler that buyer checkout uses. Same endpoint URL. | https://dashboard.stripe.com/webhooks → confirm `https://farmersmarketing.app/api/webhooks/stripe` is live, signing secret in env matches |
| **3. `cashapp` + `amazon_pay` payment methods enabled** | Session enables `['card', 'cashapp', 'amazon_pay', 'link']` (`payments.ts:312`). If disabled on Live, those options silently drop. Card + Link should always work. | https://dashboard.stripe.com/settings/payment_methods → enable cashapp + amazon_pay |
| **4. Platform statement descriptor set** | `getStatementSuffix(vertical)` used on destination charges. Stripe requires a base statement descriptor on the platform account. | https://dashboard.stripe.com/settings/account → confirm statement descriptor set |

### ⚠️ Notification templates need to exist

Two booth-rental-specific templates fire from `src/lib/stripe/webhooks.ts:1275, 1296`:
- `booth_rental_paid_vendor`
- `booth_rental_paid_manager`

If these aren't in the notification template registry, the booth-rental success notifications silently fail. **Quick spot-check needed:** confirm both exist in `src/lib/notifications/templates/` (or wherever the template registry lives).

### ✅ Cron job — auto-activates on Prod

`/api/cron/expire-orders` (Phase 16 booth rental sweeper) is registered in `apps/web/vercel.json` at daily noon UTC / ~6am CT. Auto-activates once deployed. `CRON_SECRET` is auto-injected by Vercel.

### Key go-live gate

**Markets do NOT all go live at once.** Each market manager must individually complete Stripe Connect onboarding (Express) via `/api/market-manager/[marketId]/stripe/onboard` before that specific market can accept booth bookings. `markets.stripe_charges_enabled = true` is the trigger.

Also, markets with `status='pending'` cannot start Stripe onboarding at all — admin must approve the market first.

---

## Part 3 — Events Prod readiness

### Env vars — no event-specific vars exist

All env vars used in event code paths are shared with the rest of the app. Same `RESEND_API_KEY`, same `CRON_SECRET`, same `STRIPE_*`, same Supabase keys.

### Stripe — nothing new

- Paid-attendee event orders use the standard `/api/checkout/session` flow. Same webhook signing secret. Same Stripe products (i.e., none — `price_data` inline).
- Company-paid orders (`create_company_paid_order` RPC) bypass Stripe entirely. No webhook event fires. No Stripe config needed.
- Wave reservations are pure DB operations. No Stripe touchpoint.

### Cron jobs

| Path | Schedule | Status |
|---|---|---|
| `/api/cron/surveys` | Hourly (`0 * * * *`) | Registered in `apps/web/vercel.json:16-19`. Verify deployed with Session 87 push. |
| `/api/cron/expire-orders` | Daily noon UTC | Already covers event orders via existing Phase 2/3 logic. Company-paid orders are status='confirmed' immediately and not subject to expiry. |

### ⚠️ Items to verify on Prod

1. **`CRON_SECRET` set in Vercel Prod env** — surveys cron will 500 without it. Already set for `expire-orders`, just confirm same value applies.
2. **`vercel.json` deployed with `surveys` cron entry** — confirmed in repo; verify it shipped (the Session 87 push deployed all repo changes, so this should be in place).
3. **`RESEND_API_KEY` present** — already app-wide.

### Rate limiting

All public event-token routes (`details`, `shop`, `select`, `verify-code`, `waves`, `waves/reserve`, `validate-capacity`, etc.) call `checkRateLimit(...)`. Confirmed.

### Timezone math

`event_date` stored as DATE and compared as strings. No UTC-vs-local drift. Surveys cron uses market timezone via `nowInTimezoneAsLocalIso(tz)`. Verified correct.

---

## Consolidated action items (ranked)

### Before going live with booth rentals (~30 min total)

1. **Verify Stripe Live account: Connect Express enabled** — login + check Settings → Connect
2. **Verify Stripe Live account: webhook endpoint live + signing secret matches env** — Settings → Webhooks
3. **Verify Stripe Live account: cashapp + amazon_pay enabled** — Settings → Payment methods
4. **Verify Stripe Live account: platform statement descriptor set** — Settings → Account details
5. **Spot-check notification template registry** has `booth_rental_paid_vendor` + `booth_rental_paid_manager`
6. **Verify `vercel.json` deployed with `/api/cron/surveys` entry on Prod** (check Vercel dashboard → Cron Jobs)

### For booth rental operations (ongoing)

7. **Each market manager must complete Stripe Connect onboarding** before their market accepts bookings. Markets dark until manager onboards. Coach managers through this.
8. **Markets with `status='pending'` must be admin-approved** before Stripe onboarding is enabled. Set expectation with new managers.

### To make the grant-support story fully functional (~5-8 hours)

9. **Build G2: CSV/PDF export from manager dashboard** — ~3-4 hours. This is the keystone for the grant narrative.
10. **Build G1: Buyer "See all surveys" page** — ~1-2 hours. Fixes broken email link, lifts survey response rate.

### For manager operations completeness (longer-term)

11. **Build G4: Schedule-change notifications to booth renters** — backlog item from session 83/85.
12. **Build G5: Cancellation refund flow for paid bookings** — backlog item.
13. **G3: Share button + templates** — lowest priority, marketing-growth feature.

### NOT needed

- No new env vars
- No new Stripe Products / Prices
- No additional cron job setup
- No new webhook endpoints

---

## Files referenced

- Planning: `apps/web/.claude/market_manager_v2_plan.md`, `apps/web/.claude/market_manager_state_review_2026-05-14.md`
- Code: `src/lib/stripe/connect.ts`, `src/lib/stripe/payments.ts`, `src/lib/stripe/webhooks.ts`, `src/lib/markets/manager-dashboard-stats.ts`
- Cron: `apps/web/vercel.json`, `/api/cron/expire-orders/route.ts`, `/api/cron/surveys/route.ts`
- API routes: `/api/vendor/markets/[id]/book/route.ts`, `/api/market-manager/[marketId]/stripe/onboard/route.ts`, `/api/events/[token]/*`

---

## Sessions touched

- Phase B (manager onboarding + opt-in): Sessions 80-83
- Phase C (booth rentals + Stripe Connect): Sessions 82-83
- Phase D (manager dashboard data): Sessions 83-84
- Phase E (surveys): Sessions 83-84
- NEW-7 (manager verification docs): Session 85
- NEW-8 (vendor invitations): Sessions 85-86
- X1a / X2 / X3 security: Sessions 85-86
- Mig 152 / Prod sync: Session 87

Next session — pick from action items 1-13 above.
