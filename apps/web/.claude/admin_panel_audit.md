# Admin Panel Audit — Section-by-Section Deep Dive
Started: 2026-03-28

## Goal
Audit every admin panel section for: data accuracy, presentation (mobile + desktop), and admin action capability. Produce per-section plans that consolidate into a master improvement plan.

## Admin Sections (from AdminNav vertical links)
1. [ ] Dashboard
2. [ ] Analytics
3. [ ] Markets
4. [ ] Vendors (list + detail + pending approval)
5. [ ] Vendor Activity
6. [ ] Listings
7. [ ] Users
8. [ ] Events / Pop-up Markets (+ settlement)
9. [ ] Reports
10. [ ] Feedback
11. [ ] Order Issues (platform admin)
12. [ ] Errors (platform admin)

## Evaluation Criteria (per section)
- **Data accuracy**: Does the page query the right tables/columns? Is anything stale, missing, or misleading?
- **Data completeness**: Does the admin have enough information to do their job?
- **Presentation (desktop)**: Clear layout, good use of space, logical grouping?
- **Presentation (mobile)**: Does the layout work on phone screens? Tables, touch targets, overflow?
- **Admin actions**: Can the admin intervene, confirm, authorize, or take required actions?
- **Consistency**: Does the section match current codebase/schema (not legacy patterns)?

## Status
- Phase 1: Quick scan — COMPLETE
- Phase 2: Per-section deep dives — COMPLETE (12/12 sections)
- Phase 3: Master plan — COMPLETE (see bottom of file)

## Inventory

### Platform Admin Pages (20)
- Dashboard, Vendors (list + detail + pending), Listings, Users
- Markets (list + detail + create + edit), Analytics, Reports
- Order Issues, Errors, Admins, MFA

### Vertical Admin Pages (16)
- Dashboard, Vendors (list + detail), Listings, Users, Markets
- Analytics, Reports, Vendor Activity, Knowledge, Feedback
- Events (list + settlement), Admins, Errors

### API Routes: 35 endpoints

### Navigation: AdminNav component with platform vs vertical link sets

---

## Section Deep Dives

### 1. DASHBOARD — Vertical Admin (`[vertical]/admin/page.tsx`)

**What it queries (13 queries in Promise.all):**
- Markets: total, pending, active counts
- Vendors: total, pending, approved, by tier (standard/premium)
- Users: standard and premium buyer counts
- Listings: published products + active market boxes
- Vendor activity flags (by vertical, with status breakdown)
- Stale vendors (pending 2+ days)

**What it shows:**
- 2x2 grid: Markets card, Vendors card, Users card, Listings card — each with counts
- 4-column row: Vendor Activity (flags by reason), Admins, Errors, Reports
- Warning banner for stale vendors (2+ days pending)

**What's MISSING (admin can't see):**
- [ ] No order metrics — admin has no idea how many orders are pending, active, stuck, or fulfilled
- [ ] No revenue metrics — no daily/weekly sales figures
- [ ] No event status — pending requests, upcoming events, vendor responses
- [ ] No recent activity feed — what happened today? New signups, new orders, new issues?
- [ ] No "needs attention now" prioritization — everything is equal-weight count cards
- [ ] Stuck orders warning exists on platform dashboard but NOT on vertical dashboard
- [ ] Open issues warning exists on platform dashboard but NOT on vertical dashboard
- [ ] Tier counts still reference "standard/premium" — should be Free/Pro/Boss after Session 61 consolidation

**Mobile issues:**
- [ ] 2x2 grid uses `repeat(2, minmax(0, 1fr))` — NO breakpoint to go 1-column on phone
- [ ] 4-column row uses `repeat(4, minmax(0, 1fr))` — creates 4 unusable narrow columns on phone
- [ ] No media queries anywhere in the file
- [ ] AdminNav component (horizontal tabs) DOES handle mobile via overflow-x scroll — this works

**Action capability:**
- Cards link to sub-pages — this is fine for navigation
- No inline actions on the dashboard itself (by design — reasonable)
- Warning banner for stale vendors links directly to review page — good pattern

**Recommendations:**
1. Add responsive breakpoints: 1-col on mobile, 2-col on tablet, current layout on desktop
2. Add "Needs Attention" section at top: stuck orders, open issues, pending approvals, stale vendors, pending event requests — all in one urgency block
3. Add order + revenue summary (today/this week/this month)
4. Add events summary for event-active verticals
5. Fix tier terminology (standard/premium → free/pro/boss)
6. Consider making dashboard cards show the most urgent item, not just counts

---

### 1b. DASHBOARD — Platform Admin (`admin/page.tsx` + `admin/layout.tsx`)

**What it queries:**
- User, vendor, listing counts (total + filtered)
- Recent pending vendors (last 5)
- Stale vendors (2+ days)
- Stuck orders (24hr+ in paid/confirmed)
- Open issues (reported, status new/null)

**What it shows:**
- 6 metric cards (users, vendors, pending, approved, total listings, published)
- Warning alerts: stale vendors, stuck orders, open issues — this is BETTER than vertical admin
- Pending vendor table (last 5 with review button)
- 6 quick action cards

**What's MISSING:**
- [ ] No per-vertical breakdown — platform admin can't see which vertical needs attention
- [ ] No revenue overview across verticals
- [ ] No events summary
- [ ] Per-vertical links exist but don't show urgency indicators

**Mobile issues:**
- [ ] Fixed 250px sidebar in layout.tsx — makes content area too narrow on phones
- [ ] No hamburger menu or drawer — sidebar always visible
- [ ] Metric cards use `repeat(auto-fit, minmax(200px, 1fr))` which is slightly more responsive than vertical admin
- [ ] Pending vendor table has 4 columns — will overflow on phone

**Recommendations:**
1. Add collapsible sidebar / hamburger menu for mobile
2. Add per-vertical urgency indicators on the vertical links (badge counts)
3. Platform dashboard should be a "command center" — show which vertical needs attention, let admin drill in
4. Consider: does the platform admin even need a separate dashboard, or should it be a vertical selector that leads to the vertical admin panels?

