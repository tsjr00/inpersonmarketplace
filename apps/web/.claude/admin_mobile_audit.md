# Admin Panel Mobile Audit + Plan

**Date:** 2026-04-27
**Driver:** User reports admin sub-pages (vendors, listings, markets) are difficult to use on mobile while admin work is increasingly done on phone.
**Scope:** 20 admin pages under `src/app/admin/` + 5 admin components under `src/components/admin/`. No `/[vertical]/admin` routes exist (admin is platform-only).
**Mode:** Report — no code changes.

---

## Existing infrastructure (good news)

`src/components/admin/AdminResponsiveStyles.tsx` (~250 LOC) already defines a comprehensive set of responsive utility classes:

| Class | Purpose |
|-------|---------|
| `.admin-grid-{2,3,4,6}` | 1-col mobile → 2-col tablet → 2/3/4 desktop |
| `.admin-detail-split` | Master/detail panels (1-col mobile, side-by-side desktop) |
| `.admin-filter-bar` | Wrapping filter bar |
| `.admin-table-wrap` | Horizontal-scroll wrapper for tables |
| `.admin-stack-mobile` | Column-on-mobile flex |
| `.admin-sidebar` | Hidden-on-mobile sidebar with hamburger toggle |
| `.admin-form-grid` | Responsive 2-col forms |

**Breakpoints:** mobile < 640px, tablet 640–1023px, desktop ≥ 1024px.

**The infrastructure isn't the problem. The problem is uneven adoption.**

---

## Per-page mobile-readiness assessment

Categories:
- ✅ **Mobile-friendly** — works as-is on phone
- 🟡 **Partial** — uses some helpers but has rough edges
- ❌ **Not optimized** — hard-coded layouts that break on phone
- ⏸ **N/A** — small/login surface, mobile-fine by accident

### List pages

| Page | Status | Notes |
|------|--------|-------|
| `admin/vendors/page.tsx` (+ `VendorsTableClient.tsx`) | 🟡 Partial | Filter bar wraps OK. Table wrapped in `.admin-table-wrap` → horizontal scroll on mobile. **8 columns × ~600px min = each column ~75px wide. Action button is far-right column → user must scroll all the way over to tap "View".** |
| `admin/listings/page.tsx` (+ `ListingsTableClient.tsx`) | 🟡 Partial | Same pattern as vendors. 8 columns, same scroll-to-act issue. |
| `admin/markets/page.tsx` (+ `MarketAdminFilters.tsx`) | 🟡 Partial | Uses `<table>`. Same horizontal scroll. |
| `admin/users/page.tsx` (+ `UsersTableClient.tsx`) | 🟡 Partial | Same horizontal scroll table. |
| `admin/vendors/pending/page.tsx` | 🟡 Partial | Adopts `.admin-table-wrap`. |
| `admin/admins/page.tsx` (manage admins) | 🟡 Partial | Has `<table>` + `.admin-table-wrap`. Smaller surface. |
| `admin/event-ratings/page.tsx` | 🟡 Partial | Adopts admin grid helpers. |
| `admin/error-logs/page.tsx` | 🟡 Partial | Adopts helpers. |
| `admin/order-issues/page.tsx` | Unknown | Not yet inspected — no helpers detected by grep. Likely ❌. |
| `admin/reports/page.tsx` | Unknown | Not yet inspected — uses inline grid styles per grep. |

### Detail pages — most painful for mobile admin

