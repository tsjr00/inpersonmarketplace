# Growth Feature Set — Build Plan (Session 92+)

Spec source: `session92_events_mm_growth_research.md` §J + backlog "Priority 1 — Growth feature set".
Decisions: composable roles + season prepay (decisions.md 2026-06-12). Mode: HYBRID — Claude builds, explains + gets approval, commits+pushes combined batches (must pass CI), user tests on staging.

Phasing (user-confirmed 2026-06-12): **A → B → 1B → C → D → E**
Amendment: broadcast moved A→B (needs market_broadcasts audit table; keeps A migration-free).

## Phase A — Quick wins (zero migrations) ← CURRENT
- **A1 Visibility card** (manager dashboard): explains the buyer-visibility gate + live status. Helper `src/lib/markets/market-visibility.ts` reusing getFullyOnboardedMarketIds + per-vendor listing/schedule detail; component `MarketVisibilityCard`. Traditional markets only (events exempt from gate).
- **A2 Earnings card** (manager dashboard): manager-net booth revenue = Σ calculateBoothRentalFees(price_cents).managerReceivesCents over weekly_booth_rentals status IN ('paid','completed'), bucketed by paid_at (7d/30d/season — mirror transactions card windows). Copy distinguishes "your booth revenue" from the GMV card.
- **A3 Open-booth counts on CONNECTED markets** (vendor markets page): for markets where the vendor has a market_vendors row (non-declined) AND booking is enabled (stripe_charges_enabled + inventory): next-bookable-week availability = Σ per tier (count − placeholders − non-cancelled rentals that week), shown as "N booths open next week · from $X" + link to book page. Display-only; math mirrors book flow; availability authoritative at RPC.
- NO critical-path files touched (pricing.ts imported, not modified). Commit batch A → staging after approval.

## Phase B — Follows + notifications (2 small migrations)
- mig: market_favorites (mirror vendor_favorites mig 034) + market_broadcasts (id, market_id, sender_user_id, subject, body, recipient_count, created_at).
- Follow button on market profile; market-day-morning notification (new phase in hourly surveys cron — tz-aware market-day logic lives there); audience-resolution helper (tiers: vip/premium/followers/nearby — built generic, only followers used now).
- Broadcast: POST /api/market-manager/[marketId]/broadcast — isMarketManager gate, content moderation, rate limit 2/7d/market (enforced off market_broadcasts), recipients = approved vendors + vendors w/ paid future rentals (dedupe, mirrors schedule-change recipients), notification type market_broadcast (in-app + email).

## Phase 1B — Manager suspend/restore (already designed: manager_export_and_lockout_plan.md)
- suspend/restore actions on admin manager route + history writes + ManagerHistoryPanel + 3 notification templates + mig 154 → Prod (couples to a prod push).

## Phase C — Date overrides (focused design pass FIRST — touches get_available_pickup_dates RPC, mig-131 history)
- market_date_overrides (market_id, date, status cancelled|special, times) + manager UI + notifications + booth credit flagging + availability RPC rewrite migration.

## Phase D — Check-ins
- market_day_checkins + vendor start/stop UI (server timestamp, Geolocation + distance-from-market, self-attestation) + manager attendance view. OPEN: manager counter-signature needed? (default: self-attestation only).

## Phase E — Granularity + season prepay (dedicated design doc for approval before any code)
- Period-type generalization of weekly_booth_rentals + booking RPC + mig-146 trigger; prepay window; X-day cap; cancelled-day counter; settlement menu. See decisions.md 2026-06-12.

## Status log
- 2026-06-12: Plan created. Phase A build started.
- 2026-06-12: Phase A IMPLEMENTED (uncommitted). 8 files: market-visibility.ts (new), manager-dashboard-stats.ts (+getManagerEarningsAggregates), MarketVisibilityCard.tsx (new), ManagerEarningsCard.tsx (new), manager dashboard page (wiring), api/vendor/markets/route.ts (connected-market booth snapshot, +market_vendors query, service client after auth), vendor/markets/types.ts (+BoothAvailability), vendor markets page (expanded badge + compact-row hint). Gates: tsc clean, eslint 0 new warnings, vitest 1493/1493. Zero test/critical-path/protected files touched.
- 2026-06-12: Phase A committed `12b0eb9c` → staging. User staging-tested all 3 — clear.
- 2026-06-13: Phase B migrations written (156 market_favorites + market_day_notification_log; 157 market_broadcasts). B-FOLLOWS code IMPLEMENTED (uncommitted): notification types market_day_today + market_broadcast (3 reg spots), /api/markets/[id]/follow route, market-audience.ts helper (followers tier wired, premium/nearby stubbed), surveys cron +runMarketDayNotifications phase (8-12 local morning window, dedup via market_day_notification_log claim), FollowMarketButton.tsx, market profile page (follow state fetch + button, traditional only). Notification tripwire bumped 72→74 (user-approved, documented). Gates: tsc clean, eslint clean, vitest 1493/1493. B-broadcast code still to build. NEXT: user applies mig 156+157 to Dev+Staging → commit B-follows → push.