---

### 2. VENDORS — Vertical Admin

**Pages:** `[vertical]/admin/vendors/page.tsx` (list) + `[vertical]/admin/vendors/[vendorId]/page.tsx` (detail)

**Vendor List — What it shows:**
- Paginated table (default 20, max 100) with server-side filtering
- Fields: business_name, legal_name, email, phone, vendor_type, status, tier, days_pending, markets
- Filters: status, tier, text search (client-side on business_name, legal_name, email)
- Fetches vendor_verifications in parallel for all vendors on page
- 120-second cache revalidation

**Vendor Detail — What it shows:**
- Business info (all profile_data fields)
- Event readiness application (vehicle specs, logistics, capacity — if submitted)
- Onboarding status (3 gates: verification, category docs, COI)
- User account (email, display_name, created date)
- Quick stats sidebar (tier, listings count, Stripe connected, dates)
- Vendor ID display
- Actions delegated to VendorAdminActions component

**What's MISSING from vendor list:**
- [ ] No cancel rate column (platform admin HAS this, vertical admin doesn't)
- [x] CSV export EXISTS — audit was wrong, VendorManagementClient has it at line 327
- [ ] No listing count per vendor — can't see who has 0 listings (dormant)
- [ ] No last login / last activity date — can't gauge engagement
- [ ] No order count or revenue — can't see vendor performance
- [ ] No Stripe connected status — can't tell who can actually receive payments
- [ ] No event_approved indicator — can't filter event-ready vendors

**What's MISSING from vendor detail:**
- [ ] No order history / recent orders section
- [ ] No revenue summary (how much has this vendor earned?)
- [ ] No listing preview (what are they selling?)
- [ ] No customer feedback / ratings summary
- [ ] No activity timeline (when did they last log in, update a listing, fulfill an order?)

**API capability gap:**
- [ ] **Event approval is platform-admin only** — the `/api/admin/vendors/[id]/event-approval` route checks `platform_admin` role only, NOT vertical admin. A vertical admin managing food trucks can't approve vendors for events.
- [ ] **Rejection reason not persisted** — the reject route reads `reason` from request body but the Supabase update doesn't include it. The reason is sent in the notification but lost from the DB record.
- [ ] No bulk approve/reject — each vendor must be handled individually

**Mobile issues:**
- [ ] Vendor list is a multi-column table — will overflow on phone with no horizontal scroll
- [ ] Vendor detail uses 2-column grid (main + sidebar) with no breakpoint — sidebar gets crushed on mobile
- [ ] Filter controls are inline with no mobile-friendly collapse
- [ ] Touch targets on table rows may be too small

**Action capability:**
- Status transitions work: pending→approved, pending→rejected, approved→suspended, suspended→reactivated
- Approve auto-grants 90-day free trial + sends notification
- 3-gate verification workflow (business, category docs, COI) with per-gate approve/reject
- Event approval toggle (but restricted to platform admin — see gap above)
- Location editor for lat/lng
- All actions use ConfirmDialog — good pattern

**Recommendations:**
1. Add engagement columns to vendor list: listings count, last active, Stripe connected, event_approved
2. Add CSV export to vertical admin (platform admin already has it)
3. Add cancel rate column to vertical admin
4. Fix event-approval API to allow vertical admin (not just platform admin)
5. Persist rejection reason in DB (add `rejection_reason` field or use existing `admin_notes`)
6. Add vendor health summary to detail page: orders, revenue, ratings, last activity
7. Mobile: convert table to card-based layout on small screens, stack detail page to single column
8. Consider bulk approval for pending vendors (common day-one admin task)

---

### 2b. VENDORS — Platform Admin

**Pages:** `admin/vendors/page.tsx` (list) + `admin/vendors/VendorsTableClient.tsx` (table) + `admin/vendors/pending/page.tsx` + `admin/vendors/[vendorId]/page.tsx` (detail) + VendorActions + VendorVerificationWrapper

**Platform vendor list is MORE featured than vertical:**
- Has CSV export with custom columns
- Has cancel rate column (shows % if 10+ confirmed orders, "—" otherwise, color-coded)
- Has vertical filter (since platform admin sees all verticals)
- Debounced search (300ms)
- Tier display correctly shows free/pro/boss with color coding

**Dedicated pending page is useful:**
- Focused view showing only submitted/draft vendors
- Business name, vertical, contact, application date, review button
- "All Caught Up" empty state — good UX

**Platform vendor detail is MORE comprehensive:**
- Includes certifications & documents section with doc links, registration numbers, expiration dates
- VendorVerificationWrapper for 3-gate workflow
- VendorLocationEditor for coordinates
- VendorActions with full status transitions + event approval

**What's MISSING (same as vertical, plus):**
- [ ] No cross-vertical vendor view — a vendor with profiles in both FM and FT shows as separate entries
- [ ] No "vendor health score" or engagement indicator

**Mobile issues — same as vertical plus:**
- [ ] VendorsTableClient renders a full HTML table — no responsive alternative
- [ ] Platform admin layout has fixed 250px sidebar that doesn't collapse

**Recommendations:**
1. Feature parity: vertical admin should have everything platform admin has (CSV export, cancel rate, etc.) — just filtered to one vertical
2. Consider: platform admin vendor list may not need to exist separately if the vertical admin list is fully featured + platform admin can switch verticals
3. Mobile: table → card layout on small screens

---

### 3. EVENTS — Vertical Admin (`[vertical]/admin/events/page.tsx`, 1455 lines)

**This is the most feature-rich admin page in the codebase.** Single-page app with list + detail panel.

**Layout:**
- Master/detail split: `gridTemplateColumns: selectedId ? '1fr 2fr' : '1fr'`
- List on left, detail panel on right when event selected
- Status filter pills at top
- "+ Create Event" button (admin bypass — creates directly in approved status)
- Pending event applications section (vendor event readiness requests)

**What it shows per event:**
- Lifecycle stepper (7-step: received → reviewing → approved → confirmed → active → feedback → settled)
- Company name, contact, date/time, location, headcount, vendor count
- Viability scoring (budget/capacity/duration with green/yellow/red indicators + assumptions)
- Vendor matching data (avg price vs budget, rating, tier, 15-min lead badge)
- Invited vendors with response status
- Admin notes, cuisine/dietary preferences, setup instructions
- Status transition buttons (advance to next status)
- Invite vendor interface (select from event-approved vendors)
- Event page link + copy button
- Settlement link for completed events

**API capabilities (5 endpoints):**
- GET/POST event list + create
- PATCH status transitions with auto-notifications (organizer email on "ready", buyer+vendor on "completed")
- POST invite vendors (bulk, with dedup)
- GET settlement (full financial breakdown by vendor)
- POST repeat event (clone for recurring)

**Settlement page (`events/[id]/settlement/page.tsx`, 710 lines):**
- Print-friendly layout with per-vendor order tables
- Fee transparency: buyer%, vendor%, flat fees by payment type
- Ticket reconciliation (headcount vs orders vs fulfilled)
- CSV export
- Grand totals with platform revenue

**What's GOOD (this section is well-built):**
- Lifecycle stepper gives clear visual progress
- Viability scoring shows the admin whether an event is realistic
- Vendor matching shows pricing fit against budget target
- Settlement has full audit trail with print/export
- Self-service vs full-service events both visible
- Pending event vendor applications shown inline

**What's MISSING:**
- [ ] No organizer communication history — admin can't see messages sent between vendor and organizer
- [ ] No vendor response timeline — when did each vendor respond? How long did it take?
- [ ] No pre-order count on active events — admin can't see how many orders have been placed for an upcoming event
- [ ] Self-service events: admin has limited visibility into the auto-flow — no indicator of whether threshold was met, when organizer was notified, whether organizer has selected trucks
- [ ] No recurring event tracking — `is_recurring` + `recurring_frequency` are stored but not displayed or linked
- [ ] Service level (self_service/full_service) not prominently shown — admin may not realize an event is self-service and try to manually manage it
- [ ] No quick filter for "needs my action" vs "waiting on vendors" vs "waiting on organizer"

**Mobile issues:**
- [ ] Master/detail `1fr 2fr` grid does NOT collapse on mobile — detail panel becomes unusably narrow
- [ ] Lifecycle stepper is horizontal 7 steps with `overflowX: auto` — scrollable but tiny touch targets (22px circles)
- [ ] Create event form uses `gridTemplateColumns: '1fr 1fr'` — no single-column breakpoint for phone
- [ ] Vendor invite section has horizontal scrolling table
- [ ] The page is 1455 lines of inline-styled JSX — significant complexity

**Recommendations:**
1. Mobile: master/detail should switch to full-screen detail with back button on phone
2. Mobile: lifecycle stepper should collapse to current + next step on small screens
3. Mobile: create form should stack to single column
4. Add service_level badge on event cards (self-service vs managed) so admin knows their role
5. Add "organizer status" indicator for self-service events: invited → threshold met → organizer selecting → selections confirmed
6. Add pre-order count for events in ready/active status
7. Add "needs admin action" filter to quickly find events requiring attention
8. Consider splitting this 1455-line page into smaller components for maintainability

---

### 4. MARKETS — Vertical Admin (`[vertical]/admin/markets/page.tsx`, 1509 lines)

**Another mega-page.** Single-page app with inline create/edit forms, list view, and detail/schedule management.

**What it queries:**
- GET `/api/admin/markets?vertical=X` — all markets with nested schedules
- Vendor names resolved for vendor-submitted markets

**What it shows:**
- Market list with: name, type badge, city/state, status badge, approval status
- Inline filters: search, status (active/inactive), approval (pending/approved/rejected), type (traditional/event)
- Create market form (inline, toggled)
- Edit market form (inline, replacing list view)
- Per-market detail: schedules (day/time pills), season dates, lat/lng, vendor-submitted info
- Approval workflow for vendor-submitted markets (approve/reject with reason)
- Schedule management (add/delete schedules per market)
- Market deletion with confirmation

**What's GOOD:**
- Inline CRUD — admin can create, edit, and delete markets without leaving the page
- Schedule management with visual day/time pills
- Approval workflow for vendor-suggested markets with rejection reason
- Filters for status, approval, and type
- Vendor attribution (shows who submitted vendor-suggested markets)

**What's MISSING:**
- [ ] No vendor count per market — can't see how many vendors sell at each market
- [ ] No listing count per market — can't see if a market has active products
- [ ] No order activity per market — "is this market generating orders?"
- [ ] No schedule conflict detection — can create overlapping schedules
- [ ] No map view — managing 50+ markets without seeing them on a map is difficult
- [ ] No market health indicators — is this market active, growing, or dormant?
- [ ] Event markets not distinguished well — events and traditional markets share the same list with only a type badge
- [ ] Private pickup markets show as vendor-managed (admin can only suspend, not edit) — this is correct behavior but needs clearer explanation for a new admin

**API capability gaps:**
- [ ] **Market creation is platform-admin only** — POST `/api/admin/markets` checks `platform_admin` only, NOT vertical admin. A vertical admin cannot create markets.
- [ ] **Market update has a bug** — the PATCH/PUT query includes `.eq('market_type', 'traditional')` (line 129 of API), meaning event markets can't be updated through this endpoint
- [ ] No bulk operations (activate/deactivate multiple markets)

**Mobile issues:**
- [ ] Multiple fixed grid layouts: `2fr 1fr 1fr`, `1fr 1fr`, `2fr 1fr 1fr auto` — none collapse on mobile
- [ ] Create/edit forms use `gridTemplateColumns: '1fr 1fr'` — stays 2-column on phone
- [ ] Schedule day/time pills are small flex items — adequate touch targets but no wrapping consideration
- [ ] Filter dropdowns use `minWidth: 130-200px` — may overflow on narrow phone screens
- [ ] 1509-line single component — same maintainability concern as events page
- [ ] No media queries anywhere in the file

**Recommendations:**
1. Mobile: all grid layouts need single-column breakpoint for phone
2. Mobile: filter bar should collapse to a "Filters" button on small screens
3. Add vendor count + listing count to market list (quick health check)
4. Fix market creation permission — allow vertical admin to create markets for their vertical
5. Fix event market update bug (the `.eq('market_type', 'traditional')` filter)
6. Add visual distinction between market types (traditional vs private_pickup vs event) — perhaps tabs or grouping rather than just a badge
7. Consider map view for geographic admin (especially important for regional admin later)
8. Add "last active" or "orders this month" indicator per market

---

### 4b. MARKETS — Platform Admin

**Pages:** `admin/markets/page.tsx` (list) + `admin/markets/[id]/page.tsx` (detail) + MarketForm + ScheduleManager + VendorManager + DeleteMarketButton + MarketAdminFilters

**This is a more traditional CRUD setup than the vertical admin's mega-page:**
- List page shows: name, type badge, city/state, vendor count, status badge
- Filters: vertical, type, status (with clear filters)
- Detail page shows: market info card, schedule manager, pending vendor applications, approved vendors
- MarketForm: full create/edit form with validation (lat/lng range checks, required fields by type)
- ScheduleManager: add/delete schedules with day/time pickers
- VendorManager: approve/reject pending vendors, manage booth assignments, remove vendors
- DeleteMarketButton: confirmation with cascade warning

**Platform admin market detail is MORE featured than vertical admin:**
- Has dedicated VendorManager for approve/reject/booth assignment
- Has separate ScheduleManager component
- Has "Pending Applications" section with badge count
- Has "Approved Vendors" section with count
- Detail page is a proper multi-section layout

**Vertical admin has this functionality but it's all crammed into one 1509-line file.**

**Mobile issues (platform):**
- MarketForm uses grid layouts (2-3 columns) with no mobile breakpoints
- VendorManager uses flex rows — works better on mobile than grids
- DeleteMarketButton modal uses `width: '90%'` — actually responsive
- No media queries in most files

**Recommendations:**
1. Consider whether the platform admin needs its own markets section, or if it should route to vertical admin markets with a vertical selector
2. Platform admin market detail is better structured — vertical admin should adopt the component-based approach (ScheduleManager, VendorManager as separate components) instead of the monolithic page

---

### 5. LISTINGS — Vertical Admin (`[vertical]/admin/listings/page.tsx`, 202 lines)

**A thin server page that delegates to ListingsTableClient.**

**What it queries:**
- Listings with inner join to vendor_profiles (id, tier, profile_data)
- Fields: id, title, status, price_cents, category, created_at
- Server-side filters: status, category, vertical_id, deleted_at IS NULL
- Client-side search: title, business_name, farm_name
- Pagination with exact count, 120s ISR cache
- Fetches categories dynamically for filter dropdown

**What it shows (via ListingsTableClient — shared with platform admin):**
- Table columns: Title, Vendor (with tier badge), Category, Price, Status (color badge), Created, Action
- Tier badge: Pro = blue, other paid = amber, free = hidden
- Status badges: published = green, draft = amber, other = gray

**Filters:**
- Search (debounced 300ms), status dropdown, category dropdown
- Clear filters button (conditional)

**Actions available:**
- **View only** — single "View" link that opens the listing in a new tab on the public site
- No suspend, no unpublish, no delete, no edit, no flag, no contact vendor

**What's MISSING:**
- [ ] **No admin actions on listings** — admin can view listings but cannot suspend, remove, unpublish, or moderate them. If a vendor posts inappropriate content, the admin has no way to take it down from this page.
- [ ] No inventory/stock information — can't see quantity or out-of-stock status
- [ ] No order count per listing — can't see what's selling vs. dormant
- [ ] No image preview — admin must click through to public page to see listing images
- [ ] No "flagged" or "reported" status — no content moderation workflow
- [ ] No listing age indicator — can't spot stale listings
- [ ] No market associations shown — can't see which markets a listing is sold at
- [ ] No catering/event eligible indicator — can't tell which listings are available for events

**Mobile issues:**
- [ ] Full HTML table with 7+ columns — overflows on phone with no horizontal scroll wrapper
- [ ] Filter bar uses flexWrap which helps, but table itself is the problem
- [ ] No card-based alternative for small screens

**Recommendations:**
1. **Critical: Add admin moderation actions** — at minimum: suspend/unpublish listing, with reason. This is a content moderation gap.
2. Add stock status column (published + qty=0 = "Out of Stock" badge)
3. Add thumbnail preview column (small image from listing)
4. Mobile: table → card layout on small screens, or add horizontal scroll wrapper
5. Add "event eligible" indicator for listings with event_menu_item flag
6. Consider inline quick actions (suspend toggle) rather than requiring navigation to separate page

---

### 5b. LISTINGS — Platform Admin

**Pages:** `admin/listings/page.tsx` + `admin/listings/ListingsTableClient.tsx`

**Same table component as vertical admin, with one addition:**
- Has vertical filter dropdown (since platform admin sees all verticals)
- Has CSV export (7 columns: Title, Vendor, Category, Vertical, Price, Status, Created)
- Same "View" only action — **same moderation gap as vertical admin**

**The platform admin listings page has the same fundamental problem: view-only with no admin actions.**

**Recommendations:**
1. Feature parity: vertical admin should have CSV export
2. Both levels need moderation actions (suspend/unpublish/flag)
3. Platform admin adds vertical column to table — appropriate for cross-vertical view

---

### 6. ORDER ISSUES — Platform Admin Only (`admin/order-issues/page.tsx`)

**This section only exists at the platform admin level. Vertical admins have NO access to order issues.**

**What it queries (API: `/api/admin/order-issues`):**
- order_items where issue_reported_at IS NOT NULL
- Joins: listings (title, vertical_id), markets (name)
- Enriches with: orders (order_number, buyer_user_id), user_profiles (buyer name/email), vendor_profiles (business name)
- Filters: vertical (optional), issue_status
- Counts by status returned alongside issues

**What it shows per issue:**
- Order number + status badge (new/in_review/resolved/closed, color-coded) + vertical badge (FT/FM)
- Listing title, quantity, subtotal price
- Buyer name + email, vendor name, market name
- Issue description (yellow highlighted, italicized quote)
- Admin notes (blue box, if present)
- Reported timestamp

**Filters:**
- Status tabs: New (with count), In Review (with count), Resolved (with count), All (with count)
- No search, no vertical filter, no date range filter

**Actions:**
- "Review / Update" button per issue → inline edit form
- Change status dropdown (new → in_review → resolved → closed)
- Add/edit admin notes textarea
- On resolve/close: sets resolved_at + resolved_by, sends buyer notification

**What's GOOD:**
- Card-based layout (not a table) — actually works better on mobile than other sections
- Status filter tabs with counts — quick triage view
- Color-coded left border by status — visual priority
- Inline edit without leaving the page
- Buyer notification on resolve — closes the loop

**What's MISSING:**
- [ ] **Vertical admin has NO access** — this is the biggest gap. A vertical admin managing day-to-day vendor/buyer relationships cannot see or respond to buyer-reported issues. They'd have to escalate to platform admin for every issue.
- [ ] No vertical filter — platform admin sees all verticals mixed together
- [ ] No search — can't find a specific order or buyer
- [ ] No date range filter — can't see "issues from this week"
- [ ] No link to the order detail or vendor profile — admin can see names but can't navigate to context
- [ ] No escalation workflow — no way to assign an issue to a specific admin or flag it as urgent
- [ ] No vendor response visibility — admin can't see if the vendor already resolved the issue via their own UI (vendor has confirm_delivery and issue_refund actions, but the admin view doesn't show vendor-side resolution)
- [ ] No refund status — if a refund was issued, admin can't see it from this page
- [ ] No issue age indicator — "this issue has been open for 5 days" would help prioritization
- [ ] Counts are computed client-side after fetching ALL issues — won't scale when issue volume grows

