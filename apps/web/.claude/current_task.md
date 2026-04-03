# Current Task: Session 67 — FM Landing Page + Event Wave System
Started: 2026-04-03

## Goal
1. ~~FM landing page corrections (3 rounds)~~ ✅
2. Event system — wave-based ordering implementation (company-paid FT events)

## Key Decisions Made
- **FM logo**: Use `logo no words - color.png` (copied to public/logos/farmersmarketing-logo.png)
- **FM text green**: `#558B2F` (matches dark portion of logo). `#4CAF50` was too light, `#2d5016` was too dark.
- **FM banner green**: `#8BC34A` (matches design-tokens FM primary)
- **Landing page architecture**: Use `landing-container` / `landing-section` CSS classes consistently (same as FT)
- **Staging email URLs**: Use `VERCEL_ENV` not `NODE_ENV` to distinguish prod from preview
- **PostgREST FK hints**: All market_vendors ↔ vendor_profiles queries need `!market_vendors_vendor_profile_id_fkey` hint (migration 107 added second FK)
- **Wave ordering**: 30-min fixed waves, 1 item per attendee, company-paid MVP, walk-ups fill next available wave, no capacity rollover between waves, attendee cancellation deferred
- **Wave plan**: Saved to `.claude/wave_ordering_plan.md`, cross-referenced with `.claude/event_system_deep_dive.md`

## Critical Context (DO NOT FORGET)
- `get_available_pickup_dates` SQL function ALREADY has event awareness (migrations 108-109). FM event ordering may already work. FT events blocked by vendor_market_schedules requirement in the function.
- `cart/items/route.ts` is CRITICAL PATH — wave system bypasses it entirely for company-paid orders
- Staging has 9 unpushed commits ahead of origin/main. NOT yet pushed to prod.
- Session 66 features still on staging awaiting verification before prod push
- User is currently testing events on staging

## Completed (Session 67)
- [x] FM landing page round 1 — logo, colors, layout, responsive patterns (10 files)
- [x] FM landing page round 2 — correct logo, landing-container pattern, TrustStats numbers, privacy note removed
- [x] FM landing page round 3 — dotted lines, hero text color, watermelon button, spacing
- [x] PostgREST FK disambiguation — 7 queries across 6 files
- [x] Staging email URL fix — VERCEL_ENV instead of NODE_ENV
- [x] Wave ordering plan — finalized and saved

## Remaining (Session 67)
- [ ] Wave ordering implementation step 1: Database migration (tables + columns + indexes)
- [ ] Wave ordering implementation step 2: RPC functions (reserve, cancel, create order)
- [ ] Wave ordering implementation step 3: RLS policies
- [ ] Wave ordering implementation step 4: Wave generation logic (lib function)
- [ ] Wave ordering implementation step 5: Admin generate-waves API
- [ ] Wave ordering implementation step 6: Shop API modifications
- [ ] Wave ordering implementation step 7: Wave reservation API
- [ ] Wave ordering implementation step 8: Company-paid order API
- [ ] Wave ordering implementation step 9: Shop page UI overhaul
- [ ] Wave ordering implementation step 10: Order confirmation / pick-ticket view
- [ ] Wave ordering implementation step 11: Settlement report updates
- [ ] Wave ordering implementation step 12: Admin wave monitoring

## Files Modified (Session 67)
- `apps/web/public/logos/farmersmarketing-logo.png` — replaced with correct no-words logo
- `apps/web/src/lib/branding/defaults.ts` — logo_path updated
- `apps/web/src/components/layout/Header.tsx` — FM landing: white bg, relative position, bottom padding
- `apps/web/src/components/landing/Hero.tsx` — FM hero: correct logo, dotted separators, green text, layout
- `apps/web/src/components/landing/LocationEntry.tsx` — FM: no pill collapse, smaller input, watermelon button, no privacy note
- `apps/web/src/components/landing/TrustStats.tsx` — green banner bg, white text, numeral+plus format
- `apps/web/src/components/landing/Features.tsx` — green dotted separators, centered icons
- `apps/web/src/components/landing/VendorPitch.tsx` — vibrant green bg, white subtitle, split bullets to white
- `apps/web/src/components/landing/Footer.tsx` — inline logo+tagline, simplified copyright
- `apps/web/src/app/[vertical]/page.tsx` — text colors, landing-container, compact event CTA
- `apps/web/src/app/[vertical]/admin/vendors/page.tsx` — FK hint
- `apps/web/src/app/api/admin/reports/route.ts` — FK hint
- `apps/web/src/app/api/markets/[id]/vendors/route.ts` — FK hint
- `apps/web/src/app/api/markets/[id]/vendors/[vendorId]/route.ts` — FK hint (2 queries)
- `apps/web/src/app/admin/markets/[id]/page.tsx` — FK hint
- `apps/web/src/app/api/markets/[id]/route.ts` — FK hint
- `apps/web/src/lib/environment.ts` — VERCEL_ENV fix

## Commits (Session 67)
1. `6026f9c` — feat: FM landing page redesign (prior session, already on main)
2. `7fae136` — fix: FM landing page corrections round 1
3. `921ec6f` — fix: FM landing page round 3 — dotted lines, colors, button, spacing
4. `a8346d4` — fix: disambiguate PostgREST market_vendors ↔ vendor_profiles FK hints
5. `60edca0` — fix: staging emails link to staging URL, not production domain

## Gotchas / Watch Out For
- Browser caches old logo aggressively on localhost — staging shows correct logo
- Next.js dev server slow on cold compile (2-3 min per page) — use --turbo flag
- Vercel sets NODE_ENV=production for ALL deploys (prod + preview) — use VERCEL_ENV to distinguish
