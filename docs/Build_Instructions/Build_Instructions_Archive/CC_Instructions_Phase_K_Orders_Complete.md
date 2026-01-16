# Build Instructions for CC - Phase K: Orders Management

**Date:** January 14, 2026
**Phases:** K-1 (Vendor Orders) and K-2 (Buyer Orders)
**Approach:** Sequential build with separate branches

---

## Overview

You will build TWO features sequentially:
1. **Phase K-1:** Vendor Order Management
2. **Phase K-2:** Buyer Order History & Tracking

Each phase gets its own branch, is built independently, tested, then merged to main.

---

## PHASE K-1: VENDOR ORDER MANAGEMENT

### Git Setup - Phase K-1

```bash
cd C:\GitHub\Projects\inpersonmarketplace

# Ensure main is clean and up to date
git checkout main
git pull origin main

# Create and switch to vendor orders branch
git checkout -b feature/vendor-orders
```

### Build Instructions - Phase K-1

**File Territory (DO NOT TOUCH OTHER FOLDERS):**
- `src/app/[vertical]/vendor/orders/` (create all files)
- `src/app/api/vendor/orders/` (create all files)
- `src/components/vendor/OrderCard.tsx` (create)
- `src/components/vendor/OrderStatusBadge.tsx` (create)
- `src/components/vendor/OrderFilters.tsx` (create)
- `src/app/[vertical]/vendor/dashboard/page.tsx` (add Orders link only)

**Read the full Phase K-1 build instructions from:** `Phase_K1_Vendor_Orders_Build_Instructions.md`

Follow all instructions in that file for:
- API endpoints (GET orders, POST confirm/ready/fulfill)
- UI components (OrderCard, OrderStatusBadge, OrderFilters)
- Vendor orders page
- Dashboard integration

### Commit Strategy - Phase K-1

```bash
# After API endpoints complete
git add src/app/api/vendor/orders/
git commit -m "feat(vendor-orders): Add vendor orders API endpoints"

# After components complete
git add src/components/vendor/Order*.tsx
git commit -m "feat(vendor-orders): Add vendor order UI components"

# After orders page complete
git add src/app/[vertical]/vendor/orders/
git commit -m "feat(vendor-orders): Add vendor orders management page"

# After dashboard update
git add src/app/[vertical]/vendor/dashboard/page.tsx
git commit -m "feat(vendor-orders): Add orders link to vendor dashboard"

# Push branch to GitHub
git push origin feature/vendor-orders
```

### Testing Checkpoint - Phase K-1

**Tell Tracy to test:**
1. Navigate to `/farmers_market/vendor/orders`
2. Verify page loads
3. Test order filters
4. Test status transitions (if test data exists)

**Wait for Tracy's approval before proceeding to merge.**

### Merge to Main - Phase K-1

**After Tracy approves:**

```bash
# Switch to main
git checkout main

# Pull any changes
git pull origin main

# Merge vendor orders
git merge feature/vendor-orders

# Push to main
git push origin main

# Delete feature branch (optional)
git branch -d feature/vendor-orders
```

### Create Session Summary - Phase K-1

Create: `Phase_K1_Vendor_Orders_Session_Summary.md`

Include:
- Date and duration
- Files created
- Files modified
- Testing results (from Tracy)
- Any issues encountered
- Notes

---

## PAUSE - WAIT FOR PHASE K-2 INSTRUCTIONS

**After Phase K-1 is merged, Tracy will tell you to proceed with Phase K-2.**

---

## PHASE K-2: BUYER ORDER HISTORY & TRACKING

### Git Setup - Phase K-2

```bash
cd C:\GitHub\Projects\inpersonmarketplace

# Ensure main is clean and up to date
git checkout main
git pull origin main

# Create and switch to buyer orders branch
git checkout -b feature/buyer-orders
```

### Build Instructions - Phase K-2

**File Territory (DO NOT TOUCH VENDOR FOLDERS):**
- `src/app/[vertical]/buyer/orders/` (create all files)
- `src/app/api/buyer/orders/` (create all files)
- `src/components/buyer/OrderTimeline.tsx` (create)
- `src/components/buyer/OrderStatusSummary.tsx` (create)
- `src/components/buyer/PickupDetails.tsx` (create)
- `src/app/[vertical]/dashboard/page.tsx` (add Orders link only)

**Read the full Phase K-2 build instructions from:** `Phase_K2_Buyer_Orders_Build_Instructions.md`

Follow all instructions in that file for:
- API endpoints (GET orders list, GET order detail)
- UI components (OrderTimeline, OrderStatusSummary, PickupDetails)
- Buyer orders list page
- Buyer order detail page
- Dashboard integration

### Commit Strategy - Phase K-2

```bash
# After API endpoints complete
git add src/app/api/buyer/orders/
git commit -m "feat(buyer-orders): Add buyer orders API endpoints"

# After components complete
git add src/components/buyer/
git commit -m "feat(buyer-orders): Add buyer order UI components"

# After orders pages complete
git add src/app/[vertical]/buyer/orders/
git commit -m "feat(buyer-orders): Add buyer orders pages"

# After dashboard update
git add src/app/[vertical]/dashboard/page.tsx
git commit -m "feat(buyer-orders): Add orders link to user dashboard"

# Push branch to GitHub
git push origin feature/buyer-orders
```

### Testing Checkpoint - Phase K-2

**Tell Tracy to test:**
1. Navigate to `/farmers_market/buyer/orders`
2. Verify orders list loads
3. Click on an order
4. Verify order detail page shows timeline and pickup details

**Wait for Tracy's approval before proceeding to merge.**

### Merge to Main - Phase K-2

**After Tracy approves:**

```bash
# Switch to main
git checkout main

# Pull any changes
git pull origin main

# Merge buyer orders
git merge feature/buyer-orders

# Push to main
git push origin main

# Delete feature branch (optional)
git branch -d feature/buyer-orders
```

### Create Session Summary - Phase K-2

Create: `Phase_K2_Buyer_Orders_Session_Summary.md`

Include:
- Date and duration
- Files created
- Files modified
- Testing results (from Tracy)
- Any issues encountered
- Notes

---

## CRITICAL REMINDERS

### File Boundaries
- **Phase K-1:** ONLY touch `/vendor/` folders
- **Phase K-2:** ONLY touch `/buyer/` folders
- **Both:** Do NOT modify `/cart/` or `/checkout/` folders
- **Both:** Do NOT modify shared utilities or components

### Database
- Both phases READ ONLY from `orders` and `order_items` tables
- NO schema changes allowed in either phase
- If schema changes needed, STOP and report to Tracy

### Testing
- Tracy must test and approve EACH phase before merge
- Do not proceed to Phase K-2 until K-1 is merged
- Do not merge to main without Tracy's approval

### Build Verification
After EACH phase, verify build passes:
```bash
npm run build
```

If build fails, fix errors before committing.

---

## Test Data (Optional)

If Tracy wants to test with mock data, you can create test orders in Dev database.

See Phase K-1 build instructions Part 5 for SQL to create test orders.

**Ask Tracy if she wants test data before creating it.**

---

## Questions to Ask Tracy Before Starting

1. Do you want me to create test orders in the database for testing?
2. Should I proceed with both phases automatically, or wait for approval between K-1 and K-2?
3. Any specific testing scenarios you want me to prepare for?

---

*End of instructions*
