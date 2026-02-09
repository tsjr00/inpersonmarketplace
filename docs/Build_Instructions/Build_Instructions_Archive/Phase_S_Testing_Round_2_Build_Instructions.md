# Build Instructions - Phase S: Testing Round 2 Fixes & Market Management

**Based on Testing Session: January 17, 2026 (Round 2)**
**Date Created:** January 17, 2026

---

## PHASE OVERVIEW

This phase addresses bugs found in testing after Phase R implementation, plus adds critical market management features including vendor-submitted markets and geographic filtering.

**Split into 2 sub-phases:**
- **Phase S1:** Bug Fixes (2-3 hours)
- **Phase S2:** Market Management Features (4-5 hours)

---

# PHASE S1: BUG FIXES

---

## BUG S1.1: Market Box Detail Page - "Offering Not Found"

### Problem
The buyer-facing Market Box detail page at `/[vertical]/market-box/[id]` is showing "Offering not found" error again. This was previously fixed but a recent change broke it. Buyers cannot view Market Box details to purchase subscriptions, completely blocking the Market Box purchasing flow. This is a critical revenue-blocking bug that prevents buyers from seeing what's in a Market Box before purchasing.

### Desired End Result
Market Box detail pages must load successfully for buyers. The page should display the offering details, vendor information, market/pickup details, contents list, pricing, and the purchase button. Verify the API response structure matches what the page component expects. Check if recent changes to the Market Box API or detail page component caused a mismatch. The page should handle both active and inactive Market Boxes appropriately (show "Not currently available" for inactive rather than "Not found").

---

## BUG S1.2: Button Text Not Updated

### Problem
On the Market Box management screen at `/[vertical]/vendor/market-boxes/[id]`, the button still displays "Edit Offering" when it should say "Edit/Reconfigure Market Box". This was specified in Phase R but didn't get implemented. The current text doesn't communicate that boxes are reusable containers that vendors reconfigure rather than disposable offerings they create and delete. This causes confusion about the Market Box concept.

### Desired End Result
Change the button text from "Edit Offering" to "Edit/Reconfigure Market Box" on the Market Box management/detail screen. Use this same text consistently anywhere this action button appears. The text should clearly communicate that vendors are reconfiguring an existing box container, not creating a new offering from scratch.

---

## BUG S1.3: Home Market Indicator Missing on My Markets Page

### Problem
The My Markets page at `/[vertical]/vendor/markets` displays the vendor's traditional markets but doesn't show which one is their designated home market. Standard vendors need to know which market is their home market since that's the only one they can use for listings and Market Boxes. Without a visual indicator, vendors don't understand which market is locked in as their primary location, making the home market restriction confusing and unclear.

### Desired End Result
On the My Markets page, display a clear visual indicator next to the vendor's home market. Use the 🏠 home icon and/or text label "Home Market" depending on available space (reference: we use text where space allows, icon where space is tight). The home market should be immediately visually distinct from other markets in the list. For standard vendors, this is their only allowed traditional market. For premium vendors who don't have a home market restriction, no indicator should appear. Ensure the indicator appears in the Traditional Markets section of the page.

---

## BUG S1.4: No UI to Change Home Market

### Problem
Standard vendors have no way to change their home market through the UI, even when it's valid to do so (zero active listings at current home market). The home market gets set automatically when they first join a market, but there's no button, checkbox, or other control to change it. Vendors need to be able to switch markets seasonally (e.g., one market in spring, different market in fall), but currently they're locked to their first market forever. This makes the platform inflexible for real-world vendor operations.

### Desired End Result
Add home market management UI to the My Markets page at `/[vertical]/vendor/markets`. Display a "Set as Home Market" button or similar control next to each traditional market in the list (except the current home market). When vendor clicks to change home market, check if they have any active (published) listings or active Market Boxes at the current home market. If they do, show error: "Cannot change home market while you have active listings or Market Boxes at [current market]. Unpublish them first, then try again." If they have zero active items, allow the change and automatically update all unpublished listings to point to the new home market (they just need to republish them). Show confirmation: "Home market changed to [new market]. Your unpublished listings have been updated automatically." Premium vendors should not see this UI since they don't have home market restrictions.

