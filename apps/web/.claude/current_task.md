# Current Task: Tier Restructure COMPLETE + Business Rules Audit IN PROGRESS
Started: 2026-02-28

## Tier Restructure — FULLY COMPLETE
All 6 phases done. Migration 061 applied to all 3 envs. Annual billing toggle added. Env vars renamed. Pushed to staging AND production.

### Key Commits (all pushed to prod + staging)
- `fe15ddb` — FM free tier + tier restructure: 48 files, migration 061, business rules audit
- `90d8d1e` — FM pricing: $10 standard, $50 featured, rename env vars for consistency
- `19c0782` — FM upgrade page: add monthly/annual billing toggle

### Pricing (FINAL)
| Tier | Monthly | Annual |
|------|---------|--------|
| FM Standard | $10/mo | $81.50/yr (32% savings) |
| FM Premium | $24.99/mo | $208.15/yr (30% savings) |
| FM Featured | $50/mo | $481.50/yr (20% savings) |
| FT Basic | $10/mo | — |
| FT Pro | $30/mo | — |
| FT Boss | $50/mo | — |

### Stripe Env Vars (RENAMED)
- Old `STRIPE_VENDOR_MONTHLY_PRICE_ID` → `STRIPE_FM_PREMIUM_MONTHLY_PRICE_ID`
- Old `STRIPE_VENDOR_ANNUAL_PRICE_ID` → `STRIPE_FM_PREMIUM_ANNUAL_PRICE_ID`
- New: `STRIPE_FM_STANDARD_MONTHLY_PRICE_ID`, `STRIPE_FM_STANDARD_ANNUAL_PRICE_ID`
- New: `STRIPE_FM_FEATURED_MONTHLY_PRICE_ID`, `STRIPE_FM_FEATURED_ANNUAL_PRICE_ID`
- User confirmed all env vars set in Vercel

---

## Business Rules Audit — IN PROGRESS (Session 49)

### Domain Status
| Domain | Status | Notes |
|--------|--------|-------|
| 1. Money Path | ✅ Complete | 28 rules validated |
| 2. Order Lifecycle | ✅ Mostly done | 2 rules + 4 questions still 🔵❓ (OL-R20, OL-Q5-Q8) |
| 3. Vertical Isolation | ✅ Mostly done | VI-Q4, VI-Q5 deferred. VI-Q1: shared identity NOT desired. VI-Q2: platform admin cross-vertical IS desired. |
| 4. Vendor Journey | ✅ Complete | All 13 rules confirmed. VJ-R1 corrected: COI is optional gate. |
| 5. Subscription Lifecycle | ✅ Complete | All rules confirmed with clarifications (see below) |
| 6. Auth & Access Control | 🔵❓ Not yet reviewed | |
| 7. Notification Integrity | 🔵❓ Not yet reviewed | |
| 8. Infrastructure | 🔵❓ Not yet reviewed | |

### Key User Decisions This Session
- **VI-Q1**: Shared identity NOT desired — each vertical should be separate
- **VI-Q2**: Platform admin cross-vertical visibility IS desired — protect from attack but keep visibility
- **VI-Q3**: Referral codes scoped to vendor's vertical (already working correctly)
- **VJ-R1 CORRECTION**: COI is OPTIONAL gate. 4 required gates: 1) Prohibited items, 2) Business docs, 3) Vertical-specific docs (FM=category docs, FT=health/food safety), 4) Stripe setup
- **SL-W3**: "Subscription" = pre-purchase with staggered fulfillment, not recurring payment. Keep code terminology, use accurate description in human-facing docs.
- **SL-R3**: User asked about charge-then-refund order of operations. ANSWER: Pre-checkout capacity check exists (rejects if full). Charge-then-refund only on race condition. No transient retry — just refund on failure.
- **SL-R6/R7**: 4 OR 8 weeks depending on vendor offering + buyer choice
- **SL-R8**: FT vendors should NOT see skip-a-week option in Chef Box management
- **SL-R10**: FT buyer should NOT see 8-week option (because no skip-a-week)
- **SL-R11 CLARIFICATION**: Prevents duplicate active subscriptions after checkout, BUT buyer SHOULD be able to buy 2 of the same box (using 2 slots) in one purchase
- **SL-R15**: Should include "seller at capacity" message to buyer

### What's Left to Do
1. **Review Domains 6, 7, 8** with user (Auth, Notifications, Infrastructure)
2. **Open questions** still needing user decisions: OL-Q5-Q8, SL-Q2-Q3, AC-Q1-Q2, NI-Q1-Q3, IR-Q1-Q4
3. **Write Vitest tests** for all validated rules (after user finishes reviewing all domains)
4. **Commit** audit doc updates (uncommitted changes in business_rules_audit_and_testing.md)

### Files Modified (uncommitted)
- `apps/web/.claude/business_rules_audit_and_testing.md` — Domain 4+5 updates, VI-Q1/Q2 resolved
- `apps/web/.claude/current_task.md` — This file

## Open Items (Carried Over)
- Instagram URLs still placeholder `#` in Coming Soon footers
- Events Phase 5 (reminders + conversion) — deferred
- Dev DB may be out of sync on some migrations
- Migrations 057+058 schema snapshot update still needed
