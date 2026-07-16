# Park manager + food truck tester feedback — investigation (2026-07-15)

Source: tester feedback (park manager persona @ River Road Food Truck Park + food truck vendor persona), pasted by user 2026-07-15. User clarification: point 2 = simple manager-editable open/close dates (admin already has FT park season fields), NOT FM-style prepay seasons.

Mode: Report — read-only investigation, findings with citations, no fixes.

## Checklist
- [x] P1 — post-welcome routing / setup-first ordering (park manager)
- [x] P2 — season (open/close dates) card missing from park setup
- [x] P3 — support email wrong vertical
- [x] P4 — docs link dead + no manager-side required-docs config
- [x] P5 — phantom "July–Sept season" on vendor booking page
- [x] P6 — no spot-size vs truck-size check
- [x] P7 — no admin notification on document upload
- [x] P8 — booking notification missing dates
- [x] P9 — vendor has no bookings view + no email receipt
- [x] P10 — schedule-conflict lockout after paying (HIGHEST)
- [x] P11 — "not taking bookings" until refresh after admin set season

## Findings

### P3 — support email: CONFIRMED BUG (S)
`src/components/market-manager/ManagerSupportCard.tsx:18` — `const SUPPORT_EMAIL = 'support@farmersmarketing.app'` hardcoded; card is rendered for BOTH verticals (FtParkDashboardBody.tsx imports it :24). Not vertical-aware. Fix: vertical-switched email (foodtruckn.app for food_trucks).

### P2 — season card: CONFIRMED GAP (never built for FT parks)
`MarketSeasonCard` is imported + rendered ONLY in `FmDashboardBody.tsx:25,:137`. `FtParkDashboardBody.tsx` has no season/open-close card (full card list checked :3-24). Admin-side season fields exist (`api/admin/markets/[id]/route.ts` handles season_start — grep hit). USER DECISION: park managers should get simple open/close date editing (markets.season_start/season_end), reusing/adapting MarketSeasonCard or a park-shaped variant.

### P4 — docs link + required-docs config: SPLIT
(a) Link target is VALID: `BookParkSpotForm.tsx:206` -> `/${vertical}/vendor/edit`; that page renders `DocumentsCertificationsSection` (vendor/edit/page.tsx:156) = the upload UI. Why it "didn't go anywhere" for the tester: UNVERIFIED — needs repro (plain <a>, vertical prop wired). Possibly she expected a park-specific requirements list, which brings us to:
(b) CONFIRMED never-built: NO required-docs config exists anywhere (grep `required_doc|requiredDocs|doc_requirements` = zero hits in src + migrations). "Documents this park requires" is generic copy; managers cannot specify requirements. Product decision needed.

