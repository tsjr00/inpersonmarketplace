# Build Instructions - Market Limits & Enforcement System

**Based on Testing Session: January 17, 2026**

---

## TIER LIMITS REFERENCE

### Standard Vendors
- Traditional markets: **1** (designated as "home market")
- Private pickup locations: **1**
- Total Market Boxes: **2** (active + inactive)
- Active Market Boxes: **1**
- Product listings: **5**

### Premium Vendors
- Traditional markets: **4**
- Private pickup locations: **5**
- Total Market Boxes: **6** (active + inactive)
- Active Market Boxes: **4**
- Product listings: **10**

---

# PHASE 1: CRITICAL BUGS (Must Fix First)

---

## BUG 1.1: Market Box Activation Bypass

### Problem
Standard vendors can currently circumvent the 1-active-box limit by deactivating an existing box, creating a second box, then reactivating the first box. This results in multiple active Market Boxes when the business rule allows only 1 active box for standard tier vendors. The system checks limits only at creation time, not at reactivation, allowing vendors to exceed their tier limits. This breaks the core business model where premium features (multiple boxes) are a paid upgrade incentive.

### Desired End Result
When a standard vendor attempts to reactivate a Market Box and they already have 1 active box, the system must prevent reactivation and display an error message: "Cannot activate. Limit is 1 active box. **Upgrade to increase your available Market Boxes.**" The activation button should be disabled or show an upgrade prompt. The limit check must occur at both creation AND reactivation. Premium vendors with a 4-active-box limit should have the same enforcement at reactivation.

---

## BUG 1.2: Market Assignment Not Enforced Across Features

### Problem
Standard vendors are currently able to assign different traditional markets to their listings and Market Boxes, bypassing the 1-traditional-market limit. For example, vendor "Emily" has product listings assigned to "Tuesday Afternoon Seed Swap" while her Market Box is assigned to "Super Saturday Market." This creates buyer confusion about pickup locations and violates the core business rule that standard vendors can only operate at one traditional market at a time. The limit enforcement is not consistent across the listing creation flow, Market Box creation flow, and editing flows.

### Desired End Result
When a standard vendor selects their first traditional market (via listing or Market Box), that market becomes their "home market" and is the only traditional market available for all future listings and Market Boxes. In market selection dropdowns, the home market should be clearly labeled (text: "Home Market" where space allows, 🏠 icon where space is tight). Other traditional markets should be grayed out and show "Upgrade to join multiple markets" tooltip. The vendor can change their home market ONLY if they have zero active listings or Market Boxes at the current home market. Premium vendors can select any of their allowed 4 markets without restrictions. Private pickup locations are separate and do not count against the traditional market limit.

---

## BUG 1.3: Market Count Displays Show Incorrect Numbers

### Problem
Multiple screens display wrong market usage counts for vendors. The vendor dashboard shows "Active pickup locations (1)" when the vendor actually uses multiple markets across listings and Market Boxes. The "My Markets" screen shows "Traditional Markets (0 of 1 used)" when the vendor has already joined a market and has active listings there. These incorrect counts make vendors think they haven't hit limits when they actually have, or that they have room for more markets when they don't, leading to confusion and failed attempts to add more markets.

### Desired End Result
All market count displays must accurately reflect the vendor's current market usage by querying actual listings and Market Boxes. The count should show "X of Y used" where X is the actual number of traditional markets the vendor currently has listings/boxes at, and Y is their tier limit (1 for standard, 4 for premium). Dashboard "Active pickup locations" should show the total count of unique markets (traditional + private) where the vendor currently has active listings or Market Boxes. When the limit is reached, show "Limit reached - **Upgrade for more markets**" with upgrade link.

---

## BUG 1.4: Limit Enforcement Missing System-Wide

### Problem
Tier limits for listings, markets, and Market Boxes are only checked at creation time in some flows but not consistently enforced across all features. Vendors can bypass limits through various paths like reactivation (Market Boxes), editing existing items to add markets, or creating items in one feature that conflict with limits set in another feature. There's no centralized validation ensuring a vendor stays within their tier limits across all their activities. This means limits are effectively suggestions rather than enforced rules, undermining the premium tier value proposition.

### Desired End Result
Implement centralized limit validation that checks against actual current usage before allowing any action that would exceed tier limits. This validation must run during: creating new listings, creating new Market Boxes, assigning markets to listings, assigning markets to Market Boxes, reactivating inactive Market Boxes, and adding new markets to vendor account. When limit is exceeded, block the action and show appropriate error: "Limit reached: [X of Y used]. **Upgrade to [benefit].**" The validation should query real-time data (count of active items) rather than relying on cached counts.