---

## BUG S1.5: Pickup Mode Dropdown Not Filtered

### Problem
The vendor pickup mode page at `/[vertical]/vendor/pickup` has a market dropdown that shows all markets from the My Markets page without applying the home market restriction. For standard vendors, this dropdown shows markets they shouldn't be able to select (like Super Saturday Market when Tuesday Afternoon is their home market). The pickup mode is used during market day to process orders, so showing wrong markets causes confusion and could lead vendors to look for orders at the wrong location.

### Desired End Result
Apply the home market filtering rule to the pickup mode market dropdown. For standard vendors, only show their home market in the dropdown (or if they somehow don't have a home market yet, show all markets with home market indicator). For premium vendors, show all their joined markets. The dropdown should pull from the same filtered market list that's used elsewhere in the vendor interface. If the fix to the My Markets page filtering cascades to this page automatically, that's ideal. Otherwise, explicitly apply the filtering logic to the pickup mode market selector.

---

## BUG S1.6: Admin Card Goes to Wrong Dashboard

### Problem
On the user dashboard, when an admin (who has both vertical admin AND platform admin permissions) clicks the "Admin Dashboard" card, they're taken directly to the platform-level admin dashboard. This bypasses the vertical admin panel entirely and creates a workflow problem. Some admins will only have vertical-level permissions (not platform-level), and they should never see or access the platform dashboard. The admin card should ALWAYS take users to the vertical admin panel first. Only from within the vertical admin panel should platform admins see a button to access the platform dashboard.

### Desired End Result
Change the admin card on the user dashboard to navigate to the vertical admin panel at `/[vertical]/admin`, not the platform admin dashboard. Update the card text from "Admin Dashboard" to "Admin Panel" to match the terminology change. Within the vertical admin panel, check if the logged-in user has platform admin permissions (see separate task for role verification). If they do, show a "Platform Admin" button in the navigation that goes to `/admin`. If they don't have platform admin permissions, hide that button entirely. The platform dashboard should ONLY be accessible from within the vertical admin panel, never directly from the user dashboard. This ensures proper access control hierarchy: User Dashboard → Vertical Admin Panel → (if authorized) Platform Admin Dashboard.

---

## BUG S1.7: Vendor Profile Missing Category Label

### Problem
On the public vendor profile page, there's a section showing category badges (small colored ovals) for the categories where the vendor has active listings. However, this section has no label, while the pickup locations section below it has a clear "Pickup Locations" label. Without a label, buyers might not immediately understand what the category badges represent. This makes the profile layout inconsistent and less scannable. Additionally, if a vendor sells Market Boxes, there's no indicator of that in the category section.

### Desired End Result
Add a section label "Listing Categories" above the category badge display on the vendor profile page. Style it to match the "Pickup Locations" label below it (same font size, weight, color). When displaying categories, include all unique categories from the vendor's active listings. If the vendor has any active Market Boxes, also add a "Market Box" badge in the same style as the category badges to indicate this vendor offers subscriptions. The "Market Box" badge should be purely visual (not clickable), just like the category badges. This helps buyers quickly see that the vendor offers subscription boxes without needing to navigate elsewhere. The order should be: regular category badges first (alphabetically), then the Market Box badge if applicable.

---

# PHASE S2: MARKET MANAGEMENT FEATURES

---

## FEATURE S2.1: Platform Admin Role Verification

### Problem
The system needs to distinguish between vertical-level admins and platform-level admins to properly control access to the platform admin dashboard. Currently, the admin navigation may not be checking for the correct permission level. We need to verify whether a `platform_admin` role exists in the database and ensure it's being used correctly. Only users with platform admin permissions should see the button to access the platform dashboard from within the vertical admin panel. There must always be at least one platform admin in the system, and only platform admins can assign other users as platform admins.

### Desired End Result
Check the database schema to determine if `platform_admin` is already a valid role in the `user_profiles` table (check both the `role` field and `roles` array field). If the role doesn't exist, add it to the system as a valid role value. Identify which approach is used: single role field vs. roles array, and implement accordingly. Create or update a utility function to check if a user has platform admin permissions. Use this function in the vertical admin panel navigation to conditionally show/hide the "Platform Admin" button. Document which users currently have platform admin permissions (if any exist). Ensure the permission check is secure and happens server-side (not just UI hiding). Add a note in the session summary about which existing users (if any) need to be granted platform_admin role, or if Tracy needs to manually assign the first platform admin via database update.

---

## FEATURE S2.2: Vendor-Submitted Market Approval Workflow

### Problem
Currently, only vertical admins can create new traditional markets, creating a bottleneck. Vendors may want to sell at markets that the admin doesn't know about or hasn't added yet. The vendor has to contact the admin, wait for the admin to manually create the market, then the vendor can select it. This slows down vendor onboarding and market expansion. Vendors are closest to the markets they actually sell at and should be able to submit new markets for approval rather than waiting on admin action.

### Desired End Result
Add a "Submit New Market for Approval" button to the vendor's My Markets page at `/[vertical]/vendor/markets`. When clicked, show a form for vendors to submit market details: market name, street address, city, state, ZIP code, market day(s) of week (checkboxes for multiple days), hours (start time and end time), contact email, contact phone, and optionally a market website/description. Only allow submission of traditional markets (not private pickups - vendors can create those directly). When vendor submits, create a pending market record with status='pending' and store the submitting vendor's ID. In the vertical admin panel at `/[vertical]/admin/markets`, show pending market submissions in a "Pending Markets" section or tab. Display submission details including which vendor requested it. Admin can approve (changes status to 'active' and makes it available to all vendors in the vertical who are within geographic range) or reject (with optional rejection reason that gets shown to the vendor). If rejected with a reason, notify the vendor why (through their dashboard or a message system if available). If approved, the market becomes available in the market selection dropdowns for all qualifying vendors. Both standard and premium vendors can submit markets for approval - submission capability is not tier-restricted.

---

## FEATURE S2.3: Geographic Filtering - Address Geocoding

### Problem
To implement 25-mile radius filtering for markets, the system needs latitude and longitude coordinates for both vendor business addresses and market addresses. Currently, addresses are stored as text fields (street, city, state, ZIP) but not as geographic coordinates. Without coordinates, we cannot calculate distances or filter which markets are within a vendor's service radius. Vendors and admins shouldn't have to manually look up and enter lat/long coordinates - this should happen automatically.

### Desired End Result
Add latitude and longitude fields to the `vendor_profiles` table (for vendor business addresses) and the `markets` table (for market addresses). Implement automatic geocoding when addresses are entered or updated: when a vendor completes signup or updates their business address, use a geocoding service to convert the address to lat/long and store the coordinates. When an admin creates a market or a vendor submits a market for approval, geocode the market address and store coordinates. Use a free geocoding option if available (like Nominatim/OpenStreetMap) or a low-cost option (Google Geocoding API with generous free tier). Handle geocoding failures gracefully - if geocoding fails, allow the record to save but flag it for manual review (perhaps store a geocoding_failed boolean). Add a utility function that takes an address and returns coordinates, making it reusable across vendor signup, vendor settings updates, and market creation. Store coordinates as DECIMAL(10,8) for latitude and DECIMAL(11,8) for longitude for proper precision.

---

## FEATURE S2.4: Geographic Filtering - 25 Mile Radius

### Problem
Vendors in different geographic areas don't need to see markets from other cities or regions that are too far away to be practical. Currently, all markets in a vertical are shown to all vendors regardless of location. A vendor in Dallas shouldn't see markets in Houston (200+ miles away). This creates clutter in market selection dropdowns and makes it harder for vendors to find their local markets. Geographic filtering is essential for scaling the platform beyond a single city.

### Desired End Result
Implement 25-mile radius filtering using the Haversine formula (straight-line distance calculation using latitude and longitude). Create a utility function that takes two coordinate pairs and returns the distance in miles. When displaying available markets to a vendor (in My Markets page, listing form dropdowns, Market Box form dropdowns), filter the list to only show markets within 25 miles of the vendor's business address. Use the vendor's stored lat/long and each market's lat/long to calculate distances. Sort results by distance (nearest first). If a vendor doesn't have valid coordinates (geocoding failed or address not set), show all markets with a warning: "Set your business address to see markets in your area." For the vendor signup flow, add explanatory text near the address fields: "We'll show you available markets within 25 miles of your business location." When a market is approved by admin, it automatically becomes available to all vendors in the vertical who are within the 25-mile radius. Document the Haversine formula implementation in code comments for future reference. Note: Google Maps Distance Matrix API will be added in a future phase for buyer-facing "find vendors near me" map feature - this phase uses simple distance calculation only.

---

## FEATURE S2.5: Admin Markets Management - Search/Sort/Filter

### Problem
As the platform scales, vertical admins may need to manage dozens or hundreds of markets within their region. The current markets management page at `/[vertical]/admin/markets` likely shows a simple list without search or filtering capabilities. In a metro area like Dallas-Fort Worth with 50+ farmers markets, finding a specific market or seeing which markets are in a particular city becomes impossible without search tools. Admins need to efficiently manage this growing dataset.

### Desired End Result
Add comprehensive search, sort, and filter controls to the admin markets management page. Add a search bar that filters markets by name (real-time search as admin types). Add filter dropdowns: (1) Market Type - filter by Traditional vs Private Pickup, (2) Status - filter by Active, Inactive, Pending (pending = submitted by vendors awaiting approval), (3) City - dropdown of unique cities from market addresses, (4) State - dropdown of unique states. Add sortable table columns: clicking column headers should toggle sort order (ascending/descending) for: market name, city, market type, status, number of vendors using this market. Display market count with filters applied: "Showing X of Y markets". Show pending market submissions prominently (perhaps in a separate tab or highlighted section) so admins can quickly review and approve/reject vendor submissions. The search/filter/sort should work together (compound filtering). Add a "Clear Filters" button to reset all filters. Consider pagination if the market list gets very long (20-30 markets per page). The UI pattern should match the existing search/filter implementations on other admin pages (like vendor management, user management) for consistency.

---

## FEATURE S2.6: Admin Panel Terminology Update

### Problem
The terminology "Admin Dashboard" is used throughout the UI but should be "Admin Panel" to clearly distinguish between the user's personal dashboard (where they see their own activity) and the admin panel (where they manage the platform). This terminology change makes it easier to teach new admins how to use the system and creates a clear mental model: dashboards are personal, panels are management tools. The current inconsistent terminology can confuse new users about where they are in the application.

### Desired End Result
Update all UI text that says "Admin Dashboard" to say "Admin Panel". This includes: (1) The admin card on the user dashboard - change card text to "Admin Panel", (2) Page titles and headers in the admin section, (3) Navigation breadcrumbs that reference the admin area, (4) Any help text or tooltips that mention the admin area. This is purely a UI text change - do NOT change database field names, API route names, file names, or function names. Only change user-facing display text. The goal is to make the UI more intuitive for humans while keeping the technical implementation stable. If any text changes would cause technical risk (breaking imports, route conflicts, etc.), skip those and only change the safe UI text instances.

---

## DATABASE MIGRATIONS REQUIRED

### Migration S2.3: Add Geocoding Fields

**File:** `supabase/migrations/20260117_002_add_geocoding_fields.sql`

```sql
-- Add latitude/longitude to vendor_profiles
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8),
ADD COLUMN IF NOT EXISTS geocoding_failed BOOLEAN DEFAULT false;

COMMENT ON COLUMN vendor_profiles.latitude IS 'Latitude of vendor business address';
COMMENT ON COLUMN vendor_profiles.longitude IS 'Longitude of vendor business address';
COMMENT ON COLUMN vendor_profiles.geocoding_failed IS 'True if automatic geocoding failed';

-- Add latitude/longitude to markets
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8),
ADD COLUMN IF NOT EXISTS geocoding_failed BOOLEAN DEFAULT false;

COMMENT ON COLUMN markets.latitude IS 'Latitude of market address';
COMMENT ON COLUMN markets.longitude IS 'Longitude of market address';
COMMENT ON COLUMN markets.geocoding_failed IS 'True if automatic geocoding failed';

-- Add index for geographic queries
CREATE INDEX IF NOT EXISTS idx_markets_coordinates ON markets(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_coordinates ON vendor_profiles(latitude, longitude);
```

---

### Migration S2.2: Add Market Submission Fields

**File:** `supabase/migrations/20260117_003_add_market_submission_fields.sql`

```sql
-- Add submitted_by to track vendor-submitted markets
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN markets.submitted_by IS 'Vendor who submitted this market for approval';
COMMENT ON COLUMN markets.submitted_at IS 'When the market was submitted';
COMMENT ON COLUMN markets.reviewed_by IS 'Admin who approved/rejected';
COMMENT ON COLUMN markets.reviewed_at IS 'When the review decision was made';
COMMENT ON COLUMN markets.rejection_reason IS 'Optional reason for rejection';

-- Add index for pending markets queries
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_submitted_by ON markets(submitted_by);
```

---

## UTILITY FUNCTIONS TO CREATE

### Geographic Distance (Haversine)

**File:** `src/lib/geo-utils.ts`

```typescript
/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Filter markets within radius of vendor location
 */
export function filterMarketsByRadius(
  vendorLat: number,
  vendorLon: number,
  markets: Market[],
  radiusMiles: number = 25
): Market[] {
  return markets
    .filter(m => m.latitude && m.longitude && !m.geocoding_failed)
    .map(m => ({
      ...m,
      distance: calculateDistance(vendorLat, vendorLon, m.latitude!, m.longitude!)
    }))
    .filter(m => m.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}
```

---

### Geocoding Service

**File:** `src/lib/geocoding.ts`

```typescript
/**
 * Geocode an address to lat/long coordinates
 * Uses Nominatim (OpenStreetMap) - free, no API key needed
 * Rate limit: 1 request per second
 */
export async function geocodeAddress(
  street: string,
  city: string,
  state: string,
  zip: string
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const address = `${street}, ${city}, ${state} ${zip}, USA`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FastWrksMarketplace/1.0' // Required by Nominatim
      }
    });
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding failed:', error);
    return null;
  }
}
```

---

## TESTING CHECKLIST

### Phase S1 Bugs
- [ ] Market Box detail page loads without "Offering not found" error
- [ ] Button says "Edit/Reconfigure Market Box" not "Edit Offering"
- [ ] Home market shows 🏠 icon or "Home Market" text on My Markets page
- [ ] "Set as Home Market" button appears next to non-home markets
- [ ] Cannot change home market with active listings (error shown)
- [ ] Can change home market with zero active listings
- [ ] Unpublished listings auto-update to new home market
- [ ] Pickup mode dropdown only shows home market (standard vendors)
- [ ] Admin card on user dashboard goes to vertical admin panel
- [ ] Admin card text says "Admin Panel" not "Admin Dashboard"
- [ ] Platform Admin button visible only to platform admins
- [ ] Platform Admin button hidden for vertical-only admins
- [ ] Vendor profile shows "Listing Categories" label
- [ ] Vendor profile shows Market Box badge when vendor has active boxes

### Phase S2 Features
- [ ] Platform admin role exists or was created
- [ ] Permission check works for platform admin button
- [ ] "Submit New Market" button appears on vendor My Markets page
- [ ] Market submission form captures all required fields
- [ ] Submitted markets show as pending in admin markets page
- [ ] Admin can approve pending markets
- [ ] Admin can reject with optional reason
- [ ] Approved markets appear for vendors within 25-mile radius
- [ ] Vendor addresses get geocoded on signup
- [ ] Market addresses get geocoded on creation
- [ ] Failed geocoding is flagged (geocoding_failed = true)
- [ ] Markets filtered by 25-mile radius for vendor
- [ ] Markets sorted by distance (nearest first)
- [ ] Admin markets page has search bar (filters by name)
- [ ] Admin markets page has filter dropdowns (type, status, city, state)
- [ ] Admin markets page has sortable columns
- [ ] Pending markets prominently displayed for admin review
- [ ] All "Admin Dashboard" text changed to "Admin Panel"

---

## COMMIT STRATEGY

```bash
# After Bug S1.1 (Market Box detail)
git add src/app/[vertical]/market-box/[id]/
git commit -m "fix(market-box): Resolve 'Offering not found' error on detail page"
git push

# After Bug S1.2-S1.7 (UI fixes)
git add src/app/[vertical]/vendor/market-boxes/ src/app/[vertical]/vendor/markets/ src/app/[vertical]/vendor/pickup/ src/app/[vertical]/dashboard/ src/app/[vertical]/vendor/[vendorId]/profile/
git commit -m "fix(ui): Home market indicators, admin navigation, button text, category labels"
git push

# After migrations
git add supabase/migrations/
git commit -m "feat(db): Add geocoding and market submission fields"
git push

# After S2.1 (Platform admin role)
git add src/lib/auth-utils.ts src/app/[vertical]/admin/
git commit -m "feat(auth): Add platform admin role verification"
git push

# After S2.2 (Market submissions)
git add src/app/[vertical]/vendor/markets/ src/app/api/markets/submit/ src/app/[vertical]/admin/markets/
git commit -m "feat(markets): Add vendor-submitted market approval workflow"
git push

# After S2.3-S2.4 (Geocoding & filtering)
git add src/lib/geocoding.ts src/lib/geo-utils.ts src/app/api/vendor/ src/app/api/markets/
git commit -m "feat(geo): Add geocoding and 25-mile radius filtering"
git push

# After S2.5-S2.6 (Admin improvements)
git add src/app/[vertical]/admin/markets/
git commit -m "feat(admin): Add search/filter/sort to markets management, update terminology"
git push
```

---

## IMPORTANT NOTES

### Geocoding Rate Limits
Nominatim (OpenStreetMap) has a rate limit of 1 request per second. If geocoding many addresses at once (like during vendor import), add delays between requests. Consider caching geocoded results.

### Geographic Distance Accuracy
Haversine formula calculates straight-line ("as the crow flies") distance, not driving distance. For a 25-mile radius, this is accurate within 1-2% for filtering purposes. Buyers will get driving directions via Google Maps in a future phase.

### Platform Admin Assignment
After implementing platform admin role verification, Tracy will need to manually grant platform_admin role to at least one user via database update. Provide SQL for this in the session summary.

### Home Market Auto-Update Logic
When home market changes, update query should be:
```sql
UPDATE listings 
SET market_id = [new_home_market_id]
WHERE vendor_profile_id = [vendor_id]
  AND status = 'draft'  -- or whatever 'unpublished' status is
  AND market_id = [old_home_market_id];
```

---

## DEFERRED TO FUTURE PHASE

**Admin Panel 4-Card Reorganization:** Tracy requested reorganizing the vertical admin panel into 4 equal-sized cards (Manage Markets, Manage Users, Manage Vendors, Manage Listings) with dashboard-style highlights in each card. This is a significant UI redesign and is deferred to a future phase to focus on critical bugs and market management first.

---

**END OF BUILD INSTRUCTIONS**

---

## SUMMARY FOR CC

**Phase S1:** 7 bug fixes (2-3 hours)
**Phase S2:** 6 new features (4-5 hours)
**Total:** 13 items, 6-8 hours estimated

**Migrations:** 2 new migrations for geocoding and market submissions

**Questions for Tracy/Chet:**
- Which users need platform_admin role initially?
- Confirm geocoding service (Nominatim) is acceptable or prefer different service?

**Critical Path:** S1 bugs should be fixed first as they're blocking vendor and buyer functionality. S2 features can follow after bugs are resolved.