**Mobile:**
- Actually better than most sections — card-based layout with flex columns works on phone
- Filter tabs use flexWrap — wraps on narrow screens
- Edit form stacks vertically — fine on mobile
- Only issue: no horizontal padding on the container, content may touch screen edges

**The full issue lifecycle (from code):**
1. Buyer reports issue → order_items.issue_status = 'new', vendor notified
2. Vendor can: confirm_delivery (disputes) OR issue_refund (agrees) → notifies admins if disputed
3. Admin reviews → changes status to in_review → resolved/closed → buyer notified

**But the admin page doesn't show steps 2-3 context.** If a vendor already issued a refund, the admin still sees the issue as "new" unless they check the order separately.

**Recommendations:**
1. **Critical: Add order issues to vertical admin** — vertical admin needs this for day-to-day operations
2. Add vertical filter to platform admin view
3. Add search (order number, buyer name, vendor name)
4. Add links to order detail and vendor profile from each issue card
5. Show vendor resolution status — did the vendor already respond?
6. Show refund status — was money returned?
7. Add issue age badge ("open 3 days") for prioritization
8. Add "Closed" tab to filter tabs (currently missing — only New, In Review, Resolved, All)
9. Move counts to server-side query for scalability

---

### 7. USERS — Both Levels

**Vertical:** `[vertical]/admin/users/page.tsx` | **Platform:** `admin/users/page.tsx` + `UsersTableClient.tsx`

