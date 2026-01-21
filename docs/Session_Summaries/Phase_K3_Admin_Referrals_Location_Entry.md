# Phase K-3: Admin Referral Tracking & Location Entry

**Date:** January 21, 2026
**Focus:** Admin referral tracking, vendor activity monitoring UI, and hyper-local zip code entry

---

## Summary

This session added admin tools for tracking vendor referrals, improved the vendor activity monitoring UI, and implemented a privacy-conscious location entry system for hyper-local results.

---

## Features Implemented

### 1. Admin Referral Tracking

**Problem:** Admins had no visibility into which vendors were successfully referring other vendors.

**Solution:** Added a Referrals tab to the existing vendor-activity admin page.

**Files Created/Modified:**
- `apps/web/src/app/api/admin/vendor-activity/referrals/route.ts` - NEW API endpoint
- `apps/web/src/app/[vertical]/admin/vendor-activity/VendorActivityClient.tsx` - Added tabs and referrals UI

**Features:**
- **Stats Summary Cards:** Total referrals, earned, pending, applied counts with dollar amounts
- **Top Referrers Leaderboard:**
  - 🥇🥈🥉 medals for top 3
  - Vendor name linked to admin search
  - Email displayed (clickable mailto link) for easy contact
  - Earned/pending counts with credit amounts
- **Recent Activity Feed:** Shows referrer → referred relationships with status badges

**API Response Structure:**
```json
{
  "stats": {
    "totalReferrals": 15,
    "pendingCount": 3,
    "earnedCount": 10,
    "appliedCount": 2,
    "totalPendingCents": 1500,
    "totalEarnedCents": 5000,
    "totalAppliedCents": 1000
  },
  "topReferrers": [...],
  "recentReferrals": [...]
}
```

---

### 2. Side Navigation for Vendor Activity

**Problem:** Horizontal tabs for Activity Flags and Referrals got confused with the main admin navigation tabs.

**Solution:** Changed to a vertical side navigation strip.

**Layout:**
```
┌──────────┬──────────────────────────────────┐
│ 🚩 Flags │  [Main content area]             │
│ 🎁 Refs  │  - Stats, leaderboard, activity  │
└──────────┴──────────────────────────────────┘
```

**Features:**
- Sticky positioning (stays visible while scrolling)
- Clear visual distinction from top nav
- Active state highlighting

---

### 3. Vendor Activity Card on Admin Panel

**Problem:** Admins had to navigate to the vendor-activity page to see if any vendors needed attention.

**Solution:** Added an "Activity" card to the main admin panel dashboard.

**File Modified:**
- `apps/web/src/app/[vertical]/admin/page.tsx`

**Features:**
- Red border when issues need attention
- Badge showing count: "X needs attention"
- Breakdown by issue type with color-coded rows:
  - ⏰ Not logged in recently (yellow)
  - 📭 No published listings (red)
  - 🚧 Incomplete onboarding (orange)
  - 📉 No recent orders (purple)
  - 📝 No listing updates (blue)
- Green "✓ All vendors active" when no issues
- Links directly to vendor-activity page

---

### 4. Zip Code Location Entry (Hyper-Local)

**Problem:** Browser location permission popups create distrust. Users increasingly block location services, but we need location to show relevant local results.

**Solution:** Transparent, user-controlled zip code entry on the landing page.

**Files Created/Modified:**
- `apps/web/src/components/landing/LocationEntry.tsx` - NEW component
- `apps/web/src/components/landing/Hero.tsx` - Integrated LocationEntry
- `apps/web/src/components/landing/index.ts` - Added export
- `apps/web/src/app/[vertical]/browse/page.tsx` - Accept zip param, show location badge
- `apps/web/src/app/[vertical]/markets/page.tsx` - Accept zip param

**Features:**
- **Entry Mode:**
  - Zip code input with validation (5-digit US format)
  - "Find Local" button (same size as input)
  - Privacy note: "We store this locally on your device. We don't track your location."
- **Saved Mode:**
  - Shows "Showing results near [zip]" with Change button
  - localStorage persistence (30-day expiration)
- **Browse/Markets Integration:**
  - CTA buttons pass zip to destination pages
  - Location badge shown on browse page with X to clear

**Privacy Approach:**
- No browser permission popup (avoids distrust)
- Data stored in localStorage only (not server)
- User controls their data completely
- Transparent messaging about what we do

**Landing Page Layout:**
```
┌─────────────────────────────────────────────┐
│  📍 Enter your zip code to find local...   │
│                                             │
│  [Enter zip code   ] [   Find Local    ]   │
│                                             │
│  We store this locally. We don't track you.│
│                                             │
│  Fresh, Local Food                          │
│  From Your Community                        │
│  ...                                        │
└─────────────────────────────────────────────┘
```

---

## UI Refinements

1. **Removed redundant pill** - The "X Markets • Y+ Products" badge was redundant with the TrustStats strip below
2. **Darkened location entry text** - Changed from secondary to primary color with medium weight
3. **Matched button to input size** - Both 180px wide, same padding/height

---

## Files Changed Summary

### New Files
| File | Purpose |
|------|---------|
| `apps/web/src/app/api/admin/vendor-activity/referrals/route.ts` | Admin referrals API |
| `apps/web/src/components/landing/LocationEntry.tsx` | Zip code entry component |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/src/app/[vertical]/admin/vendor-activity/VendorActivityClient.tsx` | Side nav, tabs, referrals tab content |
| `apps/web/src/app/[vertical]/admin/page.tsx` | Added Activity card to admin panel |
| `apps/web/src/components/landing/Hero.tsx` | Integrated LocationEntry, removed pill |
| `apps/web/src/components/landing/index.ts` | Export LocationEntry |
| `apps/web/src/app/[vertical]/browse/page.tsx` | Accept zip param, show location badge |
| `apps/web/src/app/[vertical]/markets/page.tsx` | Accept zip param |
| `apps/web/src/app/[vertical]/page.tsx` | Updated Hero props |

---

## Technical Notes

### Zip Code Accuracy
- Zip codes provide ~5 mile radius accuracy
- Sufficient for farmers market use case (shoppers travel 10-25 miles)
- City-level filtering also acceptable for initial results

### Future Enhancements (Not Implemented)
- IP geolocation for initial city suggestion (server-side)
- Actual distance-based filtering on browse/markets pages
- Zip code to lat/long conversion for proximity sorting

---

## Git Commit

```
4e1c14f Add vendor activity monitoring, tutorials, and admin referral tracking
```

Note: This commit also included the tutorial system from earlier in the session.

---

## Testing Checklist

- [ ] Navigate to `/{vertical}/admin` - Activity card shows with correct counts
- [ ] Click Activity card - goes to vendor-activity page
- [ ] Side nav shows Activity Flags and Referrals tabs
- [ ] Referrals tab shows stats, leaderboard, activity feed
- [ ] Vendor emails are clickable (mailto links)
- [ ] Landing page shows zip code entry
- [ ] Enter valid zip - saves to localStorage, shows "Showing results near X"
- [ ] Click "Browse Products" - URL includes ?zip=XXXXX
- [ ] Browse page shows location badge with X to clear
- [ ] Refresh page - zip code persists from localStorage
- [ ] Click "Change" on saved location - returns to entry mode
