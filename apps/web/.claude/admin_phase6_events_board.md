# Admin Phase 6 — Events Pipeline Board (build started 2026-09-04, owner "next item" go)

Design locked in admin_ui_redesign_research.md:95-99: stage-grouped board with
jump-nav (New requests → Inviting → Selecting → Upcoming/Event day → Wrap-up),
one card per event showing ONLY its stage's actions, settlement stays a
drill-in, capability inventory BEFORE build (nothing may be lost).
Events admin is VERTICAL-ONLY (no /admin/events platform route — no merge pair).
P2 stage chips (built 2026-09-03) fold into the card design.

## Step 1 — CAPABILITY INVENTORY of app/[vertical]/admin/events/page.tsx (2,038 lines)
(unfiltered full read, chunks logged here immediately)

- [x] lines 1-400
- [x] lines 400-800
- [x] lines 800-1200
- [x] lines 1200-1600
- [x] lines 1600-2038
- [x] child components — 3 imported shared (AdminChangeRequestsCard, EventChipInControl, AdminEventFeePayments — move/reuse AS-IS, props: vertical+primaryColor / eventId / eventId) + 3 local (Section, DetailRow, fmtDate) + 1 local stateful (EmailRepairControl)
- [x] API endpoints (complete list): GET /api/admin/events?vertical · GET /api/admin/vendors/pending-event-applications?vertical · PATCH /api/admin/events/[id] {status|address|contact_email|resend_organizer_link} · POST /api/admin/events {createForm+vertical} · POST /api/admin/events/[id]/invite {vendor_ids} · POST /api/admin/events/[id]/rematch · POST /api/admin/events/[id]/repeat · POST /api/admin/events/[id]/generate-waves (+ links: /{v}/admin/events/{id}/settlement · /{v}/markets/{market_id} · /{v}/events/{token} · /{v}/admin/vendors/{app.id})

## Inventory findings

### Lines 1-400 ('use client'; useParams vertical)
IMPORTS: EventChipInControl, AdminChangeRequestsCard, AdminEventFeePayments (components/events/), ConfirmDialog, term(), calculateViability + scoreVendorMatch (lib/events/viability), classifyVendorEventStage (lib/events/vendor-stage — P2 chips).
DATA MODEL: CateringRequest (40+ fields incl. organizer_user_id, payment_model, service_level, event_token, admin_notes, is_recurring); VendorOption (readiness nullable = hard gate T-64/T-70); MarketVendor (+is_backup/organizer_selected_at/standby_opted_in_at for stage chips).
LIFECYCLE_STEPS: new→reviewing→approved→ready→active→review→completed (7-step tracker; declined/cancelled outside ladder). statusBadge map (6 statuses incl. declined/cancelled). EVENT_TYPE_LABELS ×6, PAYMENT_MODEL_LABELS ×3, SCORE_COLORS (viability g/y/r), responseBadge (invited/accepted/declined).
STATE: requests, selectedId (drill-in select), statusFilter ('all' default), showCancelConfirm, pendingApplications (incl. eligible=false flagged rows, owner 2026-08-15), vendors + mvMap + selectedVendors + inviting, actionMessage, addressDraft/savingAddress (missing-address repair 2026-08-08), showCreateForm + createForm (13 fields), showRepeatForm + repeat date/end/start/end times, generatingWaves + waveInfo.
FETCH: GET /api/admin/events?vertical (requests + vendors + marketVendorsMap) ∥ GET /api/admin/vendors/pending-event-applications?vertical.
ACTIONS so far:
1. updateStatus(id,status) → PATCH /api/admin/events/[id] {status} (on approve: seeds mvMap for new market_id)
2. saveAddress(id) → PATCH /api/admin/events/[id] {address} ("can be approved now" message)
3. inviteVendors(requestId) → POST /api/admin/events/[id]/invite {vendor_ids} (reports invited+skipped, refetch)
4. rematchVendors(requestId) → POST /api/admin/events/[id]/rematch (reports message + skipped reasons)
5. repeatEvent(id) → POST /api/admin/events/[id]/repeat {event_date,end,start_time,end_time} (selects new request)
6. generateWaves(requestId) → POST /api/admin/events/[id]/generate-waves (reports waves_created × capacity)