**What it queries:**
- user_profiles with nested vendor_profiles
- Vertical admin: filtered by `verticals` array containing current vertical
- Platform admin: adds vertical filter dropdown
- Pagination: 20/page default, max 100

**What it shows:**
- Table: email, display_name, role (color badge), verticals, buyer_tier (with expiration for premium), vendor_status (badge), vendor_tier, join date
- Role badges: admin=purple, vendor=blue, buyer=gray
- Platform admin adds: vertical column, vertical filter

**Filters:**
- Search (email/display_name, debounced 300ms)
- Role dropdown (admin/vendor/buyer)
- Vendor status, vendor tier, buyer tier
- CSV export (platform admin)
- Clear filters button

**Actions: NONE**
- Purely read-only table. No suspend, no edit, no reset password, no role change, no click-to-detail.
- CSV export is the only "action"

**What's MISSING:**
- [ ] **No admin actions whatsoever** — can't suspend a user, change their role, reset their password, adjust their tier, or even view their profile details
- [ ] No click-to-detail — can't drill into a user to see their orders, listings, activity
- [ ] No last login / last activity column
- [ ] No "accounts at risk" view (expired premium, abandoned carts, etc.)
- [ ] Vertical admin has no CSV export (platform does)
- [ ] Vendor tier filter still uses legacy names (free/standard/premium/featured) — should be free/pro/boss
- [ ] No bulk operations

