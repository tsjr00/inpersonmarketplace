# Current Task: Session 68 Complete
Updated: 2026-04-07

## Status: ~45 commits this session. Prod current. Migrations 110-113 on all 3 envs.

## Next Session Priority #1: Vendor Fee Discount System

**Design approved — ready to build:**
- `vendor_fee_override_percent` NUMERIC on vendor_profiles (nullable, floor 3.6%, default null = 6.5%)
- `fee_discount_code` TEXT on vendor_profiles (vendor enters, admin reads)
- `fee_discount_approved_by` UUID + `fee_discount_approved_at` TIMESTAMPTZ (audit trail)
- Dual-factor: vendor enters code → admin sets actual fee rate
- $0.15 flat fee NEVER changes (covers Stripe's $0.30 split with buyer)
- Only the vendor % fee changes: 6.5% (standard) down to 3.6% (floor)
- At 3.6%: vendor covers Stripe processing, platform makes $0 profit on vendor side
- Buyer fees unchanged, display prices unchanged
- Touches: pricing.ts (CRITICAL PATH), checkout route, vendor settings UI, admin vendor management
- Must read vault before modifying pricing.ts

**Math ($10 item):**
- Standard: vendor pays $0.65 + $0.15 = $0.80. Platform nets $0.99.
- Max discount (3.6%): vendor pays $0.36 + $0.15 = $0.51. Platform nets $0.70.
- Stripe always takes $0.61. Buyer always pays $10.80.

## Next Session Priority #2: Event Approved Vendor Filter (backlog)
- Needs proper plan — three failed attempts this session
- The vendor search page has two data paths (server initial + client nearby API)
- Both paths must agree on the data shape
- Filter must work alongside existing favorites filter, not replace it
- Add to VendorFiltersPopup as a proper filter group, not a toggle

## Session 68 Summary

### Schema Verification (Dev vs Staging)
- All 10 REFRESH_SCHEMA sections verified matching
- buyer_tier default fixed on Dev ('free' → 'standard')
- SCHEMA_SNAPSHOT.md rebuilt: 51→54 tables, market_vendors 8→16 columns
- Migration log updated for 100-113

### Event System Audit + Blockers Fixed
- B-1: Pickup Mode Events tab — event_orders API param now works
- B-2: Company-paid fulfillment — skip Stripe transfer for payment_model='company_paid'
- B-3: Order cap validation endpoint + shop page integration
- G-4: Company-paid order notifications (vendor + buyer)
- G-5: Event status validation with clear reason messages
- C-2: Cron Phase 14/15 uses market timezone instead of hardcoded CT
- G-2: Admin company payments API (GET/POST/PATCH)

### Hybrid Event System (designed + built)
- Migration 113: access_code + company_max_per_attendee_cents
- Access code verification endpoint + shop page gate
- Dollar cap per attendee (Option C hybrid model)
- Settlement report separates company-paid vs attendee-paid

### Progressive Event Details + Organizer Redirect
- PATCH /api/events/[token]/details for organizer progressive form
- OrganizerEventDetails component on dashboard (4 expandable sections)
- Login/signup redirect with ?section=events for organizer flow

### Testing Infrastructure (major expansion)
- Playwright: 30 → 46 tests, pre-commit hook integration, webServer auto-start
- Flow integrity tests: 35 tests (auth paths, FK disambiguation, RPC usage, status reachability)
- Cross-file business rules: 53 tests (13 business rules traced across full file chains)
- Total: 50 files, 1433 tests + 46 Playwright

### Production Hotfixes
- FK disambiguation (cherry-pick)
- Signup email confirmation loop (new confirm-email page)
- Event markets excluded from regular listing/cart flow
- Vendor profile cleanup (Book for Your Event removed, highlight button React component)
- Event schedule UI (single-day auto-attend, no time picker for events)
- Payment badges (Cards, Apple Pay, Google Pay, Cash App, Amazon Pay, Link)

### Reverted (needs proper plan)
- Event approved vendor filter — three attempts, all reverted. Backlogged.

## Migrations Status
| Migration | Dev | Staging | Prod |
|-----------|-----|---------|------|
| 110-113 | ✅ | ✅ | ✅ |

## Test Suite
- 50 vitest files, 1433 tests
- 46 Playwright e2e tests (45 pass, 1 skipped)
- Pre-commit: lint-staged + vitest + playwright on every commit
