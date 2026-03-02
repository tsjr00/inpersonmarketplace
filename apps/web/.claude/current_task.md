# Current Task: FAQ/Help Expansion + Terms & Privacy Policy Update
Started: 2026-03-01

## Goal
Expand FAQ/Help content (seed 52 database articles), expand Terms of Service (add 5 new sections), expand Privacy Policy (add 6 new subsections), add Help links to footers. Reduce need for support tickets before onboarding.

## Plan File
Full plan at: `C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md`

## What's Been Completed (This Session Before This Task)
- FM analytics tier limits COMPLETE: `analyticsDays` + `analyticsExport` added to all 4 FM tiers in TIER_LIMITS
- Unified `getAnalyticsLimits(tier, vertical)` and `getVendorTierLabel(tier, vertical)` functions added to vendor-limits.ts
- Analytics page updated: gates BOTH verticals (was FT-only)
- 4 analytics API routes updated: overview, trends, top-products, customers all use unified function
- FM upgrade page: analytics bullet + comparison table row added
- TypeScript: 0 errors
- NOT YET COMMITTED — all analytics changes are unstaged

## What's Been Completed (This Task) — ALL 5 STEPS DONE
- [x] Step 1: Created migration `20260301_062_seed_knowledge_articles.sql` — 52 FAQ articles across 10 categories
- [x] Step 2: Expanded Terms of Service in `src/app/[vertical]/terms/page.tsx` — 472→801 lines, 5 new sections + table of contents
- [x] Step 3: Expanded Privacy Policy (embedded in terms page) — data retention, breach notification, CCPA, BIPA, data portability, geographic scope
- [x] Step 4: Added Help links to footers — landing Footer.tsx (For Shoppers + Vendor FAQ href fixed) + shared Footer.tsx
- [x] Step 5: Help page navigation fix — added browse link alongside dashboard link
- TypeScript: 0 errors
- NOT YET COMMITTED — all changes unstaged

## What's Remaining
- Ready to commit (analytics work + FAQ/Terms/Privacy work)

## Key Files
- `supabase/migrations/20260301_062_seed_knowledge_articles.sql` — NEW (to create)
- `src/app/[vertical]/terms/page.tsx` — EDIT (major, ~470 lines → ~900+ lines)
- `src/components/landing/Footer.tsx` — EDIT (minor, add Help link line 29-34, fix Vendor FAQ line 42)
- `src/components/shared/Footer.tsx` — EDIT (minor, add Help link to Company section)
- `src/app/[vertical]/help/page.tsx` — EDIT (minor, navigation)

## Article Categories (52 total)
1. Getting Started (Global, 5) — platform overview, account creation, finding vendors
2. Orders & Pickup (Global, 8) — ordering flow, statuses, pickup, cancellation, issues
3. Payments & Fees (Global, 5) — payment methods, fees, tips, refunds
4. Market Boxes (FM-only, 4) — what they are, pickup, fulfillment, cancellation
5. Chef Boxes (FT-only, 4) — what they are, types, pickup, cancellation
6. Account & Settings (Global, 5) — profile, notifications, deletion, support
7. Vendor Onboarding (Global, 5) — signup, permits, approval, prohibited items, trial
8. Vendor Plans & Subscriptions (FM+FT split, 6) — plan tiers, upgrade, downgrade, billing
9. Vendor Operations (Global, 6) — listings, orders, payouts, locations, analytics, quality checks
10. Privacy & Security (Global, 4) — payment security, data collection, location, privacy link

## Terms Expansion (New Sections)
- Section 5: Subscription Services (vendor plans, prepaid offerings, buyer premium)
- Section 6: Intellectual Property (platform content, user content, trademarks, feedback)
- Section 7.5: Indemnification
- Section 7.6: Force Majeure
- Section 9.4: Third-Party Links
- Section 10: Multi-Vertical Platform
- Table of Contents at top
- Update "Last updated" to March 2026

## Privacy Policy Expansion (New Subsections)
- 1.6 Device & Usage Info, 1.7 Push Notification Data
- 3.5 Aggregated Data (providers by category not brand)
- Section 5: Data Retention (reasonable period, not specific days)
- 6.2 Data Breach Notification
- 7.3 Data Portability, 7.5 CCPA, 7.6 Illinois/BIPA
- 8.1-8.3 Cookies restructured (essential/functional/analytics)
- Section 9: Geographic Scope (US only)
- Section 12: Changes to Privacy Policy

## Confidentiality Rules for Legal Docs
- "Promotional periods may be offered" (NOT "90-day trial")
- "Service fees as displayed at time of transaction"
- Don't expose: tier sort algorithms, quality scoring, placement logic
- Payout timing: "after order completion and mutual confirmation"
- Approval criteria: just "admin review"
- Third-party providers by CATEGORY not brand name ("payment processors" not "Stripe")
- No infrastructure names ("cloud hosting providers" not "Vercel/Supabase")
- Data retention: "reasonable period" not specific days

## Unstaged Changes (From Earlier Analytics Work)
Files modified but not committed:
- `src/lib/vendor-limits.ts` — added getAnalyticsLimits(), getVendorTierLabel(), analyticsDays/analyticsExport to FM TIER_LIMITS
- `src/app/[vertical]/vendor/analytics/page.tsx` — unified analytics gating for both verticals
- `src/app/api/vendor/analytics/overview/route.ts` — unified gating
- `src/app/api/vendor/analytics/trends/route.ts` — unified gating
- `src/app/api/vendor/analytics/top-products/route.ts` — unified gating
- `src/app/api/vendor/analytics/customers/route.ts` — unified gating
- `src/app/[vertical]/vendor/dashboard/upgrade/page.tsx` — analytics bullet + comparison row for FM

## Key Commits This Session (Prior Tasks)
- `fe15ddb` — FM free tier + tier restructure
- `90d8d1e` — FM pricing + env var rename
- `19c0782` — Annual billing toggle
- `b63a762` — Business rules audit domains 4+5

## Open Items (Carried Over)
- Business rules audit: Domains 6-8 not yet reviewed by user
- Open questions: OL-Q5-Q8, SL-Q2-Q3, AC-Q1-Q2, NI-Q1-Q3, IR-Q1-Q4
- Instagram URLs placeholder in Coming Soon footers
- Events Phase 5 deferred
- Migrations 057+058 schema snapshot update still needed