---

# PHASE 2: MARKET RULES IMPLEMENTATION

---

## FEATURE 2.1: Home Market Concept for Standard Vendors

### Problem
Standard vendors need to be restricted to one traditional market but currently there's no mechanism to designate or enforce a "home market." Without this concept, the system can't properly guide vendors to use one consistent market, and can't prevent them from accidentally or intentionally spreading their presence across multiple markets. The UI doesn't communicate which market is their primary/home market, making it unclear to the vendor where they should be focusing their selling efforts. This also makes it difficult to market the multi-market feature as a premium benefit since there's no clear distinction between single-market and multi-market operations.

### Desired End Result
Implement a "home market" designation for standard vendors that automatically gets set when they select their first traditional market in any flow (listing creation, Market Box creation, or manual market joining). Once set, all subsequent traditional market selections in listing forms and Market Box forms should automatically default to and be locked to the home market. Display the home market with clear labeling: use full text "Home Market" where space allows (like in the My Markets screen or market management), and use 🏠 icon in condensed spaces (like dropdowns). In the market dropdown for new listings/boxes, show only the home market as selectable, with other markets grayed out and showing "Upgrade for multiple markets" on hover. Provide a "Change Home Market" option in My Markets screen that's only enabled when the vendor has zero active listings and zero active Market Boxes at the current home market. Premium vendors do not have a home market restriction and can select any of their 4 allowed markets freely.

---

## FEATURE 2.2: Private Pickup Location Limits

### Problem
Currently there's no cap on private pickup locations, allowing standard vendors to circumvent the traditional market restriction by creating unlimited private pickups. While private pickups serve a different purpose than traditional markets (vendor's own location vs. organized market event), unlimited private pickups could be abused to effectively operate at many locations without upgrading. This also creates potential for data bloat and makes it harder for buyers to understand a vendor's actual pickup options. The lack of limits on private pickups undermines the value proposition of the premium tier's multi-location benefits.

### Desired End Result
Standard vendors are limited to 1 private pickup location in addition to their 1 traditional home market. Premium vendors are limited to 5 private pickup locations in addition to their 4 traditional markets allowed. When attempting to create a new private pickup beyond the limit, block creation and show: "Limit reached: [X of Y private pickups used]. **Upgrade to add more pickup locations.**" The private pickup count is separate from traditional market count—these are independent limits. Display current usage in My Markets screen under Private Pickup Locations section: "Private Pickup Locations (X of Y used)" with the count updating in real-time based on actual created private pickup markets. When limit is reached, the "Create Private Pickup" button should be disabled and show upgrade prompt.

---

## FEATURE 2.3: Market Box Total Quantity Caps

### Problem
Standard vendors can currently create unlimited inactive Market Boxes, then selectively activate one at a time, effectively maintaining a library of pre-configured boxes. While the 1-active-box limit is in place, having unlimited inactive boxes creates database bloat, complicates vendor's own management (too many options), and provides too much flexibility that should be a premium feature. Without a total cap, vendors can prepare many boxes in advance and swap them frequently, which approaches premium functionality without paying for it. This also makes it unclear to vendors what the actual constraint is.

### Desired End Result
Standard vendors are limited to 2 total Market Boxes (active + inactive combined), with only 1 allowed to be active at any time. Premium vendors are limited to 6 total Market Boxes, with up to 4 allowed to be active simultaneously. When a standard vendor tries to create a 3rd box, block creation and show: "Limit reached: 2 Market Boxes maximum. **Upgrade to create more boxes.**" When attempting to activate a 2nd box as a standard vendor, show: "Cannot activate. Limit is 1 active box. **Upgrade to run multiple boxes simultaneously.**" Display current usage on Market Boxes management page: "Market Boxes (X of Y total, Z active)" so vendor always knows their current status against limits. Rename the "Edit Offering" button to "Edit/Reconfigure Market Box" to reinforce that boxes are reusable containers rather than disposable offerings.

---

# PHASE 3: MARKET BOX IMPROVEMENTS

---

## FEATURE 3.1: Market Box Reconfiguration Lock for Active Subscribers

### Problem
Vendors can currently edit and reconfigure a Market Box (change contents, pricing, pickup times) even when buyers have active subscriptions to that box. If a buyer purchases a 4-week "Super Salad Blowout" subscription and the vendor changes it to "All Tomatoes" after 2 weeks, the buyer receives something completely different than what they paid for. This creates a breach of contract, potential refund issues, buyer dissatisfaction, and liability concerns. There's currently no protection preventing vendors from changing the terms of a product that buyers have already purchased and are expecting to receive over multiple weeks.

