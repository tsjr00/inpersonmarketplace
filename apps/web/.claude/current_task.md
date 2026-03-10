# Current Task: Session 56 — Tests DONE, Now 5 UI/UX Fixes

Started: 2026-03-10
Status: **IN PLAN MODE — 5 fixes researched, plan written, awaiting approval**

## WHAT TO DO NEXT

**We are in PLAN MODE.** The plan file is at `C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md` but it needs to be overwritten (contains old test plan content). The NEW plan content is below.

1. **Exit plan mode** with the plan below
2. **Implement 5 fixes** in order (easiest → hardest):
   - Fix 5: Remove vendor socials tier gate
   - Fix 1: Fix listing form labels
   - Fix 2: Events empty state on markets page
   - Fix 4: Notification actionUrl improvements
   - Item 3: Deep dive series → add to backlog
3. **Run quality checks** (tsc + vitest)
4. **Commit**

## Completed Earlier This Session

### Test Writing (COMMITTED as `ea154de`)
- 109 new tests (617 → 726 passing, 0 failures, 29 test files)
- 65 business rules promoted 📋T → 🟣V (zero 📋T remaining)
- 7 new test files + updated business rules markers
- 2 known code bugs found (MP-R8 negative inventory, OL-R3 cancel restore)

## The 5 Fixes — Research Complete, Plan Ready

### Fix 5: Remove Vendor Socials Tier Gate (EASIEST)
**Problem:** Only premium/featured vendors can save social links. User wants all vendors.
**Files:**
- `src/components/vendor/ProfileEditForm.tsx` (line 25, 38-42): Remove `isPremium` check, enable all inputs, remove "Upgrade to Premium" badge
- `src/app/api/vendor/profile/route.ts` (line 57-60): Remove tier check on social_links save
- Display side already works for all vendors — no change needed

### Fix 1: Fix Listing Form Labels
**Problem:** "Amount Available Today" confused with "Quantity Available" — they serve different purposes.
- `quantity` = inventory count (how many units to sell, decremented on purchase)
- `quantity_amount` + `quantity_unit` = portion size per purchase (what buyer receives)
**File:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`
**Changes:**
- `quantity` label: "Quantity Available" → "Units in Stock", add hint about inventory tracking
- `quantity_amount` FT label: "Amount Available Today" → "Serving Size"
- `quantity_amount` FM label: "Size / Amount" → "Unit Size / Amount"
- FT hint: change to "What does each order include? (e.g., '1 serving', '12 oz', 'feeds 4')"

### Fix 2: Events Empty State on Markets Page
**Problem:** `/food_trucks/markets?type=event` with no events shows nothing.
**File:** `src/app/[vertical]/markets/page.tsx` (line ~203)
**Change:** When `locationType === 'event'` and no events, show:
- "No upcoming events at this time"
- "Planning an event? We can help you find the perfect food trucks."
- CTA button → `/{vertical}/events` (event request intake form, which already exists)

### Fix 4: Notification ActionUrl Improvements (HARDEST)
**Problem:** Most notifications route to generic dashboard, not specific pages.
**File:** `src/lib/notifications/types.ts`
**Key changes:**
- Vendor order notifs (`new_paid_order`, `order_cancelled_by_buyer`, `pickup_issue_reported`, `payout_processed`, `payout_failed`) → `/{vertical}/vendor/orders`
- `pickup_confirmation_needed` → `/{vertical}/vendor/pickup`
- `market_approved` → `/{vertical}/vendor/markets`
- `vendor_cancellation_warning` → `/{vertical}/vendor/analytics`
- Fix 2 hardcoded non-vertical admin paths (`issue_disputed`, `vendor_event_application_submitted`)
- Buyer notifications already correct (all go to `/buyer/orders`)

**Available pages confirmed:**
- `/{vertical}/vendor/orders/page.tsx` ✅ exists
- `/{vertical}/vendor/dashboard/orders/page.tsx` ✅ exists
- `/{vertical}/vendor/pickup/page.tsx` ✅ exists
- `/{vertical}/vendor/markets/page.tsx` ✅ exists
- `/{vertical}/vendor/analytics/page.tsx` ✅ exists
- `/{vertical}/buyer/orders/[id]/page.tsx` ✅ exists (detail page)
- No vendor order detail page exists (no `/{vertical}/vendor/orders/[id]`)

### Item 3: Deep Dive Series → Backlog
**Not code.** Add to `apps/web/.claude/backlog.md` describing:
- Topics: statuses, dates, locations, hours/times, tiers, financial limits, auth state, device/browser
- Process: end-to-end trace from DB schema through API routes through UI for each topic
- Output: `.claude/deep-dives/[topic].md` files
- Importance: keeping complex systems & patterns transparent for debugging, onboarding, auditing

## Git State
- Last commit: `ea154de` (Session 56 tests)
- Branch: main (29 ahead of origin/main)
- No uncommitted changes
- Currently in plan mode

## Key Decisions
- Labels fix is about clarity, not removing fields — both quantity fields serve different purposes
- Socials gate removal is just 2 files (edit form + API route), display already works
- Notification URLs route to the most specific EXISTING page — no new pages created
- Events empty state links to the existing event request form at `/{vertical}/events`
