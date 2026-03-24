# Current Task: Session 63 Complete
Started: 2026-03-22, ended 2026-03-24
Status: COMPLETE — massive session across 3 days

## Session Highlights

### Go-Live & Production
- Pushed 49+ commits to production with revert tag (pre-session63-prod)
- Fixed TypeScript build errors blocking Vercel deploys
- Fixed missing `notification_preferences` column on prod DB (caused tutorial to repeat)
- Cleared fake Stripe account IDs from prod vendor_profiles
- Stripe Connect restriction triggered — waiting for Stripe to lift

### Features Built
- **Vendor pickup lead time** — Migration 096, 15/30 toggle, slot intervals match lead time
- **Time slot UX** — Dropdown replaces tiles, end time = valid arrival slot, 15-min slots for 15-min lead
- **Password reset** — Fixed PKCE issue with verifyOtp + token_hash (bypasses Supabase PKCE entirely)
- **Vendor cover photo** — Migration 097, upload with resize, 16:9 display below vendor info
- **Favorites page** — Dedicated simple page with name+logo cards, no geo search
- **Landing page button** — "Where are trucks today?" navigates to where-today with zip
- **Catering badge** — Shows on vendor profile listing cards + highlight button with gold border toggle
- **Checkout layout** — Fixed mobile order (items → tip → payment → Pay Now → cross-sell)
- **Accounting reports** — 6 new CSV reports (transaction reconciliation, refund detail, external fee ledger, subscription revenue, tax summary, monthly P&L)
- **Payment methods** — Enabled Card (Apple Pay/Google Pay), Cash App Pay, Amazon Pay, Link
- **External payments hidden** — EXTERNAL_PAYMENTS_ENABLED flag hides all UI, preserves backend

### Tax Compliance (Major)
- **FT listings**: Sales tax always on, greyed out. Pre-packaged food question blocks publishing.
- **FM listings**: Category-based auto tax rules per Texas Comptroller guidelines:
  - Always exempt: Produce, Dairy & Eggs, Pantry
  - Always taxable: Prepared Foods, Plants & Flowers, Health & Wellness, Art & Decor, Home & Functional
  - Trigger question: Meat & Poultry, Baked Goods (immediate consumption = taxable)
- **Signup success page**: Tax guidance notice tailored to vendor's selected category
- **FM vendor_type expanded**: Migration 098, now 11 categories matching listing categories
- **Stripe Tax planned**: automatic_tax with liability:'self', product tax codes, Texas registration needed

### Process Improvements
- **Cite-or-verify rule** — New absolute rule: cite file:line for code claims or mark UNVERIFIED
- **Real numbers only** — Never fabricate financial figures
- **Stress test protocols** — 8 protocols documented for pre-launch resilience testing
- **Catering decisions logged** — Min 10 items, tiered advance notice, $75/truck, event approval = quality gate

### Tests & Safety
- T-2 refund consistency (20 tests), T-11 inventory restore (12 tests)
- shouldRestoreInventory() utility wired into all callers
- Buyer premium page: all false claims removed

## Migrations This Session
- 096: pickup_lead_minutes on vendor_profiles (applied all 3 DBs)
- 097: cover_image_url on vendor_profiles (applied all 3 DBs)
- 098: expanded FM vendor_type options (applied all 3 DBs)
- notification_preferences column added to prod (was missing)

## Next Session Priorities
1. **Stripe Tax implementation** — needs: TX sales tax permit, Stripe Tax registration, product tax codes. Then code: automatic_tax on checkout sessions, tax code mapping, vendor transfer withholding.
2. **Catering pre-order system** — min 10 items/vendor, advance notice tiers (1/2/3 days), listing form update
3. **Event $75 per-truck fee** — due with 50% deposit
4. **Stripe Connect** — test vendor onboarding once restriction lifted
5. **Zip code visibility** — research: all geo pages show zip, changing one changes all
6. **Vendor profile catering filter** — client component wrapper for server page
