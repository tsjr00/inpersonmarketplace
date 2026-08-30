# Admin UI Redesign — research + plan (owner request 2026-08-30)

Owner's brief (verbatim essentials): admin panel + admin dashboard, BOTH vertical &
platform, were "built piecemeal and the design / UI make it harder than it needs to be
to test and manage the processes." Use the recent vendor, market-manager and event-vendor
(organizer) dashboards as inspiration — "mobile first, and modular." Think through what is
currently housed on which pages; envision better ways to (1) monitor processes & status,
(2) run the necessary admin workflows, (3) eventually monitor regional managers.
HARD CONSTRAINT: no functionality reduced. Questions allowed only after the review.

## Checklist
- [ ] Inventory: platform admin pages (app/admin/*) — what each houses
- [ ] Inventory: vertical admin pages (app/[vertical]/admin/*) — what each houses
- [ ] Inventory: the two hub pages + navigation (layouts)
- [ ] Reference patterns: DashboardCard/Tile/Nav + vendor / market-manager / organizer layouts
- [ ] Overlap map: platform vs vertical duplicates, and what differs
- [ ] Workflow list: every admin workflow the UI must serve (approvals, events, money, errors…)
- [ ] Status/monitoring signals available (counts, pending queues, error feeds)
- [ ] Proposed IA (page map), mobile-first module set, migration order
- [ ] Questions for owner

## Findings

(filled as I go — each section written immediately after reading)

### A. Page inventory (2026-08-30, from find + heading/API greps)

**Platform tree `app/admin/*` (21 pages, ~6.9k lines):** hub (485 — StatCards: Pending Approval etc., Pending Vendor Approvals list, quick links, per-vertical links), admins (398), analytics (625), cause (448 — beneficiary onboarding incl. "walk them through it" flow), error-logs (306), errors (751), event-ratings (376), listings (175), login (216), markets list/new/[id]/edit (280/45/419/63 — market detail incl. MarketManagerAssignment), mfa setup/verify, order-issues (358), reports (623 — CSV reports), users (202), vendors + pending + [vendorId] (159/178/457 — Business Info, Certifications & Documents, Onboarding, User Account).

**Vertical tree `app/[vertical]/admin/*` (20 pages, ~13k lines):** hub (738 — links: vendors, order-issues, events, markets, users, listings, vendor-activity, admins, errors, reports, "/admin" escape), admins (477), analytics (627), cause (99), error-logs (249), errors (645), event-ratings (176), **events (2000 — the whole event admin workflow: review request → invite vendors → evaluate viability → event day → collect reviews → payouts done; + settlement/[id] 723)**, feedback (1158), knowledge (111), listings (207), **markets (1836 — approve/reject/delete market, manager assignment, editing)**, order-issues (387), reports (929), **stripe-reconcile (622)**, users (194), **vendor-activity (96)**, vendors + [vendorId] (270/403 — adds Event Readiness Application).

Vertical-only: events(+settlement), feedback, knowledge, stripe-reconcile, vendor-activity, markets-as-single-page. Platform-only: market create/edit/detail subpages, vendors/pending, login, MFA, cause full flow.

### B. Permission model (from Codebase_Map/19_Admin.md — verified there 2026-08-16)
Two tiers: `admin` (vertical-scoped) + `platform_admin`; helpers in lib/auth/admin.ts; 51 admin API routes; enforcement inconsistent (6 verifyAdminScope / 4 verifyAdminForApi / 40 legacy hasAdminRole). Mig 204 provisioning shipped. Any UI redesign keeps pages behind requireAdmin and does NOT touch route auth (separate workstream).

### C. Reference patterns (the dashboards the owner likes)
- Building blocks: components/dashboard/{DashboardCard, DashboardTile(+TileBadge), DashboardNav(+Spacer), GroupHeading, CollapsibleSection, TabbedCard, ScrollToSection, icons, states}. lib/dashboard/nav-destinations.ts = role-aware dashboard switcher (shopper always first; resolved per-dashboard, not in Header — cost note in file).
- Card/tile taxonomy + state vocabulary (`neutral/active/attention/warning`) from the 2026-08-07 redesign; "operational items at top" (owner pref); tiles navigate, cards act in place.

### D. Navigation today (the core of the "harder than it needs to be")
- THREE nav systems, none complete: (1) platform layout wraps everything in `AdminSidebar` (dark sidebar + ☰ on mobile; links: dashboard, vendors, pending, listings, markets, users, cause, error-logs, event-ratings, order-issues, + the two vertical hubs — MISSING: admins, analytics, errors, reports, mfa). (2) `AdminNav` pill row rendered PER-PAGE by only ~8 pages (platform: analytics/listings/users/vendors; vertical: analytics/events/settlement/feedback) — vertical list has 15 links but MISSES admins, errors, knowledge. (3) The vertical tree has NO persistent nav at all — its layout renders none, so most vertical pages only navigate via browser-back to the hub.
- Consequence: dead-ends on mobile, different nav on every page, several pages reachable only from the hub or by URL (vertical: admins, errors, knowledge; platform: admins, analytics, errors, reports).
- Reference fix pattern already in repo: DashboardNav (switcher) + ManagerJumpNav (sticky jump-to-section on one page).

### E. Duplication between trees
Pages duplicated as separate near-copies (NOT shared components): admins, analytics, cause, error-logs, errors, event-ratings, listings, order-issues, reports, users, vendors(+detail). errors pages differ by ~700 normalized lines; clients (UsersTableClient etc.) exist twice. Platform markets = 4 small pages (list/new/detail/edit) vs vertical markets = one 1836-line page with modals doing approve/reject/delete/edit/manager. Events admin exists ONLY in the vertical tree (2000 lines + settlement 723). Divergent capability: platform vendor detail has fee-override + location editor + verification panel; vertical vendor detail has event-readiness application + event-approval.
- API layer is already shared and vertical-parameterized (`?vertical=`) — the duplication is purely UI.

### F. Monitoring signals available today
- Vertical hub queries: markets total/pending/active; vendors total/pending/approved/premium(pro)/boss; users; listings; orders/order_items (sales); catering_requests; market_box_offerings; vendor_activity_flags. Platform hub: cross-vertical vendor counts + pending list inline, order_items sales, catering.
- Queue-shaped data that exists but is NOT surfaced as badges anywhere: pending vendors, pending markets, open order-issues, error reports (errors), error_logs new-highs, pending event requests / events needing selection-window attention, unremitted cause funds, pending event-readiness applications, activity flags, park standing-reservation requests, feedback unread.
- Manager dashboard reference: `getManagerDashboardStats`-style aggregate helpers + TabbedCard bodies ("This week", "Money", "Setup", "Your trucks & approvals") + ManagerJumpNav.

### G. Design principles carried from the liked dashboards
Mobile-first single column; tiles navigate / cards act; state vocabulary neutral|active|attention|warning (attention = someone waits on YOU); operational items on top; GroupHeading zones; TabbedCard for dense areas; jump-nav instead of long scroll; badge counts resolved server-side on the page that shows them.

## PROPOSED PLAN (v1, 2026-08-30 — presented in chat; owner decisions pending)

### IA
- ONE admin shell component (mobile-first): sticky top bar (vertical switcher FM|FT|Platform + ☰), complete nav (every page, grouped Operate/People & Places/Money/Quality/System), per-queue badges. Replaces AdminSidebar + per-page AdminNav; rendered by BOTH layouts.
- Hub = mission control: "Needs you now" queue tiles (attention states, counts, deep links) → Today/This week snapshot → grouped nav tiles. Same page shape for vertical + platform (platform aggregates by vertical + platform-only extras).
- Merge duplicates into ONE vertical-parameterized page set under [vertical]/admin/*; platform tree keeps login/MFA/admins/cause-full/reports-platform + redirects into per-vertical pages (or scope=all param). Superset rule for merged pages (vendor detail keeps fee-override + verification + event readiness).
- Big pages get manager-dashboard treatment: events → pipeline board grouped by stage (TabbedCard/Jump-nav, per-event drill-in later); markets → list + drill-in detail (reuse platform detail pattern) instead of 1836-line modal page.
- Regional managers (future): design nav + hub groups so a "Regions" group can slot in; no build now.

### Functionality-preservation method
Before each page merge: capability inventory (buttons, API calls, filters) of BOTH copies → checklist in this file → merged page checked against it → owner test per phase. No API changes at all.

### Phases (each = one push, owner tests between)
1. Shell + complete nav + badges (no page rewrites) — biggest pain relief, zero functional risk.
2. Hub rebuild (both) as queue tiles + snapshot + grouped tiles.
3. Merge the easy duplicate pages one at a time (users, listings, admins, error-logs, errors, event-ratings, order-issues, analytics, cause, reports).
4. Vendors merge (superset detail).
5. Markets: unify to list + drill-in detail w/ manager assignment etc.
6. Events admin: pipeline layout refactor (workflow unchanged).
7. Regions scaffold (later, with regional-manager feature).

### Questions for owner (in chat)
Q1 merge-the-trees direction OK? Q2 hub = queues-first OK? Q3 events/markets refactors in scope now or later phases? Q4 badge set priorities? Q5 platform admin daily driver = per-vertical pages with an "All verticals" scope?

## OWNER DECISIONS 2026-08-30 (plan LOCKED)
1. Merge direction approved — vertical pages become the daily driver; platform tree keeps login/MFA/platform-admins/cause/cross-vertical reports; scope switcher renders only scopes the user holds ("All verticals" = platform admins only); API auth untouched (lib/auth/admin.ts defect = separate workstream).
2. Queues-first hub approved ("Needs you now" attention tiles → snapshot → grouped nav tiles).
3. Phases 5–6 (markets drill-in, events pipeline board) get THEIR OWN build phases later, but their designs are part of this central plan so they don't get lost.
4. Badge starting set approved: pending vendors, pending markets, event requests, open order-issues, error reports, unremitted cause funds, activity flags.
5. No legacy redirects needed.

## PHASE 5 DESIGN (markets — build later, don't lose)
- `/[vertical]/admin/markets` = LIST page: search + status filter chips (pending/active/inactive/event), one AdminMobileRow-style row per market (name, city, type, status pill, manager state) → drill-in.
- `/[vertical]/admin/markets/[id]` = DETAIL page (absorbs the platform detail + the vertical page's modals): header (name, status, Approve/Reject/Restore per status), cards: Details/Edit · Schedules (ScheduleManager) · Manager (MarketManagerAssignment + ManagerHistoryPanel) · Vendors (VendorManager) · Tax jurisdictions (MarketTaxJurisdictionsCard) · Duplicates check · Danger zone (delete w/ blast-radius counts — keep the existing pre-delete counts endpoint).
- Create stays `/admin`-tier? NO — new market creation moves into the vertical list page ("+ New market"), reusing MarketForm; platform create page redirects.
- Capability inventory before build: buttons/filters/API calls of BOTH current pages (vertical 1836-liner + platform list/new/detail/edit set).

## PHASE 6 DESIGN (events pipeline board — build later, don't lose)
- `/[vertical]/admin/events` = board grouped by stage, one group section per stage with jump-nav: **New requests** (review/approve, auto-approve visibility, invitation-gate state for self-service) → **Inviting** (invite/rematch [respects invitationsHeld], matched counts, pending event-readiness applications) → **Selecting** (acceptances vs vendor_count, bench, fee payments card) → **Upcoming/Event day** (waves, capacity, reconfirm status, broadcast) → **Wrap-up** (reviews, ratings, settlement link, payouts done, repeat event).
- Each event = ONE card showing only its stage's actions (actions already exist: approve, invite, rematch, generate-waves, cancel/restore, repeat, settlement, chipin, fee payments, vendor-fee card, change requests). Stage derivation from status + dates (same fields the current page uses).
- Settlement stays its own drill-in page.
- Capability inventory before build: full button/API list of the current 2000-line page (incl. AdminChangeRequestsCard, EventChipInControl, AdminEventFeePayments, broadcast, ratings links).

## PHASE 2 CAPABILITY INVENTORY (hubs, read 2026-08-30 — nothing may be lost)
PLATFORM hub renders: [banners] stale pending ≥2d → /admin/vendors/pending · stuck orders >24h (paid/confirmed) · open issues (null/new) → /admin/order-issues; [vertical command cards] FM/FT: pending vendors + open issues (via listings join) + event requests, urgent total badge, All clear state → /{v}/admin; [stats ×6] total users/vendors, pending (→pending page), approved, total/published listings (desktop grid + mobile compact rows); [table] 5 newest pending vendors (business, vertical, applied date, Review → /admin/vendors/[id]) + View All; [quick actions ×6] pending vendors, all vendors, listings, platform admins, error reports, CSV reports.
VERTICAL hub renders: [banners equiv] staleCount, stuckOrdersCount, openIssuesCount, pendingEventCount (computed); [cards w/ counts + links ×~10] markets(total/pending/active), vendors(total/pending/approved/pro/boss), users(total/vendor-role/premium buyers), listings(published + active market boxes), vendor-activity (pending flags by reason), events, order-issues, admins, errors, reports, → /admin escape link.
Phase-2 disposition: every count above survives (queues → "Needs you now" tiles; totals → compact Totals grid; per-vertical command cards KEPT on platform hub). The platform hub's inline 5-row pending table moves behind the pending-vendors tile (one tap, /admin/vendors/pending lists all — navigation change, not lost data). NEW: 24h/7d activity snapshot (orders + sales + new vendors/users) — rolling windows, no timezone hardcode.