| Page | Status | Specific issue |
|------|--------|----------------|
| **`admin/vendors/[vendorId]/page.tsx`** | ❌ **Not optimized** | Line 153: `gridTemplateColumns: '2fr 1fr', gap: 30` — locks 2-col layout regardless of viewport. On 375px-wide phone: main panel ≈250px, sidebar ≈125px. Both columns unusable. Profile-data rows use `width: 150` for labels in `flex` containers → labels eat the entire main panel, values get crushed. |
| **`admin/markets/[id]/page.tsx`** | ❌ **Not optimized** | Line 145: `gridTemplateColumns: '1fr 1fr', gap: 24` for the Market Information block. On mobile, description and address fields are squished side-by-side with ~150px each. Header has `flex` with title+badges left, "Edit Market" button right — button is hard to tap on phone. |
| **`admin/markets/[id]/edit/page.tsx`** | ❌ **Not optimized** | Wraps `MarketForm` (see below). |
| **`admin/markets/new/page.tsx`** | ❌ **Not optimized** | Wraps `MarketForm`. |
| `admin/vendors/[vendorId]/VendorActions.tsx` | Unknown | Not yet inspected — likely a row of action buttons that may overflow. |

### Forms (create/edit)

| Component | Status | Specific issue |
|-----------|--------|----------------|
| **`admin/markets/MarketForm.tsx`** | ❌ **Not optimized** | **5 hard-coded grids** — all `1fr 1fr` or `2fr 1fr 1fr`. Lines 179 (vertical/type), 232 (season dates), 280 (city/state/zip), 362 (vendor times), 409 (capacity/booth). On mobile each input gets ~155px and labels don't have room. The single full-width inputs (name, description, address) are fine. |
| `admin/markets/[id]/ScheduleManager.tsx` | Unknown | Has `gridTemplateColumns` per grep — likely same pattern. |
| `admin/vendors/[vendorId]/VendorLocationEditor.tsx` | ❌ **Not optimized** | Line 157: `gridTemplateColumns: '1fr 1fr'` — lat/lng side-by-side even on mobile. |

### Pages that are already OK (or close enough)

| Page | Status | Notes |
|------|--------|-------|
| `admin/page.tsx` (dashboard) | ✅ | Uses `.admin-grid-*` helpers. Cards stack on mobile naturally. |
| `admin/errors/page.tsx` | ✅ | Uses `repeat(auto-fill, minmax(180px, 1fr))` — collapses to 1-col when narrow. |
| `admin/login/page.tsx` | ✅ | Single-column login form. |
| `admin/mfa/setup/page.tsx`, `mfa/verify/page.tsx` | ✅ | Single-column flows. |
| `admin/layout.tsx` | ✅ | Uses `.admin-sidebar` (hides on mobile, hamburger toggle). |

### Pages that are **wrong** (not horizontally-scrollable, just broken)

| Page | Status | Specific issue |
|------|--------|----------------|
| `admin/analytics/page.tsx` | ❌ **Not optimized** | Line 501: `gridTemplateColumns: 'repeat(3, 1fr)'` for metric cards — always 3 columns, even on phones. Each card gets ~115px width. |

---

## Root-cause summary

The admin panel was built desktop-first. When responsive helpers were added later (`AdminResponsiveStyles.tsx`), about half the pages adopted them — **but mostly only the easy wins** (filter bars + horizontal-scroll table wrappers). The pages that need the *actual hard work* — converting tables to cards, breaking 2-col detail layouts into stacks, making forms mobile-first — were left as-is.

Net effect for a phone-using admin:
- **List pages "kind of work"** via horizontal scroll, but you swipe a lot and the action button is always at the far right.
- **Detail pages are broken** — squished 2-col layouts make every row of metadata a struggle.
- **Forms are unusable** for serious editing — half-width inputs, capped-at-150px-each fields.

---

## Plan

### Phase 1 — Quick wins on detail/form pages (highest pain, lowest risk)

Replace hard-coded `gridTemplateColumns` strings with the existing `.admin-grid-2` (or a new helper if needed) so they collapse to 1-col on mobile.