### Lines 400-800
7. handleCreateEvent → POST /api/admin/events {...createForm, vertical} — "Create Event (Approved)" (admin-created events are born approved)
LAYOUT (current): header (term event_feature_name) + "+ Create Event" toggle → 16-field create form (admin-form-grid; required: company, date, headcount, address, city, state) → AdminChangeRequestsCard (vertical + primaryColor props; renders nothing when empty; TOP placement = time-critical by definition) → Pending Vendor Event Applications amber panel (links to /{v}/admin/vendors/{id}; 'not eligible' chip per owner 2026-08-15) → status filter chips (S-1: derived from LIFECYCLE_STEPS + declined/cancelled — hand-typed list drifted before; counts per status) → admin-detail-split: LIST (button rows: company, status badge, headcount · date · city/state) + DETAIL panel (only when selected).
DETAIL panel starts: actionMessage banner → 7-step lifecycle stepper (declined/cancelled render as overlay badge, steps past=✓ green / current=blue / future=40%).

### Lines 800-1200 (detail panel continues)
HEADER: company name + Submitted date + Self-Service/Managed chip (service_level).
STATUS ACTIONS (per status — THE stage ladder the board reuses):
- new → Review (→reviewing) + Approve (→approved)
- reviewing → Approve + Decline
- approved → Open Pre-Orders (→ready)  ⚠ known proposed fix A: ignores invitationsHeld (still awaiting go — carry AS-IS, do not fix in the board build)
- ready → Event Started (→active)
- active → Event Ended — Collect Feedback (→review)
- review → Mark Complete (→completed)
- any non-terminal → Cancel Event (ConfirmDialog, danger)
- cancelled → Restore Event (ST-19; route refuses if refunds/notifications happened; title tooltip)
8. EventChipInControl (eventId) — chip-in card, always rendered in detail.
9. Section Contact: contact + phone + EmailRepairControl (local component — PATCH email; repair path when organizer can't authenticate; hidden rule: organizerLinked → different display; audit 2026-08-08).
10. Section Event Details: date range, time, headcount, expected_meal_count (per-vertical label), vendors requested (term event_vendor_unit), location (+ ⚠ no-street-address flag with inline addressDraft input + Save address — the approval blocker repair), event type, payment model, budget (per-vertical label), FT-only beverages/dessert provided rows.
11. Section Viability Assessment: calculateViability(scoreInput 13 fields) → overall banner + budget/capacity/duration + revenueOpportunity (per-vertical label) dots+details + SCORING BREAKDOWN assumptions grouped by regex into Duration/Capacity/Revenue/Budget/Other.

### Lines 1200-1600
12. ⚡ Fast Service banner (inside Viability): all ACCEPTED vendors' pickup_lead_minutes ≤ 15 → throughput note.
13. Section Preferences (cuisine/dietary/budget notes, conditional).
14. Section Event Considerations (preferred categories, est spend/attendee, children, themed, competing vendors, vendor_stay_policy 3-label map — conditional).
15. Section Setup & Notes (setup_instructions/additional_notes) + Section Admin Notes (read-only).
16. Section Attendee Link (event_token): full URL code + Copy Link (clipboard).
17. Section Event Market (market_id): View Event Market Page → (new tab) · Settlement Report link (/{v}/admin/events/{id}/settlement — DRILL-IN stays) · Repeat Event toggle → 4-field form (date*/end/start/end times) + Create Repeat Event · Generate Waves button ONLY payment_model='company_paid' (label shows "N Waves ✓" after) + wave info strip (30-min intervals copy).
18. Section Vendor Fee Payments (market_id): AdminEventFeePayments (eventId) — refund-matrix ground truth + manual override (2026-08-16).
19. Section Vendor Invitations (market_id): invitations TABLE (Vendor/Status+P2 STAGE CHIP via classifyVendorEventStage [Selected/Bench·standby/Awaiting selection]/Items per-vertical label/Notes) + "Invite more vendors" panel.

### Lines 1600-2038 (invite panel + helpers)
20. Invite panel: Re-run Auto Match button (rematch) · candidate list (uninvited vendors, event-approved first then alpha; per row: checkbox DISABLED unless event_approved [T-79 — badge says "not event-approved — can't invite"], Event ✓ badge, event_item_count badge (need 4+), readiness-null → "no readiness — auto-match skips" [T-70; admins can still hand-invite] else platform_score colored ≥4 green/≥3 amber/red, ~$price-per-meal vs budget colored, rating★, 15min⚡, tier · scoreVendorMatch subline Cuisine/Capacity/Runtime levels · ⛔ deal_breakers · ⚠ warnings [T-64: REAL readiness from API feeds scorer — @paired-rule matching-inputs pin]) · Send Invitations (N).
21. EmailRepairControl (local): collapsed "Fix contact email" link → panel with organizer-linked/unlinked copy, Save email (PATCH contact_email, disabled if unchanged), then SEPARATE deliberate "Send their event link" (PATCH resend_organizer_link; honest RESEND_API_KEY-unset message; owner 2026-08-08 look-before-you-send rule).
22. Helpers: Section, DetailRow, fmtDate (T00:00:00 local-date idiom).

INVENTORY COMPLETE — 22 capabilities + 8 API calls + 4 link-outs. Nothing may be lost in the board.

## Step 2 — BOARD DESIGN (execution plan)
**Approach: REORGANIZE, not rewrite.** The detail panel is already stage-conditional
(status actions per status; sections render on data presence) — it moves VERBATIM.
The board replaces the flat list + status-filter chips with stage GROUPS + jump-nav;
clicking a card opens the same detail panel (admin-detail-split kept). All 22
capabilities preserved by construction.

**Stage derivation (status + data — same fields the page already has):**
- New requests = status new | reviewing
- Inviting     = status approved AND invited count 0 (mvMap[market_id])
- Selecting    = status approved AND invited count > 0
- Upcoming     = status ready | active
- Wrap-up      = status review | completed
- Closed       = declined | cancelled (collapsed by default; Restore lives here)

**Card summaries per stage** (list side only — actions stay in the detail):
new: days-since-submitted + service chip · inviting: "no invites yet" · selecting:
selected/bench/accepted-awaiting counts (classifyVendorEventStage over mvMap) vs
vendor_count · upcoming: date + selected count · wrapup: date · closed: status.
Jump-nav = stage chips w/ counts, anchor-scroll to sections. Status-filter chips
RETIRED (S-1 note carried: groups are derived from the same LIFECYCLE_STEPS +
terminals, so nothing can drift or be unnarrowable).

**Mechanics:** cp page → components/admin/EventsAdminPage.tsx (client, vertical
prop, drop useParams); Edit the copy's list/filter block into the board; page.tsx
→ thin wrapper. Known defect list (gate fixes A+B: Open Pre-Orders / ready copy
ignore invitationsHeld) carried AS-IS — still awaiting separate go, NOT fixed here.

## Step 3 — build log
- [x] cp + component conversion (EventsAdminPage.tsx, vertical prop, header doc)
- [x] board block (stageOf + STAGE_META + grouped sections + jump-nav + stage summaries; status-filter chips retired, S-1 rationale carried; Closed collapsed w/ toggle)
- [x] wrapper (page.tsx thin)
- [x] map 19_Admin phase 6 block + stamp (also fixed a pre-existing in-file↔INDEX stamp drift) 
- [x] 2 flow-integrity guards repointed to the component (T-64 readiness + shared-classifier surface list — location-only change, invariant intact, transparent)
- [x] GATES: tsc ✓ · vitest 2150/2150 ✓ · lint 0 errors. UNCOMMITTED.
- Detail panel byte-identical by construction (cp then edits only to header/signature/list block). Known gate defects (Open Pre-Orders / invitationsHeld) carried AS-IS per standing await-go.
