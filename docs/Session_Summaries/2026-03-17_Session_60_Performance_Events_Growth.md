# Session 60 Summary — Performance, Code Protection, Events & Growth

**Date:** 2026-03-17
**Duration:** Full day (1M context window, no compaction)
**Model:** Claude Opus 4.6 (1M context)
**Commits:** ~45 commits across the session
**Migrations:** 086, 087, 088 (all applied to Dev, Staging, Prod)

---

## Session Goals

1. Prevent the Session 59 problem (good code corrupted by bad changes) from recurring
2. Improve app speed and scalability without breaking existing features
3. Address user feedback (vendor dashboard, tiers, terminology, payments)
4. Build growth features (buyer capture, QR codes, events promotion)

---

## Major Accomplishments

### Code Vault System
Created a git-based code protection system to prevent future sessions from corrupting working code:
- `vault` branch at last known-good commit (pre-Session 59)
- `vault/pre-session-59` tag for permanent history
- `vault-manifest.md` listing protected systems and their key files
- `vault-protocol.md` rules (diff before modifying, restore don't guess)
- `vault-export.sh` for external drive backup
- Added to CLAUDE.md "READ FIRST" list and rules

### MEMORY.md Restructure
- Reduced from 242 lines (41 truncated every session) to 89 lines
- Created MEMORY_EXT.md for detailed reference material
- Session history compressed from ~70 lines to 4 + pointer to CLAUDE_CONTEXT.md
- Location system protection notes added (Session 59 lesson)

### Performance Optimizations (5 Domains)
All changes isolated by domain — no business logic touched:

**Domain 1 — Images & Assets:**
- `sizes` prop added to 11 next/image instances across 7 files
- Mobile bandwidth savings from responsive image loading

**Domain 2 — Client Bundle:**
- Sentry lazy-loaded after first paint (~30-50KB savings per page)
- CartDrawer dynamic import (loads on first open, not every page)
- NotificationBell dynamic import (loads for auth users only)
- Removed unused `@stripe/stripe-js` dependency
- Supabase preconnect hint for DNS/TLS warmup

**Domain 3 — Third-Party Scripts:**
- Confirmed already well-optimized (no action needed beyond preconnect)

**Domain 4 — Database & API:**
- Customer analytics queries parallelized (~100-200ms saved)
- Settings page queries parallelized
- `select('*')` narrowed to specific columns on 6 high-traffic routes
- **PostGIS browse page filtering** (Migration 086): `get_listings_within_radius()` RPC replaces fetch-all + JS Haversine. Scales from O(N) to O(1).
- **Full-text search** (Migration 087): tsvector + GIN index on listings. `.textSearch()` replaces 3x ILIKE scans.
- Cron Phase 5 global Stripe transfer budget (15 max across sub-queries)

**Domain 5 — Notifications & Checkout:**
- Supabase Realtime replaces 15-min polling for notification bell (instant updates)
- Push notification opt-in card on checkout success page
- Checkout notifications deferred via `after()` (success page returns immediately)

### Vendor Dashboard Enhancements
- **Upcoming Pickups page** (`/{vertical}/vendor/upcoming`): Full prep workflow with Today/Coming Up sections, prep list + orders buttons per location, skeleton empty state
- Dashboard card is compact summary linking to the page
- Vendor markets page: Single Truck Locations moved to top for FT
- Payments card: Sales tax link moved to bottom, platform fees condensed
- Promote card: QR code integrated (print + save), social sharing

### Terminology & Tiers
- FT: "Food Truck Park" → "Multi-Truck Location", "Service Location" → "Single Truck Location" (EN + ES)
- Free tier: 1 box with 5 subscribers (both verticals), 30-day analytics
- Menu items: Free=7, Basic=15, Pro=30, Boss=50
- Pickup windows: Free=4, Basic=7, Pro=14, Boss=21
- "Free forever" → "Free" on upgrade page
- Tier displays updated with accurate values from vendor-limits.ts

### Growth Features
- **Notify Me capture**: When browse has no results, shows email/phone form instead of dead end. Stores zip for geographic demand data. Migration 088 creates `buyer_interests` table.
- **Vendor QR code**: Printable card with logo, URL, QR code, vendor name, CTA. Inside Promote Your Business card.
- **Vendor profile reorder**: Hero → Schedule → Menu → metadata at bottom. "View Menu" anchor button.

### Events System Enhancement
- Landing page events section (grey strip above footer with 3 value props)
- Events page SEO metadata (title, description, keywords, OpenGraph)
- Events page cuisine showcase (10 category pills)
- Events page "Why Event Managers Choose Us" trust signals
- "Events" link added to FT header nav (desktop + mobile)
- "Want this vendor at your event?" button on event-approved vendor profiles
- Organizer confirmation email on event request submission
- Vendor preference pre-fill when coming from vendor profile

### Bug Fixes
- CI lint error (BrowseBuyerOverlay setState-in-effect → queueMicrotask)
- Category requirements crash (unknown category → safe default fallback)
- Notification service let→const (ESLint prefer-const)
- Storage policies: `vendor-documents` bucket INSERT + SELECT on all 3 envs
- Missing design-tokens import on landing page

### Testing
- **Playwright smoke tests**: 30 tests covering page loads + API health. Production domain guard. Maintenance instructions in config.
- All test updates for new tier values (listings, windows, chef boxes, analytics)

---

## Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Vault branch instead of more rules | Rules get forgotten during compaction. A git branch is a concrete artifact. |
| PostGIS for browse, not ISR | ISR broke Session 59 because it conflicts with cookies. PostGIS does distance filtering at DB level. |
| Deferred notifications via `after()` | Success page returns instantly. Notifications are best-effort and idempotent. |
| Events route through platform, not direct to vendors | Platform is the matchmaker — protects revenue model and vendor relationships. |
| Playwright scoped to page loads, not CSS | Low maintenance. Only breaks when routes change, not when browsers update. |
| Staging-only push by default | User must explicitly authorize each production push. |

---

## Feedback Captured (New Memory Files)

- `feedback_staging_only_push.md` — Never push to prod without explicit authorization
- `feedback_no_assumptions_on_ui.md` — Ask before implementing UI changes when user reports unexpected behavior

---

## What's NOT Pushed to Production

Main is 10 commits ahead of origin/main as of session end. These include:
- Events page enhancements (SEO, cuisine showcase, trust signals, nav link)
- Landing page events strip
- Vendor profile event CTA
- Organizer confirmation email
- QR code in Promote card
- "Free forever" → "Free"
- Tier display updates
- Vendor profile metadata reorder
- Pickup window + menu item limit changes
- Checkmark icon fix

User needs to verify staging and authorize prod push.

---

## Remaining for Next Session

- Update vault to current verified state (after prod verification)
- Update CLAUDE_CONTEXT.md session history table
- Supabase performance advisor: unindexed FKs (need specific list from dashboard)
- Flaky rate-limit test (timing-dependent, intermittent)
- Stripe: delete old pebble02 webhook endpoint
- Events: anonymized social proof with real event data (when available)

---

## Session Approach Notes

This session demonstrated the value of:
1. **Starting with the problem** (code protection) before optimizing
2. **Domain-by-domain isolation** for performance work
3. **Reading code before writing** (PostGIS discovery)
4. **Asking vs assuming** (vendor dashboard UI corrections)
5. **Small, verified commits** with staging-first deployment
6. **1M context window** enabling continuous work without compaction
