# Session 92 — Events + Market Management Deep Dive (Growth-Avenue Analysis)

Started: 2026-06-12 (Research mode)
Goal: efficiencies + cross-feature connections in events & market management, evaluated against the growth thesis: landowners/leaseholders use the platform to set up + run farmers markets and food-truck venues, renting spaces to vendors — make it the easy, go-to option.

Method: Claude reads vision docs (property_broker_concept, self_serve_micro_market_concept) + verifies load-bearing claims in code; Explore agents map feature inventories. Report claims cite code or are marked by confidence.

## Checklist
- [ ] V1. Vision docs read (property broker, FROG micro-market)
- [ ] A. Market-manager lifecycle map (intake → approval → onboarding → operations)
- [ ] B. Manager operating toolset (booth inventory, rentals, vendors, schedules, agreements, surveys, docs, money)
- [ ] C. Events system map (organizer journey, lifecycle, vendor matching, shop, payment models)
- [ ] D. Vendor-side experience (discover/join markets, book booths, event invites)
- [ ] E. Buyer-side discovery (browse, market profiles, schedules)
- [ ] F. Cross-connection inventory (what talks to what; what SHOULD)
- [ ] G. Synthesis: efficiencies, connections, growth-avenue gaps

## Findings

### A-B. Market-manager map (agent 1, spot-verify before citing)
Lifecycle: public landing `/[vertical]/market-manager-program` → no-auth intake (geocode + fuzzy-dup detect + admin email) → market status='pending' (hidden) → admin activates → 5-step onboarding wizard (identity, booths REQ, vendors opt+ack, placeholders opt+ack, optin REQ) → operating dashboard.
Toolset: booth inventory tiers, placeholders, occupancy grid, vendor list w/ booth+tier+approval, bulk invitations (≤50, radius search), co-branded signup link, optin agreement statements w/ placeholders, schedules (soft-delete + vendor notify + ack), logo+description, verification docs, Stripe Connect per market, weekly bookings list w/ booth assignment, transactions aggregate card (7d/30d/season gross), dashboard stats (next market day, orders, vendors needing booth), survey results card (cron pending).
Money (AGENT CLAIM — VERIFY in pricing.ts): vendor pays base+6.5%+$0.15; manager receives base−6.5%−$0.15?? Agent says "13% spread" — conflicts w/ decisions.md "booth rental math = base + 6.5% + $0.15". MUST VERIFY calculateBoothRentalFees.
Manager gaps (agent): no payout/settlement history, no per-vendor reconciliation, no exports, weekly-only rentals (no season/recurring contracts), no refund tooling, no day-of tools (check-in/cancel-market-day), no messaging/broadcast, no multi-market dashboard, no market cloning/seasonal templates, no doc-expiry tracking, no marketing tools, single manager only.

### C. Events map (agent 2, spot-verify before citing)
Creation: public EventRequestForm (rich: type, payment model, budget, recurring flag, considerations) OR admin-direct. self_service auto-approves (if address) → auto-match (score≥2.5, ≤15 invites) → organizer token pages. full_service = admin reviews; "platform fee applies" but NO fee collection mechanism implemented.
Organizer: token-based pages (details/edit, select, shop, my-order, cancel, copy link, refresh matches, rate). NO authenticated "my events" management dashboard; NO organizer analytics; NO organizer payouts. Hybrid payment hidden (no checkout logic). company_paid: waves + access codes + event_company_payments (admin manual record; "future: Stripe payment link" comment). Recurring: captured on form, NO automation. Vendors: cannot browse/apply to events (invite-only via score). Lifecycle: cron Phases 14/15 (ready→active→review); NO auto-complete; admin settlement report exists.
Overlap: events ARE markets rows (market_type='event', catering_request_id). market_vendors shared (events use response_status + caps; traditional uses approved + booth_number). NO code link between manager role and organizer role. Booth inventory/rentals NOT used for events.

### D-E. Vendor+buyer map (agent 3, spot-verify before citing)
Vendor: /vendor/markets lists fixed+event+private+invitations, ~100mi radius from profile zip. Join paths: invite-respond (auto-approve on accept), self-join via co-branded link (manager approves). Booking: market detail → book page (Stripe-gated: stripe_charges_enabled required, else "not available yet"), Sunday-only weeks, agreement snapshot+version hash, atomic RPC, auto booth label, Stripe checkout, webhook flips paid. /vendor/bookings read-only (NO cancellation v1).
Buyer: /markets browse (city/state filter only — NO radius), market profile public+indexed+share button. VISIBILITY GATE (verify visible-markets.ts): market hidden from browse unless ≥1 vendor has BOTH published listing AND active schedule → new manager's market invisible until vendor activation. Browse listings show market name but NO link to market profile (verify).
Gaps (agent): no open-booth visibility pre-click, no price comparison across markets, no booth waitlist, no follow-market for buyers, no week-specific inventory overrides, no bulk rental cancellation/refund flow, no manager pending-applications notification, market schedules lack tz labels.