### Desired End Result
When a Market Box has any active subscribers (buyers with incomplete subscriptions), lock the box from any edits or reconfigurations. On both the "Manage Box" screen and the "Edit Market Box" screen, display a lock icon with the message: "🔒 Cannot edit - active subscribers". Disable the "Edit/Reconfigure Market Box" button and show the lock message. The vendor can still view subscriber details and mark pickups as fulfilled, but cannot change the box name, description, contents, price, or pickup schedule. Once all active subscriptions are completed (all 4 weeks delivered and confirmed), the box automatically unlocks and can be edited. If vendor needs to make changes while subscribers are active, prompt them to contact support or wait for subscriptions to complete. Include a notice: "This box will unlock for editing once all current subscriptions complete."

---

## FEATURE 3.2: Add "Prepaid" to Market Box Descriptions

### Problem
The current description "Offer four week subscription bundles to premium buyers" doesn't make it clear that these are prepaid subscriptions where the buyer pays upfront for all 4 weeks. This is an important distinction because prepaid subscriptions have different implications for refunds, cancellations, vendor commitment, and buyer expectations compared to ongoing weekly purchases. Without the "prepaid" terminology, vendors might not fully understand the commitment they're making when they offer a Market Box, and buyers might not realize they're paying for the full month upfront.

### Desired End Result
Update the Market Boxes description text on the vendor Market Boxes management page from "Offer four week subscription bundles to premium buyers" to "Offer four week **prepaid** subscription bundles to premium buyers". The word "prepaid" should be bold or emphasized to ensure vendors understand this is upfront payment. This same language should appear anywhere Market Boxes are described in vendor-facing interfaces to maintain consistency and set proper expectations about the financial commitment involved.

---

# PHASE 4: UI/UX POLISH

---

## UI 4.1: Add "Etc." to Category Descriptions

### Problem
The category descriptions in the listing form (e.g., "Fresh fruits, vegetables, herbs, mushrooms, and microgreens" for Produce) appear to be exhaustive lists of what's allowed, which may cause vendors to think their item doesn't fit if it's not explicitly mentioned. The descriptions are meant to be helpful guides and examples, not complete inventories of acceptable items. Without indicating that these are examples, vendors might be confused about whether their specialty item belongs in a category or might think they need to ask permission for items not listed.

### Desired End Result
Add "...and similar items" or "etc." to the end of each category description in the listing form to make it clear these are example guides, not exhaustive lists. For example, change "Fresh fruits, vegetables, herbs, mushrooms, and microgreens" to "Fresh fruits, vegetables, herbs, mushrooms, microgreens, and similar items". The formatting, size, and color of the descriptions are already good and should remain unchanged—only the text content needs the clarifying addition. Apply this to all 11 category descriptions consistently.

---

## UI 4.2: Upgrade Prompts at Limit Messages

