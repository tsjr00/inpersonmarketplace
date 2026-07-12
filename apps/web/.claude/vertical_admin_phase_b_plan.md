# Vertical Admin Mobile Audit — Phase B Plan

**Date:** 2026-04-27
**Status:** Plan — no code changes yet
**Scope:** 12 remaining pages under `/[vertical]/admin/` (Phase A handled vendors, listings, users, markets, vendor-detail, vendor-activity)
**Total:** ~7,500 LOC across 12 files

---

## Quick survey

| Page | LOC | Has `<table>` | Hard-coded grids | Mobile shape |
|------|-----|---------------|-------------------|--------------|
| `error-logs/page.tsx` | 208 | ✅ | — | Table + master-detail |
| `events/page.tsx` | 1658 | ✅ | — | Big list + filters + actions |
| `reports/page.tsx` | 929 | ✅ | `repeat(auto-fit, minmax(140px, 1fr))` (responsive) | Reports list + previews |
| `admins/page.tsx` | 413 | ✅ | — | Admin user table |
| `events/[id]/settlement/page.tsx` | 709 | ✅ | Multiple `1fr 1fr` + auto-fits | Detail page |
| `knowledge/KnowledgeEditor.tsx` | 486 | — | `1fr 1fr` (form) | Form-heavy editor |
| `analytics/page.tsx` | 631 | — | `repeat(3, 1fr)` (non-responsive) | Charts + stats |
| `order-issues/page.tsx` | 387 | — | — | Issues list |
| `event-ratings/page.tsx` | 176 | — | — | Card-based master-detail (already mobile-OK) |
| `knowledge/page.tsx` | 106 | — | — | Server wrapper around KnowledgeEditor |
| `feedback/page.tsx` | 1158 | — | `repeat(auto-fit, minmax(150px, 1fr))` (responsive) | Feedback dashboard |
| `errors/page.tsx` | 645 | — | `repeat(auto-fill, minmax(200px, 1fr))` (responsive) | Error reports |

---

## Tier 1 — Table-based list pages (apply Phase A pattern)

Same compressed-mobile-rows treatment that worked on vendors/listings/users/markets. Estimated **30-45 min per page**.

### T1.1 `error-logs/page.tsx` 🔴 HIGH PRIORITY

Already uses `.admin-detail-split` master/detail. Just needs the table → mobile-compressed swap.

- **Mobile pattern:** drill-in mode. Title = error_code (or "(none)"). Status chip = severity (critical/high/medium/low). Secondary = `route · count occurrences · last seen X ago`. Tap row → toggles the detail panel (state is already wired).
- **Effort:** ~30 min — small file (208 LOC), pattern is clean.
- **Risk:** Very low.

### T1.2 `admins/page.tsx`

- **Mobile pattern:** action mode — Promote/Demote button on right (or whatever the actions are). Title = display_name or email. Status chip = role. Secondary = email · joined date.
- **Effort:** ~45 min.
- **Risk:** Low.

### T1.3 `reports/page.tsx`

929 LOC — likely multiple report types in one page. Need to read to confirm exact structure. Could be:
- A list of canned reports each with "Run" / "Download CSV" actions → action mode
- OR a table of past report runs → drill-in mode

- **Mobile pattern:** TBD after reading. Likely action mode (run/download buttons).
- **Effort:** ~45-60 min depending on complexity.
- **Risk:** Low.

### T1.4 `events/page.tsx` 🔴 LARGEST

1658 LOC — biggest file in this tier. Likely has filters + table + multiple action paths (approve/decline/cancel/match-vendors/etc).

- **Mobile pattern:** drill-in mode preferred if events have a detail page (`/admin/events/[id]/...` exists). Mobile shows compressed event with status chip and key date; tap goes to detail/settlement page.
- **Effort:** ~60-90 min. Needs careful read of event lifecycle to pick the right primary mobile action.
- **Risk:** Medium — many edge cases (event status: new/reviewing/approved/active/completed/cancelled).

### T1.5 `events/[id]/settlement/page.tsx`

Detail page, not a list. Has multiple `gridTemplateColumns: '1fr 1fr'` (lines 309, 453) and auto-fit grids. Same overflow risks as the platform vendor detail had.

- **Mobile pattern:** detail-page overflow fixes — make `1fr 1fr` grids responsive (1 col mobile / 2 col desktop), ensure long values wrap. Use `.admin-data-row` pattern where applicable.
- **Effort:** ~30-45 min.
- **Risk:** Low.

---

## Tier 2 — Detail/form pages with overflow risks

### T2.1 `analytics/page.tsx`

Line 507: `gridTemplateColumns: 'repeat(3, 1fr)'` — non-responsive 3-column grid. Squishes to 3 columns × ~100px each on a phone.

- **Fix:** Replace with className `admin-grid-3` (already in `AdminResponsiveStyles` — collapses to 1 col mobile, 2 col tablet, 3 col desktop).
- **Effort:** ~15 min.
- **Risk:** Very low.