| File | Lines | Change |
|------|-------|--------|
| `admin/vendors/[vendorId]/page.tsx` | 153 | Remove inline `gridTemplateColumns: '2fr 1fr'`. Replace with `className="admin-detail-split has-detail"` (helper already exists). The right "sidebar" stacks below on mobile. |
| `admin/vendors/[vendorId]/page.tsx` | 165-186, 331-345 | Profile-data rows: change `display: 'flex'` + fixed `width: 150` label to `display: 'grid', gridTemplateColumns: 'minmax(120px, 200px) 1fr'` so label is capped but content gets the rest. Or use `.admin-stack-mobile` to stack label/value vertically on mobile. |
| `admin/markets/[id]/page.tsx` | 92 | Header with title-left + "Edit Market" button right: wrap in `.admin-stack-mobile` so button drops below title on mobile. Alternative: make button full-width on mobile via media query. |
| `admin/markets/[id]/page.tsx` | 145 | Change `gridTemplateColumns: '1fr 1fr'` to `className="admin-grid-2"`. |
| `admin/markets/MarketForm.tsx` | 179, 232, 280, 362, 409 | Replace each inline grid with `className="admin-form-grid"` (already defined in `AdminResponsiveStyles`). The 3-col `2fr 1fr 1fr` city/state/zip needs a custom rule — propose adding `.admin-form-grid-3` to the responsive styles file. |
| `admin/vendors/[vendorId]/VendorLocationEditor.tsx` | 157 | Replace `1fr 1fr` with `className="admin-form-grid"`. |
| `admin/analytics/page.tsx` | 501 | Replace `repeat(3, 1fr)` with `className="admin-grid-3"`. |

**Effort:** ~1-1.5 hours total (these are mostly one-line changes per location).
**Risk:** Very low — purely CSS layout. No data flow changes. Visual diff on mobile is dramatic; on desktop nothing changes.
**Test:** Open each page on a phone-sized window (Chrome devtools, 375×667). Verify content readable, no horizontal scroll inside cards, no overlap.

---

### Phase 2 — List pages: cards-on-mobile pattern

The `.admin-table-wrap` horizontal-scroll approach is the wrong UX for phone-primary admin work. The user has to swipe-scroll to see all columns and then swipe back to find the action button. **Replace with a card-list-on-mobile pattern: rows render as cards on mobile, as a table on tablet/desktop.**

For each list page (`vendors`, `listings`, `markets`, `users`, `vendors/pending`):

1. **Extract a `<RowCard>` component** that renders a single record as a stacked card with:
   - Primary identifier prominent (business name / listing title / market name)
   - Secondary (vendor name, vertical, etc.) one line below
   - Status/tier/category as small chips inline
   - Action button (View / Edit) full-width at the bottom

2. **Use a CSS-only switch** in the table wrapper:
   ```css
   /* On mobile, hide the table, show the card list */
   @media (max-width: 639px) {
     .admin-list-table { display: none; }
     .admin-list-cards { display: flex; flex-direction: column; gap: 12px; }
   }
   /* On tablet+, hide the card list, show the table */
   @media (min-width: 640px) {
     .admin-list-table { display: block; }
     .admin-list-cards { display: none; }
   }
   ```
   This means rendering both the `<table>` AND a `<div>` of `<RowCard>`s in the JSX, but only one is visible at a time. Ergonomics > DRY.

3. **Add the card classes to `AdminResponsiveStyles.tsx`** so other list pages can adopt the same pattern.

| File | Status |
|------|--------|
| `admin/vendors/VendorsTableClient.tsx` | Highest priority — most-used admin page |
| `admin/listings/ListingsTableClient.tsx` | Same priority — daily admin work |
| `admin/markets/page.tsx` | Same priority — flagged by user |
| `admin/users/UsersTableClient.tsx` | Lower priority but trivial reuse once pattern is established |
| `admin/vendors/pending/page.tsx` | Lower priority |

**Effort:** First page (vendors) ~1.5-2 hours including the new `RowCard` extraction + adding shared CSS classes. Each subsequent page ~30-45 min once the pattern is in place. Total Phase 2: ~4-5 hours.
**Risk:** Medium. The pattern is straightforward but each list has different columns/data shapes. UI testing on real phone strongly recommended.
**Test:** For each list page on phone-sized window: cards render correctly, action button taps go to the right place, filters/search still work, pagination still works.

