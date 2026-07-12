# Events + Booth gap-fix plan (2026-07-10)

All sites VERIFIED against current code (scouts located, Claude confirmed key claims). Two backlog items turned out largely/partly already fixed — noted inline.

## Cluster A — Events (G1, G3, G5)

### G1 — `review → completed` never auto-completes (REAL)
- Cron advances `ready→active` (Phase 14, `expire-orders/route.ts:2333-2361`) and `active→review` (Phase 15, `:2363-2392`), both market-local. **No cron does `review→completed`** (confirmed: no cron writes `catering_requests` `completed`). It's ONLY the admin PATCH `admin/events/[id]/route.ts:317-390`, which on `completed` fires: unfulfilled-order guard + vendor notify (`:319-353`), buyer feedback surveys (`sendEventFeedbackNotifications`, `:356/:396`), vendor **settlement-summary notifications** (`sendEventSettlementNotifications`, `:360/:439` — NOTE: notifications only, NOT a Stripe transfer; payouts already happen per order_item at fulfillment), organizer email (`:364`), `listing_markets` cleanup (`:376`).
- **Consequence:** an event with no admin action hangs in `review` forever — feedback + settlement summaries never fire.
- **Fix:** extract the completion side-effects into a shared fn; add an `expire-orders` phase that advances `review→completed` after a grace window (`event_end_date + N days`, market-local via our new `todayInTimezone`) and calls that shared fn. Keep the admin manual-complete too.
- **Money?** No money moves — safe. Keep the unfulfilled-order guard.
- **DECIDED (user 2026-07-10):** grace window = **3 days** after `event_end_date` (market-local). Unfulfilled orders → **complete anyway**, and notify **the vendor AND the vertical admin** (today the guard only notifies the vendor via `event_force_completed_with_unfulfilled` — ADD a vertical-admin recipient; resolve admins via the vertical-admins mechanism, likely a new notif type or reuse with admin audience). Admin manual-complete stays.
- **Build notes:** extract the completion side-effects (`admin/events/[id]/route.ts:317-390`) into a shared fn called by BOTH the admin PATCH and the new cron phase; status-guard the UPDATE (`.eq('status','review')`) so admin+cron can't double-fire; compare `event_end_date + 3d` vs market-local today via `todayInTimezone` (mirror Phase 15). Also fix the side bug: `validStatuses` lists `'cancelled'` but the DB CHECK doesn't (mig 094) — drop it from the array or add to CHECK.
- Effort: MEDIUM. Risk: LOW-MED (fires notifications). Reuses the tz helpers.
- **✅ BUILT 2026-07-11 (uncommitted).** NEW `src/lib/events/complete-event.ts` = `runEventCompletionEffects` + the 3 moved helpers (feedback/settlement/organizer-email); notifications now AWAITED (Vercel-terminates rule). New notif type `event_completed_with_unfulfilled_admin` (audience admin) → vertical admins via `vertical_admins`. `admin/events/[id]/route.ts` now calls the shared fn (removed inline block + 3 local fns; imports `sendOrganizerStatusEmail` for declined/cancelled). `expire-orders` **Phase 15.5**: `review→completed` when `todayInTimezone(tz) >= event_end + 3d`, status-guarded. NI tripwire 95→96 (user-approved). tsc + lint clean, 1613/1613.
- Side finding (EXCLUDED from G1 per user): `validStatuses` (`:73-83`) still lists `'cancelled'`, but the DB CHECK (mig 094:74-76) does NOT include it → picking `cancelled` would 500. Small separate bug — STILL OPEN.