**Mobile:**
- [ ] Full table with 8+ columns — overflows on phone
- [ ] Filter dropdowns use minWidth: 120px — may overflow on narrow screens
- [ ] No card-based alternative
- [ ] No horizontal scroll wrapper

**Recommendations:**
1. Add user detail page/drawer with: order history, activity, role management
2. Add admin actions: suspend, change role, reset password (at minimum)
3. Fix vendor tier filter labels (legacy → unified)
4. Add CSV export to vertical admin
5. Mobile: table → card layout on small screens
6. Add last active column for engagement monitoring

---

### 8. ANALYTICS — Both Levels

**Vertical:** `[vertical]/admin/analytics/page.tsx` | **Platform:** `admin/analytics/page.tsx`

**What it queries (3 parallel API calls):**
- `/api/admin/analytics/overview` — revenue, orders, vendors, listings, users, completion rate
- `/api/admin/analytics/trends` — daily/weekly/monthly revenue + order counts
- `/api/admin/analytics/top-vendors` — top 10 vendors by revenue

**What it shows:**
- Primary metrics (4 cards): total revenue, total orders, active vendors, published listings
- Secondary metrics (4 cards): avg order value, completed/pending/cancelled orders
- Sales trend chart (revenue or orders toggle)
- Top vendors table
- Order status breakdown with completion rate
- Platform admin adds: total users, new signups

