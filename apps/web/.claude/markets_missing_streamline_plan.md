# "Markets You're Missing" → Vendor Expansion Streamline (plan, 2026-09-05)

## ✅ BUILT 2026-09-05 (owner chose OPTION A + manager notification; simple 3-case design
## replaced the original Phase 1-3 plan below — kept for reference only)
- Apply-flow bug fixed at BOTH sites (same id-space bug): the POST ownership check
  (markets/[id]/vendors :143 → compares auth uid to auth uid) AND the market page's vendor
  lookup (markets/[id]/page :146 — the Apply button had never rendered for any vendor).
  End-to-end now: button renders → POST succeeds → market page shows the "applied" chip.
- `market_vendor_application` notification (manager, standard = email+in_app; email via
  auth.admin lookup) sent from the apply POST for MANAGED markets — tripwire **127→128**
  (owner: "no point in waiting"). Approval already notifies the vendor (B-close-2) and the
  schedule trigger guards on approved=true (mig 210 :114) — applying does NOT enable selling.
- Insights "Markets You're Missing" → owner's 3-case design: lead line (already selling
  off-app → attach listings via Locations page) + TWO GROUPS: "Managed on the app" (rows link
  to the market page → "View & apply") and "Not on the app yet" (contact email/phone/website
  shown when present; "View market"; apply direct, wire up after). API missingMarkets rows
  gained managed/contactEmail/contactPhone/website (location-insights route).
- Governance side-door (locations-page schedule join bypasses managers) deliberately UNCHANGED —
  parked as a later decision per the owner.
Gates: tsc ✓ · 2169/2169 ✓ · lint 0 err. UNCOMMITTED.


Owner ask: "revisit the process involved with a vendor getting 'added' to a market and come up
with a plan to use this section that is already built and showing potentially valuable info to
streamline the process for vendors that want to sell at additional markets." PLAN ONLY — no build.

## How a vendor joins a market TODAY (traced 2026-09-05, all cited)

**The roster row is `market_vendors`** (approved bool = manager's activation toggle;
vendor-approval/route.ts:11-24). **Attendance schedules auto-follow the roster**: triggers on
market_vendors INSERT/UPDATE create vendor_market_schedules rows (snapshot triggers :3669-3670),
and market-schedule changes propagate to vendors (:3661-3662) — so joining the roster is what
makes `get_available_pickup_dates` treat the vendor as attending. **Selling additionally needs
listing_markets links** (the vendor attaches listings to the market).

Working entry paths:
1. **Co-branded signup** — /vendor-signup?market=<id> → /api/submit auto-creates market_vendors
   approved=false → manager reviews in VendorBoothList → vendor-approval PATCH flips approved
   (route doc :11-15). For NEW vendors only.
2. **Manager-initiated** — InviteVendorLink (same co-brand signup) + InviteVendorBrowser.
3. **Booking = joining** — the FM booth book route upserts market_vendors {approved:false}
   (book/route.ts:352) as a side effect of the first booking. Money-first join.
4. ⛔ **BROKEN: the public "Apply to Sell Here"** (ApplyToMarketButton → POST
   /api/markets/[id]/vendors). The ownership check compares `vendor_profiles.user_id` (an AUTH
   uid — FK auth.users) against `user_profiles.id` (the profile table's OWN uuid_generate_v4 PK;
   the signup trigger only sets user_id — 20260105_152200_001:31-37). They can never match ⇒
   **every application 403s** "You can only apply with your own vendor profile"
   (markets/[id]/vendors/route.ts:143). CONFIRMED at code level. Same stale pre-market-management
   family as the retired /api/markets CRUD (2026-08-31 phantom columns). Even if it worked:
   no manager notification, no status surfaced anywhere, applications land nowhere visible.

So an EXISTING vendor wanting a second market has no working self-serve path except "make a
booking" (path 3) — which only exists for managed markets with booth/spot inventory.

## The plan — three phases

### Phase 1 — Fix the foundation (small; prerequisite for everything)
- **Fix the Apply route identity check**: compare `vendor_profiles.user_id === user.id` directly
  (the user_profiles lookup is unnecessary). Re-application after a prior row: today any existing
  row 400s ("already applied") — fine for v1.
- **Notify the manager** on application (managed markets): needs a notification type —
  `market_vendor_application` (manager, standard = email+in_app) → **tripwire 127→128, OWNER
  APPROVAL NEEDED (D2)**. Unmanaged markets: no recipient — see D3.
- **Notify the vendor on approval** (vendor-approval PATCH already imports sendNotification —
  verify whether an approval notice exists; add if not, possibly same-type family).

### Phase 2 — Make "Markets You're Missing" the expansion cockpit (the core)
Extend the location-insights API's missingMarkets rows with per-market STATE, and render a
state-aware action + status chip per row:
- **No relationship + managed FM market with booth inventory** → "Book a booth" deep-link
  (the booking flow already joins the roster — the fastest real path) AND/OR "Apply" inline.
- **No relationship + managed FT park** → "Book a spot" / "Request standing spot" deep-links.
- **No relationship + managed, no bookable inventory** → inline "Apply" (fixed route; optional
  note) → chip flips to "Applied — awaiting manager approval."
- **No relationship + unmanaged market** → "Add to my locations" (creates the roster row; D3
  decides the approval semantics).
- **Applied (approved=false, not revoked)** → status chip "Applied {date} — awaiting approval."
- **Approved but no listings attached there** → "Attach listings" nudge → listings page.
Row keeps the existing value signal (distance, vendor count) — the ACTION becomes state-true.

### Phase 3 — Follow-through checklist (polish, later)
Per joined market, a mini progress line on the row (data all exists): roster ✓ → schedule ✓
(auto-trigger) → listings attached (N) → first order. Turns "you're missing this market" into
"here's exactly where you are in capturing it."

## Decisions needed from the owner
- **D1**: Fix the broken Apply route now (Phase 1 is also a live-bug fix), or hold for the batch?
- **D2**: New notification type `market_vendor_application` (tripwire 127→128)? And an approval
  notice to the vendor if none exists?
- **D3**: Unmanaged markets — who approves? Options: (a) auto-approve on self-add (nobody is
  there to review; approved=false currently blocks nothing buyer-facing for unmanaged markets —
  VERIFY at build), (b) admin approves, (c) leave unmanaged self-add out of v1.
- **D4**: Should "Book a booth/spot" be the PRIMARY action for managed markets with inventory
  (money-first join, already works), with Apply as the no-inventory fallback? (My recommendation:
  yes.)

## Size: Phase 1 ~half session · Phase 2 ~1 session · Phase 3 small add-on.
No protected files. No migrations (all state derivable from existing tables).