### Notifications inventory: market_vendor_invited, vendor_market_approval_granted, manager_vendor_invitation_responded, booth_rental_paid_vendor/_manager, booth_rental_payment_failed_vendor, market_schedule_changed, survey_request_vendor/_buyer. NO manager broadcast, NO buyer market-day ping.

### Verified personally
- [x] calculateBoothRentalFees (pricing.ts:308-345): $25 booth → vendor pays $26.78 (×1.065+$0.15), manager nets $23.37 (−6.5%), platform keeps $3.41 (~13.6% of base). Both-sides fee confirmed.
- [x] visible-markets.ts:4-15: traditional market HIDDEN from public list until ≥1 vendor has BOTH published listing AND active schedule at it. Cold-start paradox for new managers.
- [x] markets page HAS radius/location filtering (markets/page.tsx:370-379 MarketsWithLocation + savedLocation + radiusOptions) — agent 3 claim WRONG, discarded.
- [x] browse → market profile links ABSENT (zero /markets/ hrefs under browse/) — confirmed missing connection.
- [x] Vision docs read: property_broker_concept.md (3-sided landowner marketplace, Phase 0 validation pending, reuse table ~70%), self_serve_micro_market_concept.md (honor-market niche, idea only).

## G. Synthesis (delivered in chat 2026-06-12)
Core thesis fit: platform already has per-venue Stripe Connect, space inventory w/ tier pricing, atomic booking+payment, agreement snapshots, doc verification, vendor radius search/invites, event matching — i.e., most of property_broker_concept's "to build" list exists under the market-manager program. Deltas: weekly-Sunday-only granularity, no vendor-facing space browse, no recurring bookings, manager/organizer role silos, cold-start visibility paradox, manager money-visibility gap, day-of ops void, no comms channel, single-venue-per-dashboard.
Report tiers: T1 cheap connectors (visibility transparency, open-booth browse, earnings card, browse→market links, follow-market); T2 structural (day-granular+recurring bookings, cancel-market-day flow, manager↔vendor comms, multi-venue); T3 unification (Venue identity = manager+organizer+landowner; FT manager program; property broker as marketing wrapper).

## H. REVISION (2026-06-12) — Regional Manager model (user correction; supersedes the property-broker framing in G)

**Corrected thesis:** NOT the property_broker_concept. A partner / "Regional Manager" (RM) — an independent business — finds + leases land entirely OUTSIDE the platform (no platform-side real-estate deals, no contracts/deposits/landowner marketplace = the legal/risk buildout is deliberately avoided). The RM then OPERATES the markets/venues themselves (or hires staff), using the platform as their operating system. Control dynamic: responsibility offloads to the independent RM business → faster growth; motivated RMs start earning (for themselves and the platform) quickly.

**Process note:** initial analysis anchored on property_broker_concept.md without asking; lesson saved to memory (clarify-strategy-before-research).

**What this CUTS from the prior analysis:** all landowner-side product (properties table, landowner onboarding/contracts/deposits/reviews, 3-way fee split), and the property-broker Phase 0 legal burden (zoning/insurance/lease enforceability) — now the RM's business problem, not ours. Platform's only land-related touchpoint: verifying the RM has the RIGHT to operate at the address — and mig 148's market_documents already has `venue_proof` as a document_type [verified via snapshot changelog mig 148 entry].