### T2.2 `knowledge/KnowledgeEditor.tsx`

Line 181: `gridTemplateColumns: '1fr 1fr'` — non-responsive 2-column grid in the article form. Form fields squished on mobile.

- **Fix:** Replace with className `admin-form-grid` (already exists — 1 col mobile, 2 col tablet+).
- **Effort:** ~10 min.
- **Risk:** Very low.

### T2.3 `knowledge/page.tsx`

Server wrapper. Header has title-left + 2 buttons-right. Page padding `40px 20px` — same wide-padding issue as platform vendors page.

- **Fix:** Apply `.admin-page` class (responsive padding). Header gets `flexWrap: 'wrap'` so buttons drop below title on phone.
- **Effort:** ~10 min.
- **Risk:** Very low.

### T2.4 `order-issues/page.tsx`

387 LOC, no `<table>` per grep. Likely a card-based issues list. Need to read briefly.

- **Mobile pattern:** likely already card-based and works OK. May just need the `.admin-page` wrapper or some chrome cleanup.
- **Effort:** ~20-30 min after reading.
- **Risk:** Low.

---

## Tier 3 — Pages already mostly mobile-OK

### T3.1 `event-ratings/page.tsx` ✅ ALREADY GOOD

Uses `.admin-detail-split` master/detail. Card-based list (NOT a table). Cards already stack 1-col on mobile via the `admin-detail-split` helper.

- **Action:** Quick visual pass on phone. May not need any changes.
- **Effort:** ~5 min verification.
- **Risk:** None.

### T3.2 `feedback/page.tsx`

1158 LOC — large but uses responsive `auto-fit` grid for stats (line 403). Need to scan for any inline-styled overflowing elements.

- **Action:** Quick scan, fix any non-responsive grids or fixed widths found. Most of the page should already be OK with the layout-level overflow safety net.
- **Effort:** ~20 min.
- **Risk:** Low.

### T3.3 `errors/page.tsx`

645 LOC — uses responsive `auto-fill` grid (line 167). Likely already mobile-OK.

- **Action:** Quick scan, fix anything found.
- **Effort:** ~15 min.
- **Risk:** Low.

---

## Recommended sequencing

Ship in 3 batches per phase, validate between:

### Batch B1 — Quick wins (~1.5 hours)
- T2.1 analytics responsive grid
- T2.2 knowledge editor form grid
- T2.3 knowledge page wrapper
- T3.1 event-ratings verification (probably nothing to do)
- T3.3 errors quick scan

These are all 1-line CSS/className swaps. High signal, low risk.

### Batch B2 — Tier 1 list pages (~2.5 hours)
- T1.1 error-logs (smallest, validates pattern fits master/detail layouts)
- T1.5 events settlement (detail page overflow fixes — same as vendor detail Phase A)
- T1.2 admins (small admin user table)
- T1.3 reports (medium — need read first)

### Batch B3 — Largest pages (~2-3 hours)
- T1.4 events list (biggest, most action paths)
- T2.4 order-issues
- T3.2 feedback scan

### Total estimate
~6–7 hours of work + testing.

---

## Patterns reused from Phase A (no new code needed)

The following CSS classes from `AdminResponsiveStyles.tsx` already exist and just need to be applied:

| Class | What it does |
|-------|--------------|
| `.admin-page` | Responsive horizontal padding (8px mobile / 20px desktop) |
| `.admin-list-card` | List wrapper with responsive 8px/24px padding |
| `.admin-list-table` / `.admin-list-mobile` | Visibility toggle (mobile vs desktop) |
| `.admin-mobile-row` + `.admin-mobile-row-stacked` | Compressed row component |
| `.admin-grid-2/3/4/6` | Responsive grids |
| `.admin-form-grid` | Responsive form grid (1 col mobile / 2 col tablet+) |
| `.admin-detail-main-side` | Detail page main+sidebar layout |
| `.admin-data-row` | Stacked label/value rows |
| `.admin-tabbed-layout` + `.admin-tab-nav-buttons` | Vertical-or-horizontal tabs |

`AdminMobileRow` component already supports both drill-in (href) and action (rightAction) modes with stacked layout.

---

## Order of implementation

Recommend starting with **Batch B1 (quick wins)** — easiest dopamine, validates the pattern catches everything else, fastest path to 80% coverage.

Then **Batch B2** (Tier 1 lists — error-logs, settlement, admins, reports) which follow the established compressed-row pattern.

Finally **Batch B3** (the giant events/feedback files + order-issues).

After all three batches: comprehensive mobile pass on real phone, then bundle into the prod-push stack.

---

## What this plan does NOT cover

- The **vertical dashboard** (`[vertical]/admin/page.tsx`) — already stacks on mobile via `.admin-grid-2`. May need compaction but user hasn't flagged.
- API routes — not part of UI mobile audit.
- Components imported from `/admin/...` (platform-level shared components like `VendorVerificationPanel`) — those already get mobile treatment from platform Phase A.