### Problem
When vendors hit their tier limits (5 listings for standard, 1 market, 1 active Market Box, etc.), the system currently just says "Limit reached" without any guidance on how to exceed that limit. This is a missed marketing opportunity to remind vendors that upgrading solves the problem they just encountered. The vendor is at a moment of frustration (can't do what they want) which is actually the perfect time to present the upgrade option as the solution. Without this prompt, vendors might not realize upgrading is even an option, or might not connect the limit they hit with the premium tier benefits.

### Desired End Result
Wherever a limit message appears (listing creation, Market Box creation/activation, market joining), append an upgrade prompt to the limit message. Format: "Limit reached. **Upgrade to increase your available [feature].**" with "Upgrade" as a clickable link going to the vendor upgrade page. Examples: "Limit reached: 5 of 5 listings used. **Upgrade to get 10 listings.**" or "Cannot activate box: 1 of 1 active. **Upgrade to run 4 boxes simultaneously.**" The upgrade prompt should be visually distinct (bold, colored, or with an icon) so it stands out as an actionable solution, not just informational text. Apply this consistently across all limit checks in vendor-facing interfaces.

---

## UI 4.3: Show Allergen Info on Listing Preview

### Problem
The "View" button on the vendor's "My Listings" page shows a preview of the listing but doesn't include the allergen warning badge that buyers see on the actual browse page. This inconsistency means vendors can't accurately preview how their listing appears to buyers, potentially missing important information display or thinking the allergen warning isn't showing when it actually is for buyers. Vendors should be able to see exactly what buyers see to verify their listing is displaying correctly and all important safety information is visible.

### Desired End Result
Update the listing preview shown when clicking "View" from the My Listings screen to exactly match what buyers see on the browse page, including the allergen warning badge if allergen info is present. The preview should be a true WYSIWYG (what you see is what you get) representation of the buyer experience. Include all elements: listing image, title, description, price, category badge, allergen badge (if applicable), vendor name, market/pickup location, and premium badge if applicable. This helps vendors verify their listings are complete and displaying correctly before buyers see them.

---

## UI 4.4: Home Market Visual Indicator

### Problem
When standard vendors look at their market lists or market selection dropdowns, there's currently no visual way to identify which market is their designated "home market." This makes it unclear which market is their primary selling location and which market all their items are tied to. Without visual distinction, vendors might not understand the home market concept or might try to add items to other markets without realizing they're restricted. A clear visual indicator reinforces the single-market restriction and makes it obvious which market is their current selling location.

### Desired End Result
Add visual indicators to show which market is the vendor's home market. Use two different indicators depending on available space: In locations with more space (like the My Markets screen, market management page, or wide dropdowns), display the text "Home Market" next to the market name in green or bold. In locations with less space (like condensed dropdowns or mobile views), use a 🏠 home icon next to the market name. The indicator should appear consistently wherever markets are listed in vendor-facing interfaces. The home market should be visually distinct at a glance—vendors should never have to guess which market is their home market. Premium vendors who don't have a home market restriction should not see any home market indicators.

---

## UI 4.5: Lock Message for Protected Market Boxes

### Problem
When vendors attempt to edit Market Boxes that have active subscribers, they need clear, concise feedback explaining why editing is blocked. The message needs to be short enough to fit in UI constraints while still being informative about the reason and the condition for unlocking. Long messages like "Unable to edit until all active subscriptions have been satisfied" create visual clutter and may not fit in all layouts where this restriction needs to be communicated (buttons, tooltips, notification banners).

### Desired End Result
Use the standardized lock message: "🔒 Cannot edit - active subscribers" wherever Market Box editing is blocked due to active subscriptions. This message should appear: (1) On the "Manage Box" screen, disabling the edit button, (2) On the "Edit Market Box" screen as a banner at the top if accessed via URL, (3) In any error messages if vendor tries to save changes to a locked box. The lock icon (🔒) provides immediate visual recognition, and "active subscribers" clearly communicates the condition. Optionally include a secondary message below: "This box will unlock when all subscriptions complete" for additional context, but the primary short message should always be visible.

---

## DEFERRED: Home Page Redesign

### Problem
The farmers_market home page (vertical landing page) currently doesn't create an engaging or welcoming first impression for new visitors. It needs to better communicate the value proposition for both farmers market vendors and buyers, create excitement about the platform, and guide visitors toward signing up or browsing. The page should reflect the community-focused, local-food atmosphere of farmers markets while clearly explaining what the platform offers.

### Desired End Result
SKIP FOR NOW - Focus on critical bugs and enforcement first. Will revisit home page design in a future phase after core functionality is solid. When we do tackle this, we'll need to design the concept first before building.

---

## DEFERRED: Email Notification Details

### Problem
When email notifications are implemented in the future, there are important details that need to be included to protect buyers and create clear records. Specifically, when Market Box subscriptions are purchased, the confirmation email should include all pickup details (days of week, specific dates, time ranges) so buyers have proof of the original agreement. If vendors change pickup times mid-subscription, buyers need to have documentation of what they originally agreed to. There also needs to be a warning system when vendors change market/location/times for offerings with active orders.

### Desired End Result
NOTED FOR FUTURE - When implementing email notifications (Phase TBD), remember to: (1) Include complete pickup schedule in Market Box confirmation emails: "Next 4 Saturdays: Jan 20, 27, Feb 3, 10 from 8am-12pm", (2) Flag/warn vendor when attempting to change market/location/time if there are outstanding orders: "Warning: Outstanding orders at this location", (3) Consider storing original offering terms with the purchase record as a receipt. This is for future planning, not for immediate implementation.

---

**END OF BUILD INSTRUCTIONS**

---

## SUMMARY FOR CC

**Total Items:** 15 fixes/features across 4 priority phases
**Estimated Time:** Phase 1 (Critical): 4-6 hours | Phase 2 (Rules): 3-4 hours | Phase 3 (Market Box): 2-3 hours | Phase 4 (UI): 2-3 hours
**Approach:** Tackle phases sequentially. Complete Phase 1 before moving to Phase 2.

**Questions/Issues:** Contact Tracy or Chet before making major architectural decisions. All limit numbers are finalized - use exactly as specified in reference table at top.
