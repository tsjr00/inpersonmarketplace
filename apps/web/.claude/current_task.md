# Current Task: Visual/CSS Brand Alignment — PHASE 2 COMPLETE

Started: 2026-02-17 (Session 30)
Status: PHASE 2 COMPLETE — ready to commit

## Goal
Replace hardcoded green (FM-brand) colors with CSS var tokens (`colors.primary`, `colors.primaryDark`, `colors.primaryLight` from design-tokens.ts) across the entire app. Food truck vertical should use red (#E53935) / charcoal (#4A4A4A) from brand kit, not green.

## Results
- **Before**: 296 hardcoded green instances across 65 files
- **After**: 76 remaining across 34 files — ALL semantic (status badges, order states, approval indicators)
- **220 brand-green instances replaced** with CSS var tokens across **48 source files**
- TypeScript compiles clean (`npx tsc --noEmit` passes)

## Commits This Session (Session 30)
1. `e8b352d` — Per-vertical buyer premium configuration (15 files)
2. `0afe93e` — Move migration 026 to applied
3. `ccb8a54` — Update schema snapshot for migration 026
4. `cc280c4` — Strengthen schema snapshot update rules
5. `fe84eb9` — Fix food truck visual issues: brand colors, terminology, form styling (11 files)
6. **PENDING COMMIT** — Replace hardcoded brand-green colors with CSS var tokens (~48 files)

## Files Fixed in Phase 2 (this pending commit)

### Buyer-facing pages (11 files)
- `buyer/orders/page.tsx` — Ready order cards, banners, market box cards
- `buyer/orders/[id]/page.tsx` — Pickup hero gradient, acknowledge receipt section
- `buyer/subscriptions/page.tsx` — Extension pills
- `buyer/subscriptions/[id]/page.tsx` — Success confirmation, extension rows, pickup badges
- `buyer/upgrade/page.tsx` — Premium benefits, badges, gradient sections
- `browse/page.tsx` — Spots remaining badges
- `market-box/[id]/MarketBoxDetailClient.tsx` — Spots, savings badges, how-it-works box
- `checkout/external/page.tsx` — Cash payment section
- `subscription/success/page.tsx` — Success icon, premium benefits
- `vendor-signup/page.tsx` — Referral banner
- `settings/BuyerTierManager.tsx` — Premium member section

### Vendor-facing pages (10 files)
- `vendor/markets/page.tsx` — Radio sections, confirmation, CTA buttons
- `vendor/market-boxes/page.tsx` — Subscriber count, activate toggle
- `vendor/pickup/page.tsx` — Stats bar, fulfill button, extension badge
- `vendor/listings/page.tsx` — Open status badge
- `vendor/edit/EditProfileForm.tsx` — Success message
- `vendor/referrals/page.tsx` — Referral link card gradient
- `vendor/[vendorId]/profile/page.tsx` — Category pills
- `vendor/dashboard/upgrade/page.tsx` — Premium benefits, badges
- `vendor/dashboard/PaymentMethodsCard.tsx` — Stripe status, payment checkmarks
- `vendor/reviews/page.tsx` — New reviews count stat

### Shared components (17 files)
- `vendor/OnboardingChecklist.tsx` — Completion banner, gate circles, ready messages
- `vendor/MarketScheduleSelector.tsx` — Selected state, checkbox, attending badge
- `vendor/MarketSelector.tsx` — Listing count card, home market label
- `vendor/VendorFeedbackForm.tsx` — Market suggestion section
- `vendor/CertificationsForm.tsx` — Success message, document attached
- `vendor/COIUpload.tsx` — Approved badge, document link, verified date
- `vendor/CategoryDocumentUpload.tsx` — Approved badge, document link
- `vendor/ListingCutoffStatus.tsx` — Accepting orders indicator
- `vendor/PickupScheduleGrid.tsx` — Time slot backgrounds/text
- `vendor/MarketBoxImageUpload.tsx` — Upload spinner, hover states
- `vendor/ProfileEditForm.tsx` — Success message
- `cart/AddToCartButton.tsx` — Selected date, in-cart notice
- `listings/PickupLocationsCard.tsx` — Default primary color prop
- `location/LocationSearchInline.tsx` — Green bar, location text, change button
- `location/LocationPrompt.tsx` — Success state, pin icon, change button
- `shared/ErrorDisplay.tsx` — Copied button
- `ErrorFeedback.tsx` — Report submitted section
- `vendor/dashboard/ReferralCard.tsx` — Description text (missed in Phase 1)

### Admin pages (12 files)
- `admin/VendorVerificationPanel.tsx` — Completion banner, document links, approve buttons
- `about/page.tsx` — Contact form success
- `[vertical]/admin/page.tsx` — Stats cards
- `[vertical]/admin/knowledge/KnowledgeEditor.tsx` — Save/create/publish buttons
- `[vertical]/admin/vendors/VendorManagementClient.tsx` — Market pills, approve button
- `[vertical]/admin/markets/page.tsx` — Approve/re-approve/unsuspend buttons
- `[vertical]/admin/feedback/page.tsx` — Market suggestion detail card
- `[vertical]/admin/errors/page.tsx` — Resolution summary, mark resolved button
- `admin/errors/page.tsx` — Resolution summary, mark resolved button
- `[vertical]/admin/vendor-activity/VendorActivityClient.tsx` — Resolution notes, referral stats
- `admin/layout.tsx` — Vertical admin nav link
- `admin/mfa/setup/page.tsx` — MFA enabled heading

## Semantic Greens Correctly Preserved (76 instances, 34 files)
These stay hardcoded green regardless of vertical:
- Order status badges (ready, confirmed, fulfilled, completed)
- Subscription status (active, picked_up)
- Approval badges (approved vendors, published listings)
- Referral status (earned)
- Date status indicators (open/closed market dates)
- USDA Organic certification badge
- Email template brand color (CSS vars don't work in email HTML)

## Remaining Open Items
- **Email template** (`notifications/service.ts` line 214): `#166534` for brand name in HTML email. CSS vars don't work in email — needs brand color passed from vertical config.
- **Food truck icon**: User wants proper food truck SVG (not 🚚 delivery truck emoji)
- **ShopperFeedbackForm "Market Policies"**: FM-specific language needs vertical-aware rewording

## Git State
- main is 6 commits ahead of origin/main (5 committed + 1 pending)
- Staging NOT yet pushed with commits fe84eb9+
- User hasn't confirmed staging for production push yet