---

### Phase 3 — Smaller pages cleanup (optional, can be batched)

| File | What to do |
|------|------------|
| `admin/order-issues/page.tsx` | Inspect; likely needs the same treatment as detail pages. |
| `admin/reports/page.tsx` | Inspect; may have `gridTemplateColumns` patterns to convert. |
| `admin/event-ratings/page.tsx` | Already partial — verify on mobile, polish if needed. |
| `admin/error-logs/page.tsx` | Already partial — verify on mobile. |
| `admin/admins/page.tsx` | Trivial table — apply Phase 2 card pattern. |
| `admin/markets/[id]/ScheduleManager.tsx` | Inspect — likely has `gridTemplateColumns`. |
| `admin/vendors/[vendorId]/VendorActions.tsx` | Inspect — action button row likely overflows on mobile. |

**Effort:** ~1-2 hours total.

---

### Phase 4 — Polish (optional)

- **Sticky filter bar on scroll:** so admins don't lose filters when scrolling through long lists. Currently filter bar scrolls away.
- **Pull-to-refresh** on list pages: native mobile pattern admins expect.
- **Tap targets:** audit all buttons/links for ≥44×44px tap area. Some current `padding: '4px 10px'` action links are below this threshold.
- **Action sheets instead of right-aligned button rows:** on mobile, admin actions on a vendor (Approve, Reject, Suspend) might be better as a bottom-sheet menu vs the current row-of-buttons header pattern.

**Effort:** Open-ended; pick what matters.

---

## Recommended sequencing

| Phase | Time | Risk | When |
|-------|------|------|------|
| Phase 1 (detail/form fixes) | 1-1.5 hrs | Very Low | Ship first — biggest pain reduction per minute |
| Phase 2 (card-on-mobile lists) | 4-5 hrs | Medium | Ship second — biggest UX improvement |
| Phase 3 (smaller pages) | 1-2 hrs | Low | Batch with Phase 2 |
| Phase 4 (polish) | Open | Low | After Phases 1-3 prove the new patterns work |

**Total to make admin "phone-usable":** ~6-9 hours of work plus testing.

---

## Notes for the implementation session

- **Stay in the design-token system** (`spacing.*`, `typography.sizes.*`, `radius.*`, `colors.*`) — don't introduce hex values or magic numbers.
- **Reuse `AdminResponsiveStyles.tsx`** whenever possible. Add new helpers to that file so adoption stays consistent.
- **Do NOT touch the `admin-sidebar` system** — it's already working (hamburger on mobile, fixed sidebar on desktop). Just verify menu items are tap-friendly.
- **Test in Chrome DevTools at 375×667** (iPhone SE — smallest mainstream phone). If it works there it works on bigger phones.
- **None of these changes touch critical-path files** per `apps/web/.claude/rules/critical-path-files.md`. All changes are in `src/app/admin/**` which is admin-only and not in the protected list.

---

## What this audit did NOT cover

- The vendor app's own mobile UX (separate concern — already user-facing)
- Performance impact on mobile (bundle size, image lazy-loading) — separate audit
- Tablet-specific layouts (640-1023px) — current "tablet" treatment is "behave like a small desktop"; may need its own pass
- Accessibility (ARIA, keyboard navigation) — separate audit

---

## Open questions for the next session

1. **Card-on-mobile vs hybrid (sticky-action-column scroll table) — which feels better?** Recommend prototyping both for the vendors list and picking based on actual phone use.
2. **Form pages on mobile — do you want them to also use a stepped/wizard pattern?** Long forms like MarketForm have 5+ sections; on mobile a one-section-per-screen wizard might beat a long scroll. Trade-off: slower for desktop power-users.
3. **What's your most-used admin action on phone?** If "approve a pending vendor" is 80% of phone admin time, optimize that flow (vendors/pending) ahead of everything else.