### P7 — doc-upload notification: BY-DESIGN MISMATCH + STAGING ARTIFACT
Upload routes send NO notification (grep sendNotification in onboarding/documents, certifications/upload, coi = zero). The review notice is `park_truck_docs_to_review` sent by the park-docs-review CRON to the PARK MANAGER (manager_user_id), not admin — `lib/markets/park-docs-review.ts:106-115`, fires when docs changed since last review/ping, requires booking-consent + market_vendors row. Crons only run on PROD (vercel crons don't fire on staging) → tester could never see it on staging. So: (1) recipient is manager not admin (tester expectation mismatch — confirm intended design), (2) cron cadence ≤ ~1h not instant, (3) staging = never fires.

### P1 — post-welcome routing: CONFIRMED GAP (never built for FT)
Welcome deck = generic TutorialModal, rendered on `[vertical]/dashboard` + vendor dashboard only (TutorialWrapper grep) — no handoff to manager setup afterward. The FM manager dashboard has `OnboardingChecklist` + Setup-first ordering (FmDashboardBody.tsx:124, Phase 4 c2ab3f40); `FtParkDashboardBody.tsx` has NEITHER (git -S: checklist/season strings never existed in that file — NOT a regression; FT body built without them through the ft-park series). Fix direction: port OnboardingChecklist (park-shaped steps) into FtParkDashboardBody + post-tutorial redirect for manager-role users.

### P5 — "phantom season": CONFIRMED — it's the 56-day booking horizon, not a season
BookParkSpotForm.tsx:130 builds operating dates `for i < 56` days ahead from schedule DOWs, grouped into Sunday weeks (:139-152). Jul 14 + 56d ≈ Sep 8 → "Jul 17 – Sep 5" with Fri/Sat schedule. season_start/end appears NOWHERE in the park booking flow — book-spot/page.tsx gates only on park_mode='paid' (:68) + stripe_charges_enabled (:77). TWO implications: (a) label/UX: vendors read the rolling horizon as a season; (b) once P2 ships (manager-set open/close dates), the booking horizon + booking API should be bounded by them — TODAY even admin-set season dates do not constrain park bookings.

### P6 — spot-size check: CONFIRMED never-built, both data sides exist
`park_spots.max_length_ft` exists + selected (book-spot/page.tsx:88); truck length exists as `vehicle_length_feet` in EventReadinessForm (vendor/edit/EventReadinessForm.tsx:8,73) — captured under event-readiness, not the core FT profile. book-park-spot route has NO length validation (grep). Fix: booking route compares vehicle_length_feet vs spot max_length_ft (warn or block — product call); form could badge undersized spots.

### P8 — booking notification missing dates: CONFIRMED (S)
`park_spot_paid_manager` template renders only dayCount (notifications/types.ts:960-963); send site passes no dates (webhooks.ts:1621-1631) though the paid booking rows w/ booking_date are in scope in the handler. Same gap in the vendor twin `park_spot_paid_vendor` (types.ts:948-952) → also explains the "receipt without date/time/spot" half of P9. Fix: pass dates array (+ spot label already passed) and render them in both templates.

### P9 — vendor bookings view: CONFIRMED never-built for FT
Vendor dashboard "My Booth Bookings" card is FM-only by explicit comment (vendor/dashboard/page.tsx:933-958) linking `/vendor/bookings`, and that page is weekly-booth-rentals-only (bookings/page.tsx header). NO surface lists a truck's park_spot_bookings with dates. Email receipt: standard urgency = ['email','in_app'] (types.ts:30) so an email IS sent on payment — but its content lacks dates (P8). Fix: FT variant of the bookings card/page reading park_spot_bookings, + P8 template fix.

### P10 — schedule-conflict lockout: CONFIRMED design gap (mechanics verified)
`park_spot_bookings` (date-specific, paid) and `vendor_market_schedules` (recurring DOW, drives listings/selling) are SEPARATE systems — paying for a spot creates no schedule. Adding a schedule at the park then hits the one-truck overlap rule: ERR_SCHEDULE_CONFLICT 409 (vendor/markets/[id]/schedules/route.ts:280-288, :518-531) whose remedy copy = "Deactivate that schedule first, or enable 'Multiple Trucks' in your profile" (FT-only toggle). Structural mismatch: a date-specific booking conflicts at the recurring level even when actual dates don't overlap. Tester "can't change anything" = UNVERIFIED (remedies exist but are buried: profile toggle or deactivating the other schedule). Product options: (a) auto-create/offer the park schedule on paid booking with conflict pre-check BEFORE payment, (b) surface the Multiple-Trucks/deactivate remedies inline, (c) date-aware conflict logic. ALSO explains "days and times but no dates" on the locations page — it renders recurring schedules, not bookings.

### P11 — "not taking bookings" until refresh: MEDIUM confidence — transient client-cache staleness
The message matches the park_mode bail-out copy (book-spot/page.tsx:72). Page is dynamic (cookies via createClient) but Next's client Router Cache can serve a stale RSC payload ~30s; refresh busts it. She had successfully booked earlier, so a persistent gate is ruled out; likely her navigation raced the admin's save or hit the router cache. Self-healed; low priority; re-test if it recurs. No code defect identified.

## Summary classification
- Regressions: NONE — points 1/2 confirmed never-built-for-FT via git -S (the Setup-first/season work was FM-only); user's memory was of the FM dashboard work.
- Confirmed bugs (S): P3 (support email), P8 (dateless notifications, both templates).
- Confirmed money-adjacent/UX gaps needing build: P1 (FT onboarding checklist + routing), P2 (manager season open/close card — user decided: simple dates), P4b (park required-docs config — product decision), P6 (size check — product decision), P9 (FT bookings view), P10 (booking↔schedule bridge — product decision on approach).
- By-design / environment: P7 (docs notice goes to MANAGER via prod-only cron, not admin — confirm intent), P11 (transient staleness), P4a (link target valid — needs repro), P5 (horizon mislabeled as season; consider bounding bookings by season dates once P2 exists).

## FINAL DECISIONS (user, 2026-07-15)
- Layer 2 = AUTO-create schedule on paid booking (no ask — booking implies selling on-platform; fee income depends on it). Notify truck, let them adjust.
- P10 stage (b) — get_available_pickup_dates park-date intersection — DEFERRED to its own later careful build (user accepted the money-gate-RPC risk rationale). Backlogged.
- Season dates: NOT a separate card — a "Season window" section inside the park schedule card (Setup > Location schedule).
- P6: block with explanation (booking + weekly-hold paths); no block when truck length unset (nudge instead).
- P4b: minimal required-docs list (manager checklist + free text, display-only at booking, human enforcement). No compliance engine.
- P7: instant notification to MANAGER on doc upload; cron stays as backstop; no admin ping.
- Build order: T1 (P3+P8+relabel) → T2 (season+size) → T3 (P9+P1+P4b+P7) → T4 (P10 layers 0-3). One commit per batch, gates between. Slice-3 fix batch AFTER the tester batches (user call, keep clean).