**What CARRIES OVER unchanged:** G1 visibility paradox, G2 vendor space-browse, G3 day-granular/recurring bookings, G4 earnings visibility, G5 day-of ops, G6 comms, G8 events loose ends; all Tier-1 connectors; the fee engine (manager nets 93.5% — now the RM's unit economics).

**What gets RE-RANKED — the RM model's spine:**
1. **Multi-market operation becomes the #1 structural requirement** (was G7/nice-to-have). markets:677-678 = one human per market, no org linkage [verified]. An RM with 4 venues = 4 disconnected dashboards. Need: RM identity layer — likely anchored on the EXISTING `organizations` table (vendor_profiles.organization_id already exists, snapshot:1247; markets lacks it) → `markets.organization_id` + portfolio dashboard (rollup earnings, bookings, vendors across venues).
2. **Staff roles/delegation** — RM "hires staff to run the markets": needs sub-accounts with scoped permissions (day-of booth assignment, check-in, vendor approval) WITHOUT Stripe/financial control. Nothing exists today (single manager_user_id).
3. **RM vetting + governance** — RM represents the platform in a region. Existing rails fit: market_documents (incl. venue_proof + legal_entity_filing) for vet-once-at-RM-level; mig 154 manager_status suspension + market_manager_history for governance; Phase 1B (suspend/restore + history UI) becomes MORE important under this model.
4. **Replication efficiency** — RM spins up venue #2..N: market cloning/templates (schedules, booth tiers, optin statements, branding) was a "nice-to-have," now core to RM velocity. Intake flow is per-market single-shot today.
5. **Reporting/exports** — RM likely owes landowners reporting (lease deals often %-based) + runs a real business: manager data exports (already planned: manager_export_and_lockout_plan.md) and per-venue P&L matter more.
6. **RM acquisition funnel** — current market-manager-program landing pitches single-market managers (FM-only copy); an RM program pitch (multi-venue economics calculator: N venues × booths × weekly fees × 93.5%) is a marketing-surface gap, not a code gap.
7. **One Stripe account per market** (mig 141 design comment: "one account per market even when managed by same person") — for an RM with N venues that's N Stripe onboardings. Revisit: org-level Connect account vs per-market. DECISION for user + Stripe-structure review, not assumed.

## I. User decisions on the RM revision (2026-06-12, second correction round)

- **Stripe stays 1 market = 1 account** (it's the existing mig-141 design; not a change). CONFIRMED for user: vendors are unaffected — one `vendor_profiles.stripe_account_id` per profile spans ALL markets in that vertical [verified snapshot:1254 + cancel/route.ts:248-249]; the per-market account is only the booth-rental receiving side (`markets.stripe_account_id`). Per-vertical nuance: vendor in 2 verticals = 2 profiles = potentially 2 accounts.
- **Staff sub-accounts WITHDRAWN** (Claude assumption, incorrect). RM uses a different email per market — matches 1:1 manager design + per-market Stripe; lockout/history (mig 154) covers staff turnover. Revisit only if RMs feel multi-login pain.
- **Org/portfolio layer WITHDRAWN/deferred** — consequence of the above.
- **Identity unification (old Tier 3) REPLACED by user's composable-roles principle:** roles STACK, never merge — manager/RM/organizer/vendor each work standalone with similar process arcs (intake → vet → onboard → dashboard → Stripe-if-money → governance); one person may hold several. Build: (a) make the events arc rhyme with the markets arc (organizer dashboard/vetting are the thin spots), (b) cross-role visibility = dashboard cards linking each role's world (navigation, not architecture), (c) events-at-market bridge = manager ACQUIRES organizer role with pre-filled event.
- **Surviving recommendation list:** Tier-1 connectors (visibility transparency, earnings card, browse→market links, open-booth surfacing, follow-market); market cloning/templates; day-granular + recurring bookings; cancel-market-day; broadcast; exports (manager_export plan); Phase 1B governance; events-arc consistency; RM program pitch page. This is a FUTURE build — none scheduled.

## J. TIGHTENED FEATURE SET (2026-06-12, after user's per-topic responses — third round)

User decisions incorporated: keep visibility gate (inform managers instead); open-booth surfacing RESTRICTED to vendor's connected markets (no cross-market poaching); daily/half-day granularity + recurring both wanted, per-market toggles, defaults preserve current weekly (don't alienate existing managers); persona = manager-who-also-owns/leases OR org staff (not landowners per se); NO day-of booth reassignment; check-ins = big YES (FT law driver + FM); avoid refunds wherever possible; comms = not a chat service; browse stays sales-first (drop market links); events-at-venue bridge questioned (vendor-based events ≈ market day?); survey proof = manager-acquisition + funding-numbers selling point; templates → backlog; mostly self-serve with concierge only where high-value; RM license fee = pending decision (geo/population territory, affordable).

### Build-now candidates (small, low-risk)
1. Manager-dashboard VISIBILITY card — explains the gate + live status (which vendors have listing+schedule) + CTA. Data: visible-markets logic + onboarding-progress queries. ~half session.
2. EARNINGS card — manager-net booth revenue by period: weekly_booth_rentals(status='paid') × calculateBoothRentalFees().managerReceivesCents (pure fn, pricing.ts:324). Distinct from existing gross-GMV transactions card. ~half session.
3. OPEN-BOOTH info on CONNECTED markets only — vendor/markets page + market detail when market_vendors row exists. Capacity math = count − placeholders − booked (mirror of book-route math; display-only, "confirmed at booking"). Read-only, no schema. ~1 session.
4. FOLLOW-MARKET — market_favorites mirroring vendor_favorites (mig 034 pattern) + market-day-morning notification. Flash-sales plan's tiered cascade (premium first) optional later. ~1 session.
5. Manager BROADCAST — announcement → approved vendors via existing notification+Resend rails; rate-limited (e.g. 2/wk); one-way (NOT chat). Already backlog (Session 85). Vendor→manager 1:1 later via the events message-relay pattern if demanded. ~1 session.

### Design-first (schema decisions before code)
6. GRANULARITY + RECURRING (G3): markets.rental_granularity ('weekly'|'daily'|'half_day' w/ am-pm day_part) + markets.recurring_enabled toggles, defaults = current. weekly_booth_rentals: week_start_date → period_start + period_type + day_part; RPC + mig-146 trigger + booking form become period-aware. RECURRING = booking PATTERN (parent recurrence + child period rows), NOT a granularity — no inherent conflict ("every Saturday" = weekly cadence of daily rentals). Payment crux: recommend Stripe-subscription-per-recurring-booking (cancel-forward, never refund backward — matches platform's existing cancel-at-period-end philosophy + user's no-refund stance) over prepay-all (refund exposure if market cancels mid-season). OPEN Q for user.
7. DATE OVERRIDES (G5 + replaces events-at-venue bridge): market_schedules is day_of_week-only [verified snapshot:592-601] — no date-specific support exists. New market_date_overrides (market_id, date, status cancelled|special, times) feeding availability/display/booking. One feature, two faces: cancel-a-date (weather) + add-special-date (holiday market). Cancel cascade: notify booked vendors + buyers w/ orders; BOOTH fees → credit/auto-reschedule policy (NO auto-refund — matches locked policy copy "refund or future date — manager's call"); BUYER product orders for the date → existing refund machinery (structurally unavoidable — flag to user).
8. CHECK-INS: market_day_checkins (market_id, vendor_profile_id, market_date, checked_in_at, method). Feeds: buyer "here today", survey targeting accuracy, FT-law compliance. BLOCKED on user input: what data must check-in capture (jurisdiction/law requirements)? Manager-tap vs vendor-geofenced-self vs QR.

### Governance / program
9. Phase 1B (suspend/restore UI + history + notifications) — already planned; rises in priority (RM governance + future license-fee enforcement lever).
10. Survey pipeline completion: ship deferred Stage 5 cron → results card → exportable stats + optional public market-profile badge (manager acquisition + non-profit funding numbers). Pairs w/ manager_export plan.
11. RM program: pitch page when license model lands; territory definition can use existing zip_codes+radius infra; manager_status = enforcement lever. PARKED on user decision.

### Dropped / backlog
- Browse→market links: DROPPED (user: sales-first is correct behavior).
- Day-of booth reassignment: DROPPED (existing booth_number edit suffices).
- Events-at-venue bridge: DROPPED — superseded by special-dates; events stay in corporate/organizer lane (waves, company-paid, one-off lineups are the real differentiators).
- Templates (copy optin/tiers from my other market): BACKLOG.
- Staff roles / org layer / Stripe restructuring: withdrawn (section I).

### Concierge case (user asked): human-in-loop ONLY for (a) manager/RM doc vetting (already admin-gated, low volume, fraud surface), (b) first RM cohort onboarding (learn before tooling), (c) full_service events (already by design — note its fee is still uncollected), (d) refund exceptions. Everything else self-serve.

### Open questions to user
- FT check-in law: what data/jurisdiction requirements?
- Recurring payment model: weekly subscription billing (recommended) vs prepay-all?
- Confirm buyer product-order refunds on a cancelled market day are the acceptable "we will if we have to" case.

**Revised tiers (superseded by sections I-J above — kept for the record):**
- T1 (unchanged value, RM-agnostic): visibility transparency, earnings card, browse→market links, open-booth badges, follow-market.
- T2 (RM spine): markets.organization_id + portfolio dashboard; staff roles; market cloning/templates; day-granular + recurring bookings; cancel-market-day; broadcast.
- T3 (RM program): RM-level vetting flow (vet once, venue_proof per site), RM program landing + economics pitch, exports/P&L, org-level Stripe decision, events-at-venue bridge.
- Events bridge + FT-vertical manager program: still relevant (RM running a food-truck park IS the FT case).