### G3 — `is_recurring` dead flag (REAL, but subtle)
- Intake writes it (`event-requests/route.ts:262-264`) but the intake FORM hardcodes `is_recurring:false` (`EventRequestForm.tsx:205-206`) — never even collected at intake. It IS editable later in the organizer dashboard (`OrganizerEventDetails.tsx:524`) + shown to admin. **Only reader is `viability.ts:482`** (appends "Recurring — higher strategic value" note). No generator, no cron materializes a series.
- **Two options:** (a) **REMOVE the promise** — drop the organizer-dashboard toggle + admin display + viability note; leave column dormant (or drop in a mig). Stops the false expectation. SMALL. (b) **BUILD** recurring-event series generation (cron materializes next occurrence). LARGE, real feature.
- **DECIDED (user 2026-07-10): REMOVE the promise.** Strip the organizer-dashboard toggle (`OrganizerEventDetails.tsx:524`) + admin "Recurring — {freq}" display (`admin/events/page.tsx:919`) + the viability note (`viability.ts:482`) + the details-PATCH allow-list acceptance (`events/[token]/details/route.ts`). Leave the columns dormant (do NOT drop — cheaper to keep if we build later). Keep a **clarified backlog entry** documenting current state so a future build has the map. May or may not build recurrence later.
- **✅ BUILT 2026-07-10 (uncommitted).** Removed: `is_recurring`/`recurring_frequency` from the organizer editable-fields array (`OrganizerEventDetails.tsx:70` — org can no longer view/edit); the two entries from the details-PATCH allow-list + the `recurring_frequency` validation (`events/[token]/details/route.ts` — can't set via API); the admin "Recurring" DetailRow (`admin/events/page.tsx`); the viability note (`viability.ts:482`). LEFT dormant: DB columns, GET selects, `EventScoreInput.is_recurring` type, and the now-dead render helpers/labels in `OrganizerEventDetails` (harmless — never invoked). tsc clean, lint clean, 1613/1613.
- Effort: (a) small [chosen] / (b) large [deferred, not scheduled].

### G5 — no-address self-service dead-ends in `new` (REAL) + misleading email
- Auto-approve only if `self_service && hasAddress` (`event-requests/route.ts:291-295`); no address → stays `new`, no recovery. The only cron reading events excludes `new` (`:2071`, `:2131-2133`). Worse: the organizer confirmation email claims progress ("...notifying qualified food trucks now") even for the no-address case where nothing was matched (`:401-405`).
- **Fix:** (1) branch the organizer confirmation copy for no-address → "add your event address to start notifying trucks: <link>"; (2) surface stuck-`new` — corrected copy + existing admin FYI is the v1 floor; optional light cron nudge re-emailing the organizer after N days still-`new`.
- **DECIDED (user 2026-07-10): copy + nudge.** Corrected no-address organizer email + a light cron that re-surfaces/re-emails events stuck in `new` (no address) after N days.
- **✅ BUILT 2026-07-10 (uncommitted; mig 185 PENDING apply).** Part A: `event-requests/route.ts` `needsAddress` branch on the organizer confirmation email + response message. Part B: mig `20260710_185_catering_address_reminder.sql` (`address_reminder_sent_at`) + `expire-orders` **Phase 11.5** (self_service + status=new + address IS NULL + >2 days + not-yet-nudged → `sendEventAddressReminder` → stamp flag) + helper. tsc clean, 1613/1613.
- Effort: SMALL (copy) + SMALL-MED (nudge). Risk: LOW.

## Cluster B — Booth (G13 + label)

### G13 — DROPPED (by design, user-confirmed 2026-07-10)
**Not a gap.** Off-platform `market_booth_placeholders` represent **season-long booth renters** who were with the market before the manager joined the platform → they ARE always occupying the booth, so week-blind capacity counting is CORRECT. Any vendor attending only some weeks uses the **weekly rental process** instead. No `week_start_date` needed. The double-booking half was already fixed anyway (below). **Close the backlog G13 item as by-design.**

<details><summary>(original analysis kept for reference)</summary>

- **CORRECTION:** same-week booth-number double-booking is already prevented — mig 144 partial unique index `idx_wbr_market_week_booth (market_id, week_start_date, booth_number) WHERE booth_number IS NOT NULL AND status<>'cancelled'` (`20260520_144:99-101`) + mig 146 cross-table trigger; manager PATCH maps `23505`/`P0005` → 409 (`weekly-rental/[rentalId]/route.ts:70-104`). Backlog's item-2 is stale.
- **Real remaining gap:** `market_booth_placeholders` has no `week_start_date` (`20260509_135:24-33`, `UNIQUE(market_id, booth_number)`), and the booking RPC `book_weekly_booth_atomic` counts placeholders **week-blind** (`20260522_146:213-216`) while rentals are week-filtered (`:218-222`); `v_remaining = inventory - placeholders - taken` (`:225`). So an off-platform vendor present only some weeks consumes a tier slot EVERY week forever.
- **Fix:** add `market_booth_placeholders.week_start_date DATE NULL` (NULL = every week — preserves current behavior); relax `UNIQUE(market_id, booth_number)` to allow per-week rows (partial index or `NULLS NOT DISTINCT`); week-filter the placeholder count in the RPC (`WHERE week_start_date IS NULL OR week_start_date = p_week_start_date`); manager UI to set the week. Migration + RPC rewrite + UI.
- **Decision needed:** is per-week placeholders actually wanted? (Only matters if managers have off-platform vendors attending some weeks.) If "always occupied" is fine, DROP this.
- Effort: MEDIUM. Risk: MED (touches the booking capacity RPC — money-adjacent). Present RPC diff before editing.

### Booth-label drift (LARGELY ALREADY FIXED)
- **CORRECTION:** `reconcileBoothLabelsAfterInventoryChange` auto-clears the label range on drift, called on all 3 inventory routes (`booth-inventory/route.ts:135` POST, `[inventoryId]/route.ts:124` PATCH, `:174` DELETE → `booth-label-drift-server.ts:24`). Save-time validator also enforces `range == sum(inventory.count)` (`booth-labels/route.ts:132-156`). Backlog item stale.
- **Residual narrow gaps only:** `detectBoothLabelDrift` returns null (no clear) on unparseable labels / prefix mismatch / `end<start` (`booth-labels.ts:139-141`); reconcile is non-transactional vs an in-flight booking.
- **Recommend:** tiny hardening (also clear on unparseable/mismatched range) OR accept+document. NOT a build.

## Recommended sequence
1. **G5 copy fix** — tiny, fixes a live misleading email. Quick win.
2. **G3 remove-the-promise** (small) — pending remove-vs-build decision.
3. **G1 auto-complete cron** (medium, reuses tz helpers) — real lifecycle bug.
4. **G13 placeholder week-awareness** (medium, RPC) — pending "is it wanted" decision.
5. **Booth-label hardening** — small/optional, or drop.

## Decisions needed
- G1 grace-window length (suggest 3 days post-event-end).
- G3: remove the recurring promise, or build recurrence?
- G5: copy-only, or copy + cron nudge?
- G13: are per-week placeholders wanted, or is "always occupied" acceptable (→ drop)?