**Filters:**
- Date range picker with 30-day default
- Chart toggle (revenue vs orders)
- No vertical filter on platform admin (sees all combined — can't compare verticals)

**What's GOOD:**
- **Has responsive CSS** — media queries for 1/2/4 column grids at mobile/tablet/desktop breakpoints
- This is the ONLY admin section with proper responsive styling
- Clean card-based metrics layout
- Trend chart with toggle

**What's MISSING:**
- [ ] No period-over-period comparison ("vs last month")
- [ ] No vertical breakdown on platform admin (can't see FM vs FT performance)
- [ ] No drill-down from metrics to underlying data (click revenue → see orders)
- [ ] No export/download for analytics data
- [ ] No real-time indicators (today's orders, current active sessions)
- [ ] Top vendors table shows revenue but no trend (growing/declining)
- [ ] No buyer analytics (acquisition, retention, repeat purchase rate)
- [ ] No event revenue tracking (events vs regular orders)

**Mobile:**
- Actually works — responsive grid breakpoints defined
- Charts may be small but readable
- Date picker could be tight on phone but functional

**Recommendations:**
1. Add period comparison (current vs prior period, % change)
2. Add vertical selector/comparison on platform admin
3. Add drill-down from metric cards to filtered order/user lists
4. Add analytics export (CSV or PDF)
5. Add event revenue as separate metric for event-active verticals

---

### 9. REPORTS — Both Levels

**Vertical:** `[vertical]/admin/reports/page.tsx` (924 lines) | **Platform:** `admin/reports/page.tsx` (624 lines)

**Two tabs: CSV Reports + Quality Checks**

**CSV Reports:**
- 18 report types across 5 categories (Sales, Operations, Vendors, Customers, Inventory)
- Platform admin adds 6 accounting reports (Transaction Reconciliation, Refund Detail, External Fee Ledger, Subscription Revenue, Tax Summary, Monthly P&L)
- Date range filter with quick presets (7/30/90 days)
- Select all/none/by category
- Real-time download progress log with color-coded status
- Batch download with sticky footer

**Quality Checks (vertical admin only):**
- 5 check types: Schedule Conflict, Low Stock + Event, Price Anomaly, Ghost Listing, Inventory Velocity
- 3 severity levels: Action Required (red), Heads Up (orange), Suggestion (blue)
- Scan history table with status
- Active findings table with vendor name
- "Run Now" button for manual scan trigger

**What's GOOD:**
- Comprehensive report suite — 18-24 report types covers most business needs
- Quality checks are proactive monitoring — finds problems before vendors report them
- Batch download with progress tracking is well-designed
- Manual scan trigger gives admin on-demand control

**What's MISSING:**
- [ ] No scheduled/automated report delivery (email weekly summary)
- [ ] No report favorites or "my reports" view
- [ ] Quality check findings don't link to the vendor profile — admin sees the finding but has to navigate separately to act on it
- [ ] No quality check trend (are findings increasing or decreasing over time?)
- [ ] Platform admin doesn't have quality checks tab — only vertical admin does

**Mobile:**
- Report selection uses grid auto-fit with minmax — reasonable on mobile
- Quick preset buttons use flexWrap
- Download log may be hard to read on narrow screen
- Quality check tables would overflow

**Recommendations:**
1. Add vendor profile links from quality check findings
2. Add quality checks to platform admin (aggregate view across verticals)
3. Consider scheduled report delivery via email
4. Mobile: quality check tables → card layout

---

### 10. FEEDBACK — Vertical Admin Only (`[vertical]/admin/feedback/page.tsx`, 1132 lines)

**What it queries (API: `/api/admin/feedback`):**
- 3 tabs: Shopper Feedback, Vendor Feedback, Order Issues
- Feedback from `shopper_feedback` and `vendor_feedback` tables
- Enriched with user emails and vendor names
- Order issues tab reuses the order issues data from `/api/admin/order-issues`

**What it shows per item:**
- Category, message, user email, vendor name (if applicable)
- Status badge (new/in_review/resolved/closed)
- Timestamps (reported, resolved)
- Market suggestion detail panel (name, location, schedule)
- Admin notes

**Filters:**
- Search (full-text across message, email, market name)
- Category dropdown (varies by tab)
- Status filter (new/in_review/resolved/closed)
- Status count badges on filter tabs

**Actions:**
- Status updates (4-state workflow)
- Admin notes (save per item)
- Detail modal with full view

**What's GOOD:**
- Three feedback sources in one place — admin doesn't need separate pages
- Market suggestion detail is smart (shows name + location + schedule)
- Status workflow with counts gives triage capability
- Search across multiple fields

**What's MISSING:**
- [ ] **Platform admin has NO feedback page** — only exists at vertical level
- [ ] No response capability — admin can update status and notes but can't reply to the user
- [ ] No link to user profile or vendor profile from feedback
- [ ] No feedback age indicator
- [ ] No trending topics / category frequency analysis
- [ ] Order Issues tab duplicates platform admin functionality — potential confusion about which is authoritative

**Mobile:**
- Uses auto-fit grid for stat cards — reasonable
- Feedback cards use flex with minWidth:200 — wraps on mobile
- Detail modal uses maxWidth:600 + 100% width — responsive
- Filter controls use flexWrap

**Recommendations:**
1. Add feedback to platform admin (aggregate view)
2. Add reply-to-user capability (even if it's just an email)
3. Add links to user/vendor profiles
4. Clarify Order Issues tab relationship with platform admin order-issues page
5. Add feedback age badges for prioritization

---

### 11. VENDOR ACTIVITY — Vertical Admin Only (`[vertical]/admin/vendor-activity/page.tsx`)

**Thin wrapper** that delegates to VendorActivityClient component.

**What the API returns (`/api/admin/vendor-activity/flags`):**
- Flagged vendors with: reason, status, details, resolution notes, action taken
- Enriched vendor data: business name, email, phone, last active, last login, first listing date, created/approved dates
- 5 flag reasons: no_recent_login, no_published_listings, incomplete_onboarding, no_recent_orders, no_recent_listing_activity
- Pagination (50/page default)
- Summary counts by status

**Filters:**
- Status (pending default)
- Reason
- Vertical
- Pagination

**What's GOOD:**
- Proactive vendor health monitoring
- Rich vendor context per flag (last active, last login, first listing)
- Tracks resolution notes and action taken
- Feeds into dashboard warning counts

**What's MISSING:**
- [ ] **Platform admin has NO vendor activity page** — only vertical level
- [ ] No direct action from flag (can't email vendor, can't suspend, can't link to vendor profile)
- [ ] No flag age indicator
- [ ] No bulk resolve (mark multiple flags as addressed)
- [ ] No outreach tracking (did we contact this vendor? what was the result?)

**Recommendations:**
1. Add action buttons: email vendor, view vendor profile, suspend vendor
2. Add vendor activity to platform admin (aggregate across verticals)
3. Add bulk resolve for flags
4. Add contact/outreach tracking per flag

---

### 12. ERRORS + KNOWLEDGE + ADMINS — Both Levels

**Errors** (`[vertical]/admin/errors/page.tsx` + `admin/errors/page.tsx`):
- Well-structured two-panel layout (list + detail sidebar)
- 6 status states with color coding
- Vertical admin can: acknowledge, escalate to platform, resolve, mark duplicate
- Platform admin adds: escalation level filter, platform admin notes, "Copy Context for Developer" (markdown export), "Record Fix Attempt" form, similar reports cross-vertical view
- **This is actually well-designed for a two-level admin system**

**Knowledge Base** (`[vertical]/admin/knowledge/page.tsx`):
- Simple wrapper for KnowledgeEditor component
- Manages help articles visible to users
- Vertical-scoped
- "View Public Page" link to /help

**Admin Management** (`[vertical]/admin/admins/page.tsx` + `admin/admins/page.tsx`):
- List table with add/remove capabilities
- Chief admin hierarchy (only chiefs can add/remove, can't remove yourself)
- Vertical admin: chief vertical admin can manage, platform admin always can
- Platform admin: chief platform admin hierarchy
- Role badges (Chief = yellow, Regular = blue)

**What's GOOD about Errors:**
- Proper escalation workflow (vertical → platform)
- Developer context export
- Fix attempt tracking
- Cross-vertical similar report detection
- This is the best-designed two-level section in the admin panel

**What's MISSING:**
- [ ] Error page detail panel uses fixed 450-500px sidebar — doesn't collapse on mobile
- [ ] Knowledge base is minimal — no categories, no search, no analytics on article views
- [ ] Admin management has no audit log (who added/removed whom, when)

**Recommendations:**
1. Error detail panel: collapse to full-screen on mobile
2. Admin management: add audit trail for admin changes
3. Knowledge base: add categories and search

---
---

# MASTER PLAN — Admin Panel Overhaul

## Guiding Principles

1. **Vertical admin is the primary work surface** — that's where the hire lives daily
2. **Fix bugs before adding features** — permission bugs and broken updates are higher priority than new capabilities
3. **Mobile is a requirement, not a nice-to-have** — admin will be on-the-go at markets and events
4. **Pattern-based fixes over page-by-page fixes** — solve the 5 systemic patterns, not 50 individual issues
5. **Don't break what works** — events lifecycle, error escalation, analytics responsive CSS, quality checks are good; build on them
6. **Future-proof for regional admin** — design vertical admin sections so subsections can be scoped by region later

## The 5 Systemic Patterns → 5 Work Phases

---

### PHASE 1: Fix Permission Bugs + API Gaps (HIGHEST PRIORITY)
**Why first:** These are blocking issues — the vertical admin literally cannot perform their job in some areas.

| Bug | File | Fix |
|-----|------|-----|
| Vertical admin can't approve vendors for events | `api/admin/vendors/[id]/event-approval/route.ts` | Add vertical admin check alongside platform admin |
| Vertical admin can't create markets | `api/admin/markets/route.ts` POST | Add vertical admin check (scoped to their vertical) |
| Event market updates silently fail | `api/admin/markets/[id]/route.ts` PATCH | Remove `.eq('market_type', 'traditional')` filter or add event market handling |
| Rejection reason not persisted | `api/admin/vendors/[id]/reject/route.ts` | Save `reason` to `admin_notes` or new `rejection_reason` column |
| Tier filter uses legacy names | `UsersTableClient.tsx` | Update filter options to free/pro/boss |
| Dashboard tier counts say standard/premium | `[vertical]/admin/page.tsx` | Update to Free/Pro/Boss |

**Estimated scope:** 6 targeted fixes across API routes + 2 UI label updates. No migrations needed.

---

### PHASE 2: Mobile Responsive Foundation (HIGH PRIORITY)
**Why second:** Admin needs mobile access at markets, events, and on-the-go.

**Approach: Build once, apply everywhere.**

Create a shared responsive pattern (CSS classes or a wrapper) that all admin pages use:

1. **Platform admin layout:** Replace fixed 250px sidebar with collapsible hamburger drawer on screens < 768px
2. **Admin responsive utilities** — reusable CSS class block:
   - `.admin-grid-2` → 1-col mobile, 2-col tablet+
   - `.admin-grid-3` → 1-col mobile, 2-col tablet, 3-col desktop
   - `.admin-grid-4` → 1-col mobile, 2-col tablet, 4-col desktop
   - `.admin-table-responsive` → horizontal scroll wrapper or card-based on mobile
   - `.admin-detail-panel` → full-screen overlay on mobile, side panel on desktop
   - `.admin-filter-bar` → collapse to "Filters" button on mobile
3. **Apply to all admin pages** — replace inline grid styles with the shared classes

**Pages requiring responsive work (prioritized by vertical admin usage):**
1. Vertical admin dashboard (2x2 + 4-col grids)
2. Vendors list + detail (table + 2-col detail)
3. Markets page (multi-column grids, inline forms)
4. Events page (master/detail split, lifecycle stepper, forms)
5. Listings (table)
6. Users (table)
7. Order issues (already card-based — minimal work)
8. Feedback (mostly responsive — minor tweaks)
9. Reports (mostly responsive — quality check tables)
10. Errors (detail sidebar)

**Note:** Analytics already has responsive CSS — use it as the reference pattern.

---

### PHASE 3: Vertical Admin Feature Parity (HIGH PRIORITY)
**Why third:** The vertical admin must be as capable as the platform admin for their vertical's scope.

| Feature | Currently | Target |
|---------|-----------|--------|
| CSV export | ALREADY EXISTS on both levels (audit was wrong) | No action needed |
| Cancel rate column | Platform vendors only | Add to vertical admin vendors |
| Dedicated pending approvals view | Platform only | Add to vertical admin (or prominent filter) |
| Order issues | Platform only | Add to vertical admin (filtered to their vertical) |
| Vendor activity | Vertical only | Add aggregate to platform admin |
| Feedback | Vertical only | Add aggregate to platform admin |
| Quality checks | Vertical only | Add aggregate to platform admin |

**Also add to vertical admin dashboard:**
- Stuck orders count + link (currently platform-only)
- Open issues count + link (currently platform-only)
- Pending event requests count
- Revenue summary (today/week/month)

---

### PHASE 4: Admin Action Capabilities (MEDIUM PRIORITY)
**Why fourth:** Once admin can see the data (Phases 1-3), they need to act on it.

**Listings — content moderation:**
- Add suspend/unpublish action per listing
- Add reason field for moderation actions
- Show moderated status badge
- Notify vendor when listing is suspended

**Users — account management:**
- Add user detail drawer/page (order history, activity, role info)
- Add suspend/deactivate action
- Add role change capability (buyer → vendor referral, admin promotion)
- Add tier override (manual premium grant/revoke)

**Vendor Activity — direct action:**
- Add "Email Vendor" button from flag (opens compose with pre-filled context)
- Add "View Vendor Profile" link from flag
- Add bulk resolve for flags
- Add outreach tracking (contacted date, response, outcome)

**Feedback — response capability:**
- Add reply-to-user (sends email via platform)
- Add link to user/vendor profile from feedback item
- Add feedback age badge

**Order Issues — context:**
- Add links to order detail + vendor profile
- Show vendor-side resolution status (did vendor already respond?)
- Show refund status
- Add issue age badge

---

### PHASE 5: Data Enrichment + Navigation (LOWER PRIORITY)
**Why last:** Polish and depth — valuable but not blocking.

**Dashboard overhaul:**
- "Needs Attention" urgency section at top (stuck orders, open issues, stale vendors, pending events)
- Revenue + orders summary cards
- Events summary for event-active verticals
- Recent activity feed (last 10 actions across platform)

**Cross-page navigation:**
- Vendor list → click → vendor detail page
- User list → click → user detail page/drawer
- Quality check finding → click → vendor profile
- Feedback item → click → user/vendor profile
- Dashboard metric card → click → filtered list view
- Order issue → click → order detail

**Data enrichment in list views:**
- Vendors: listing count, last active, Stripe connected, event_approved, order count
- Markets: vendor count, listing count, last order activity
- Listings: stock status, order count, image thumbnail, market associations, event eligible
- Users: last login, order count

**Analytics depth:**
- Period-over-period comparison (% change)
- Vertical comparison on platform admin
- Event revenue as separate metric
- Buyer analytics (acquisition, retention)
- Export analytics data

---

## Implementation Order Within Each Phase

Each phase should be implemented as **one session per section**, committed and tested before moving to the next section. Suggested order within phases:

**Phase 1** (1 session): All 6 bug fixes in one pass — they're small, targeted API changes.

**Phase 2** (2-3 sessions):
- Session A: Build responsive utility classes + fix platform sidebar + fix dashboard grids
- Session B: Fix tables (vendors, listings, users) + master/detail pages (events, markets)
- Session C: Fix remaining pages (errors, reports, forms)

**Phase 3** (2-3 sessions):
- Session A: Add order issues + dashboard urgency cards to vertical admin
- Session B: CSV export + cancel rate + pending view to vertical admin
- Session C: Add aggregate views (activity, feedback, quality) to platform admin

**Phase 4** (3-4 sessions):
- Session A: Listing moderation actions
- Session B: User management actions + detail page
- Session C: Vendor activity direct actions + feedback replies
- Session D: Order issues context enrichment

**Phase 5** (3-4 sessions):
- Session A: Dashboard overhaul
- Session B: Cross-page navigation links
- Session C: Data enrichment columns in list views
- Session D: Analytics depth

---

## Total Estimated Sessions: 11-15

**Critical path (Phases 1-3):** 4-7 sessions to get vertical admin fully functional and mobile-ready
**Full plan (Phases 1-5):** 11-15 sessions for complete admin panel overhaul

## What NOT to Build (Explicitly Deferred)

- Regional admin role/UI — not defined enough yet, revisit after vertical admin is solid
- State admin overlay — same as above
- Automated report scheduling — nice-to-have, not blocking
- Real-time dashboards (WebSocket) — premature for current scale
- Admin-to-vendor in-app messaging — email is sufficient for now
- Bulk vendor import — not needed pre-launch
