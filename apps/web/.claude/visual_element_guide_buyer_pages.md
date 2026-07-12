# Visual Element Guide — Buyer-Facing Pages

**Purpose:** Visual field guide for identifying and discussing UI elements across all buyer-facing pages. Each element is defined once with a plain-language description, then mapped to where it appears. Companion document to the [Landing Page Guide](visual_element_guide.md).

**How to use this document:**
1. Look at a section of the app
2. Find the element in **Part A** (Master Element Catalog) by name or description
3. Check **Part B** (Page Location Map) to see everywhere that element appears
4. Elements numbered 1–42 are defined in the Landing Page Guide — referenced here but not re-defined

---

# PART A: Master Element Catalog

## Buttons

### 43. Solid Primary Button (Full-Width)
A wide button that stretches the full width of its container, filled with the brand color (green FM / red FT) and white text. Used as the main action button on forms and checkout flows. When disabled, the fill turns to a flat gray and the cursor shows "not allowed." When loading, the label changes to a "…ing" verb (e.g., "Adding…", "Processing…").

### 44. Outlined Primary Button
A button with no fill — just a thin colored border (2px) in the brand color on a transparent background. The text is the brand color. Used for secondary actions and CTA links throughout the app (like "View My Orders," "Upgrade Now," "Start Shopping"). Same capsule or rounded-rectangle shape as the Filled Primary Button from the landing page, but hollow.

### 45. Danger Button
A solid button filled with a strong red, white text inside. Used for destructive actions like "Delete My Account" or "Cancel Membership." When disabled, the red lightens to a muted pink-gray.

### 46. Ghost Button
A button with no fill, no colored border — just plain text that looks like a link but has the click area of a button. Usually in a muted gray or the brand color. Used for less-important actions like "Cancel," "Continue Shopping," or "Not now."

### 47. Quantity Stepper
A small inline control with three parts in a row: a minus button, a number display in the center, and a plus button. Each button is a small square (about 28px) with a thin gray border and a "−" or "+" symbol. The number sits in a fixed-width space between them. When you can't go lower or higher, that button fades to half-opacity.

### 48. Checkout Stepper (Joined)
A larger version of the Quantity Stepper used on the checkout page. The minus and plus buttons are joined to the center display (no gap between them) — the left button has rounded corners only on the left side, the right button only on the right side, creating one continuous control. About 36px tall.

### 49. Toggle Switch
A small horizontal pill-shaped toggle (about 48px wide, 26px tall). When "on," the pill fills with the brand color and a white circle thumb slides to the right. When "off," the pill is light gray and the thumb sits on the left. Used in notification settings.

### 50. Star Rating Picker
Five star characters (★) in a row, each clickable. When you hover or select a star, it and all stars to its left turn golden/amber; unselected stars are light gray. The selected star grows slightly (scales up about 10%). Below the stars, a word label appears matching your selection — "Poor," "Fair," "Good," "Great," or "Excellent!"

### 51. Password Visibility Toggle
A small icon button (eye emoji) sitting inside the right edge of a password input field. Tap it to switch between showing dots (hidden) and showing the actual text. The icon alternates between an open eye and a see-no-evil monkey.

### 52. Favorite Heart Button
A small heart emoji button (about 20px) in the upper-right corner of a vendor card. Empty white heart (🤍) when not favorited; solid red heart (❤️) when favorited. Grows slightly when you hover over it.

### 53. Close Button (Panel)
A small "×" character in the top-right corner of a panel or modal. No background, no border — just the character in a muted gray. Used to dismiss drawers, modals, and notification panels.

### 54. Chip Nav Button
A small pill-shaped button used for in-page anchor navigation. Has a thin border, brand-colored text, and a rounded-pill shape. Clicking it smooth-scrolls to a section of the same page. Used in groups of 3–4 at the top of long informational pages.

---

## Badges & Pills

### 55. Order Status Badge
A small rounded pill showing the current state of an order. Each status has its own background and text color:
- **Order Placed** — warm amber background, dark amber text
- **Confirmed** — light blue background, dark blue text
- **Ready for Pickup** — light green background, dark green text
- **Acknowledge Your Pickup** — warm amber background, darker amber text
- **Completed / Picked Up** — light purple background, dark purple text
- **Cancelled / Refunded** — light red background, dark red text

### 56. Item Status Badge
Same pill shape as an Order Status Badge, but used on individual line items within an order (not the whole order). Shows states like "Preparing," "Ready for Pickup," "Picked Up," "Cancelled," or "Vendor Handed Off" — each with its own color matching the order-level scheme.

### 57. Tier Badge
A small pill with an emoji icon and colored styling that shows a vendor's subscription tier:
- **Standard / Basic** — gray background, gray text, no icon
- **Premium** — light blue background, blue text, ⭐ icon
- **Featured** — light amber background, amber text, ✨ icon
- **Pro** (FT only) — pale red background, red text, 🔥 icon
- **Boss** (FT only) — pale yellow background, charcoal text, 👑 icon
Comes in small, medium, and large sizes.

### 58. Category Badge
A small pill that sits over the top-left corner of a product image. Light brand-color background with darker brand-color text. Shows the product's category name (like "Vegetables" or "Baked Goods").

### 59. Allergen Badge
A small pill in the top-right corner of a product image. Light tan/subtle background with a golden-amber text color. Shows "⚠️ Allergens" to flag items with allergen information.

### 60. Availability Badge
A small pill on a Market Box card indicating capacity:
- **Full** — subtle gray background, golden text — "Full"
- **Spots left** — light brand-color background, brand text — "X spots left"

### 61. Box Type Badge
A small warm-yellow pill with dark amber text. Identifies the type of Market Box or Chef Box — values like "Weekly Dinner," "Family Kit," "Mystery Box," "Meal Prep," or "Office Lunch."

### 62. Event Badge
A small warm-yellow pill with dark amber text and a 🎪 emoji. Marks a market or card as an event (as opposed to a regular recurring market).

### 63. Payment Method Badge
A small amber/yellow pill with dark amber text, uppercase and bold. Shows "CASH," "VENMO," or the external payment method name. Appears on order cards and the pickup hero screen for non-Stripe orders.

### 64. Distance Badge
A tiny pill with a subtle gray background and muted text. Shows "X.X mi" to indicate how far a market or vendor is from your location. Appears inline next to addresses.

### 65. Cart Count Badge
A small red circle (about 20px) with white bold text inside, showing the number of items in the cart. Sits in the upper-right corner of the cart button, overlapping its edge slightly. Shows "99+" when the count is very high.

### 66. Action Needed Badge
A small pill with a strong orange background and white text. Says "Action Needed." Appears on the dashboard's "My Orders" card when there are orders requiring buyer acknowledgment.

### 67. Subscription Status Badge
An uppercase pill showing the state of a Market Box subscription:
- **Active** — light green background, dark green text
- **Completed** — light indigo/blue background, dark indigo text
- **Cancelled** — light red background, dark red text

### 68. Save Badge
A tiny pill positioned in the upper-right corner of a subscription term card. Light brand-color background with brand text. Shows "Save $X" when a longer subscription term has a discount.

### 69. Premium Badge (Inline)
A small inline text marker that says "Premium" in the accent/golden color. Appears next to a user's name on the dashboard to indicate their buyer tier.

### 70. "SELECTED" Chip
A tiny blue pill with white text that says "SELECTED." Appears on pricing cards (buyer upgrade page) when that option is currently chosen.

### 71. Unread Dot
A tiny solid circle (about 8px) in the brand color. Appears next to unread notifications in the notification dropdown to indicate they haven't been viewed yet.

---

## Cards & Containers

### 72. Listing Card (Product Card)
A vertical card showing a product for sale. White background, thin border, rounded corners. From top to bottom: a product image (or an emoji placeholder on a muted background if no image), the product title in bold, a short description (cut off after 2 lines), the price in bold brand color, an optional cutoff badge, a location line, and a footer with the vendor name and their Tier Badge. The whole card is clickable.

### 73. Market Box Card
Similar layout to a Listing Card but with a teal/subscription feel. Key differences: a "Market Box" or "Chef Box" badge in the top-left corner (instead of a category badge), an Availability Badge in the top-right corner, a Box Type Badge below the image, subscription pricing with a "for X weeks" sub-line showing per-week cost, and pickup schedule text at the bottom.

### 74. Market Card
A vertical card showing a market location. White background, thin border, slightly larger rounded corners than product cards. Contains: the market name as a bold heading, a short description (cut off after 2 lines), an address row with a small pin icon and optional Distance Badge, schedule information, optional season dates, and a footer with vendor count and an optional "Inactive" badge. The whole card lifts up slightly and shows a stronger shadow when you hover.

### 75. Vendor Card
A vertical card showing a vendor profile. White background, thin border, larger rounded corners. Contains: a circular vendor avatar (with tier-colored border for Pro/Boss), the vendor name, star rating with count, an optional Favorite Heart Button, a short description (cut off after 2 lines), category tags joined by dots, market names with distances, and a footer with listing count and Tier Badge. Lifts on hover like Market Cards.

### 76. Order Card
A clickable card showing an order summary. White background with a status-colored header area. Key parts: the total price and date in the header, a large Order Number Box in the center, item rows below (for active orders) showing titles, vendors, pickup dates, and per-item status badges. A status banner may appear at the bottom. Active orders (ready/handed-off) have a thicker colored border to draw attention.

### 77. Market Box Order Card
Like an Order Card but with a teal color scheme instead of the standard status colors. Shows: the offering name, a teal order number, a "Week N of M" badge, a progress bar, and next-pickup information. Clicking it goes to the subscription detail page.

### 78. Dashboard Card
A simple card on the dashboard — white background, thin border, rounded corners. Contains a large emoji icon, a bold title, and a brief subtitle in muted text. Used as navigation tiles (like "Browse Products," "My Orders," "My Favorites"). Some dashboard cards change their border color and background when they need attention (e.g., orange glow when action is needed).

### 79. Cart Item Card
A card inside the cart drawer showing one item you've added. White background, thin border. Contains: the item title, vendor name, unit price, a Quantity Stepper, a pickup info chip (light blue background with date/time/market), a line total in bold, and a trash-can remove button. When there's a schedule issue, the card gets a red-tinted background and a thicker red border with a warning message.

### 80. Market Box Cart Item Card
A card inside the cart drawer for a Market Box subscription. Subtle blue-gray background instead of white, blue-tinted border. Shows: a 📦 icon with the offering title, vendor name and term length, pickup schedule chip (blue-tinted), and the term total. No quantity controls (always one subscription at a time).

### 81. Checkout Item Card
A card on the checkout page showing one item being purchased. White background, thin border, subtle shadow. Contains: the item title, vendor name, a pickup info chip with market-type emoji (🎪 for events, 🏪 for traditional), the Checkout Stepper for quantity, per-item price, total price, and a "Remove" button in red. When an item is unavailable, the border turns red and a red availability chip appears ("Sold out" or "Only N available").

### 82. Cross-Sell Card
A small card in the "Other items you may enjoy" section at checkout. White background, thin border, subtle shadow. Contains: a small product image (or placeholder), the title (one line, truncated), the price in brand color, the vendor name in italic, and a small "View Item" button in brand color.

### 83. Order Summary Card (Sticky)
A card on the right side of the checkout page that stays pinned as you scroll ("sticky"). White background, slightly stronger shadow than other cards. Contains: the "Order Summary" heading, subtotal line, service fee line, optional small-order fee line, optional tip amount, a horizontal divider, and the total in large bold text. Below that: the Tip Selector (food trucks), Payment Method Selector, notices, and the main checkout button.

### 84. Pickup Details Card
A light gray card on the order detail page. Contains: a 📍 heading "Pickup Location," the market name in bold, the address as a clickable link (opens in maps), the pickup date and time in blue, optional market hours, and contact information (email and phone with emoji prefixes).

### 85. Status Summary Card
A colored banner card at the top of an order detail page. The background and border color match the order status (amber for pending, blue for confirmed, green for ready, purple for completed, red for cancelled). Contains: a large emoji icon on the left, the status title in bold, a descriptive message, and a "last updated" timestamp.

### 86. Premium Upgrade Card
A card with a gradient background (fading from light brand color to subtle gray). Thin brand-color border, larger rounded corners. Contains: a ⭐ icon, a bold heading about upgrading, pricing with an inline "Save 32%" badge, a checklist of benefits with brand-colored checkmarks, and an Outlined Primary Button labeled "Upgrade Now →."

### 87. Vendor Pitch Card (Dashboard)
A card with a dashed brand-color border (dashed, not solid) and no fill. Contains: a heading "Turn Your Passion Into Profit," a feature checklist with brand-colored checkmarks, and an Outlined Primary Button linking to vendor signup. Appears on the dashboard for buyers who aren't vendors yet.

### 88. Info Card (Left Border)
A white card with a thick colored left border (4px) and no other border. The border color indicates the card's tone: green/brand for general info, amber for warnings/tips, blue for emphasis. Contains a bold title and body text. Used on informational pages like "How It Works."

### 89. Auth Form Card
A centered card (narrow, about 400px max) with a noticeable brand-color border (2px, not the usual thin 1px). Contains a centered heading, form fields stacked vertically, a primary button, and small helper links below. Used for login, signup, forgot password, and reset password pages.

### 90. Acknowledgment Card
A selectable card used in the vendor signup form. Each card is a clickable row with a checkbox on the left. When unchecked: muted background, thin gray border. When checked: light brand-color background, thin brand-color border. Contains a bold title and a description of what the vendor is agreeing to.

### 91. Event Card (Highlighted)
Like a Market Card but with a warm amber border (2px instead of 1px) to make it stand out. Has an Event Badge in the upper area. Date text appears in amber instead of the usual muted color. Used for upcoming events in a special section above the regular market list.

---

## Form Elements

### 92. Standard Text Input
A full-width rectangular input field with a thin gray border and slightly rounded corners. When you click into it (focus), the border color shifts. If there's an error, the border turns red. Sits below a bold label. Standard across all forms in the app.

### 93. Search Input
A text input similar to the Standard Text Input but designed for search. Appears inside a filter panel alongside a "Search" button and other filter controls. Same thin border and rounded corners.

### 94. Filter Dropdown
A standard HTML select dropdown with thin border and rounded corners. Shows a default "All…" option followed by specific filter values. Used for filtering by category, state, city, location type, market, and sort order across browse pages.

### 95. Checkbox (Standard)
A small square checkbox (about 16–18px). When checked, it fills with the brand color (using the browser's accent-color feature). Used in filter panels ("Hide allergen items"), acknowledgment forms, and the multi-pickup confirmation on checkout.

### 96. Radio Card Selector
A set of options displayed as selectable cards rather than traditional radio buttons. Each option is a bordered card; the selected one gets a thicker brand-color border and a light brand-color background fill. Used for picking a payment method and selecting a subscription term.

### 97. Tip Preset Buttons
A row of small buttons for selecting a tip percentage: "No Tip," "10%," "15%," "20%," and "Custom." The selected button gets a brand-color border and light brand-color fill; unselected buttons have a plain gray border. When "Custom" is selected, a small number input appears alongside a "%" label. Only shown for food truck orders.

### 98. Pickup Date Button
A selectable button representing a specific pickup date and time. Shows the date (with a colored underline — each date gets a different color from a rotating palette), the time range in muted text, and an optional "Closing soon" mini-badge. When selected, it gets a brand-color border and light brand-color fill with a checkmark. Multiple options are grouped under their market name with a colored dot.

### 99. Time Slot Button
A small button in a 3-column grid, showing a specific pickup time slot (like "11:00 AM"). When selected, gets the same brand-border + light-fill + checkmark treatment as a Pickup Date Button. Used for food truck pickup time selection.

### 100. Subscription Term Card
A selectable card showing a subscription length option. The left side shows the term label (e.g., "4 weeks"), the right side shows the price in large brand-colored text with a per-week breakdown below. When selected, gets a brand-color border and blue-tinted fill. Multi-term options may have a Save Badge floating in the corner.

### 101. Rating Comment Textarea
A standard multi-line text area with a thin border and rounded corners. Used in the rating modal for leaving optional feedback about an order.

---

## Text Styles

### 102. Page Title (H1)
The main heading on each app page. Large, bold, usually in the brand color or dark text color. Appears once per page near the top (not counting the landing page Hero Headline, which is even larger).

### 103. Section Heading (App) (H2)
A heading used to divide a page into sections — like "Order Items," "Order Summary," "Pickup Schedule." Bold, slightly smaller than the page title. Dark text color.

### 104. Card Heading (H3)
A bold heading inside a card — like "Description," "Pickup Details," "Sold by." Slightly smaller than a Section Heading. Dark text color.

### 105. Monospace Order Number
A large number displayed in a monospace (fixed-width) font with extra letter spacing. Makes the order number look distinct and easy to read aloud. Used inside Order Number Boxes and at the top of order detail pages.

### 106. Price Text (Large)
The main price display — large, bold, in the brand color. Used for product prices, order totals, and subscription costs. Often followed by smaller muted text showing the unit or period (like "/each" or "for 4 weeks").

### 107. Price Text (Inline)
A smaller version of the price in brand color, used inside card rows and line items. Bold but not as large as the main Price Text.

### 108. Muted Helper Text
Very small text in a muted gray. Used for helper notes below inputs, timestamps, secondary information, and fine-print disclaimers. Often italic when serving as a hint.

### 109. Colored Pickup Date Text
Date text displayed in a blue color (not the brand color — specifically a standard blue). Used to highlight pickup dates within orders and subscriptions so they stand out from surrounding text.

### 110. Uppercase Section Label
Very small text that's all-uppercase with wide letter spacing. Used as section dividers — like "MARKET BOX SUBSCRIPTIONS" in the cart when you have a mix of regular items and subscriptions. Usually in a medium gray.

---

## Navigation Elements

### 111. Back Link
A small text link at the top of a page with a left arrow prefix ("← Back to…"). Tapping it goes to the previous page. The text is usually muted gray or the brand color. Always has a generous tap area (at least 44px tall) even though the text is small.

### 112. Header Nav Bar
The strip at the top of every page. White background, thin border along the bottom edge. On the left: the app logo or brand name. On the right: navigation links, the Cart Button, and the Notification Bell. On mobile (phones), the nav links collapse into a hamburger menu.

### 113. Cart Button (Nav)
A small button in the header with a 🛒 emoji and the word "Cart." Has a thin brand-colored border. When items are in the cart, a Cart Count Badge appears overlapping its upper-right corner.

### 114. Notification Bell
A bell icon button in the header. Uses an SVG bell outline in the brand color. When there are unread notifications, a small red count badge appears on it. Clicking it opens the Notification Dropdown.

### 115. Notification Dropdown
A panel that drops down from the Notification Bell. About 340px wide with a max height (scrollable). White background, rounded corners, shadow. Shows a header row with "Notifications" and a "Mark all read" link, then a scrollable list of notification rows. Unread rows have a light brand-color background and an Unread Dot; read rows are plain white.

### 116. User Avatar Menu
A small circle (32px) in the header showing either the user's initial letter (on a light brand-color background) or a profile image. Has a small downward caret next to it. Clicking it opens a dropdown menu with links to Dashboard, Settings, vendor pages (if applicable), admin pages (if admin), and a red Logout option.

### 117. Mobile Hamburger Menu
A menu icon (three horizontal lines) visible only on phones (hidden on wider screens). Tapping it reveals a full-width panel below the header with all the navigation links stacked vertically in larger text.

### 118. Environment Banner
A thin fixed bar at the very top of the page (above the header) that only appears on non-production environments. Amber-yellow for staging, purple for dev. Contains tiny white bold uppercase text identifying the environment. You can't click through it.

---

## Indicators & Status

### 119. Order Number Box
A dark-colored rectangle (using the darkest text color as background) with white text inside. Contains: a tiny "Order Number" label in uppercase at the top, and the order number below it in large, bold, monospace font with extra letter spacing. Used on order cards and the order detail page to make the number prominent and easy to read.

### 120. Order Timeline
A vertical list of steps showing an order's journey. Each step has a circle on the left and a label on the right:
- **Completed steps** — solid green circle with a white checkmark, dark bold label
- **Current step** — same colored circle with an extra ring around it, bold label
- **Awaiting action** — amber circle with a white exclamation mark, amber bold label with a prompt below
- **Future steps** — gray circle (empty), light gray label
When an order is cancelled, the timeline is replaced by a red-tinted box with a message.

### 121. Pickup Timeline Pills
A horizontal row of small pills on the subscription detail and list pages. Each pill represents one pickup week and shows: the week number, the date, and a status indicator. Colors vary by status:
- **Scheduled** — light gray background, dark text
- **Ready** — warm amber background, dark amber text with "READY" label
- **Picked Up** — light green background, green text with ✓
- **Missed** — light red background, red text with ✗
- **Skipped** — light red background, red text with "SKIPPED"
Today's pill has a thicker brand-color border. Extension weeks have a light brand-color background.

### 122. Progress Bar
A thin horizontal bar showing subscription completion. Gray track with a teal/green fill that grows from left to right. The fill width represents "N of M weeks completed." The corners are fully rounded. Used on Market Box Order Cards.

### 123. Cutoff Badge
A tiny pill that appears next to a product price on listing cards:
- **Closed** — red-tinted background, dark red text
- **Closes Xh** — amber-tinted background, dark amber text
- **Open** — nothing shown (element is hidden)

### 124. Star Rating Display
Five star characters (★) in a row — a display-only version (not clickable). Filled stars are golden/amber, empty stars are light gray. Accompanied by a rating count in parentheses in muted text. Used on vendor cards.

### 125. Loading Spinner
A circle outline (about 40px) with most of the border in gray and one quarter of the border in the brand color. Rotates continuously. Appears centered on the page with a brief loading message below it (like "Loading checkout…" or "Processing your order…"). Each page implements its own spinner — there's no single shared spinner component.

### 126. Success Check Circle
A large circle (about 80px) with a light brand-color fill, containing a big checkmark character in the brand color. Used as a celebratory icon on confirmation pages — checkout success, subscription success, password reset success.

### 127. Colored Market Dot
A tiny solid circle (about 8px) that identifies a market's type by color:
- **Blue** — traditional/regular market
- **Amber** — event
- **Purple** — private pickup location
Used next to market names in pickup date selectors and order items.

---

## Overlays & Panels

### 128. Cart Drawer
A panel that slides in from the right edge of the screen, covering about 420px of width. A dark semi-transparent overlay covers the rest of the screen behind it. The panel is full-height (top to bottom) with a white background and a shadow on its left edge. Contains: a header with "Shopping Cart" and a close button, a scrollable list of Cart Item Cards, and a footer with the total and checkout button. When the cart is empty, shows a large faded 🛒 emoji and "Your cart is empty" text.

### 129. Confirm Dialog
A modal box that appears centered on the screen over a dark semi-transparent overlay. About 420px wide, white, with rounded corners and a strong shadow. Contains: a bold title, a message in smaller text, and two buttons at the bottom right (Cancel in muted style, Confirm in brand color or red depending on the action). Some confirm dialogs also include a text input field for providing a reason. Replaces the browser's built-in confirm/prompt popups.

### 130. Rating Modal
A modal similar to the Confirm Dialog but specifically for rating an order. Contains: a Star Rating Picker, a text area for optional comments, and Cancel/Submit buttons. After submitting a 4+ star rating, the content changes to a "Thanks!" message with a Google review button.

### 131. Feedback Form Panel
A tall panel (up to 90% of screen height) that appears centered over a dark overlay. About 600px wide, white, scrollable. Has a sticky header with a title and close button. Contains category selection cards, text inputs, text areas, and submit/cancel buttons. Used for the shopper feedback form.

### 132. Cancel Membership Modal
A centered modal over a dark overlay. Contains a warning in a red-tinted box listing what the user will lose, an explanation paragraph, and two buttons: "Keep Premium" (gray) and "Cancel Membership" (red).

---

## Banners & Notices

### 133. Warning Banner (Amber)
A full-width box with a warm amber/yellow background, thin amber border, and dark amber text. Used for important notices that aren't errors — like "Your order is awaiting confirmation" or payment instructions for external orders.

### 134. Error Banner (Red)
A full-width box with a light red background, thin red border, and dark red text. Used to show error messages — form validation failures, API errors, or "something went wrong" messages. May include a "Copy Error Report" button in amber and an error code chip in monospace.

### 135. Success Banner (Green)
A full-width box with a light brand-color (green FM) or light green background and dark brand-color text. Shows brief success confirmations like "Settings saved" or "Password updated." Often appears temporarily and may auto-dismiss.

### 136. Info Banner (Blue)
A full-width box with a light blue background, thin blue border, and dark blue text. Used for informational notices that aren't warnings or errors — like "Market Box subscriptions ship separately" or location prompts.

### 137. Nudge Banner (Promotional)
A card-sized banner on the dashboard with a brand-colored border (thicker than usual — 2px) and sometimes a gradient background. Contains an emoji, a bold headline, and a brief description encouraging the user to take an action (like adding their phone number for SMS updates or upgrading their tier). The whole banner is clickable.

### 138. Pickup Hero Banner
A special full-width banner that replaces the normal order detail header when an order is ready for pickup or awaiting acknowledgment. Has a dramatic gradient background (dark brand color transitioning to lighter brand color). All text is white. Contains: the status badge, order number in huge monospace text, market name, vendor name, and item count. Designed to be easy to show to the vendor at the pickup window.

### 139. Multi-Pickup Acknowledgment Box
An amber-bordered box on the checkout page that appears when your order requires visits to multiple pickup locations. Contains a warning icon, "Multiple Pickup Locations" in bold, a list of locations with Colored Market Dots, and a checkbox you must check before you can complete checkout ("I understand I'll visit multiple locations").

### 140. Security Messaging Box
A small box with a light brand-color background and thin brand-color border. Contains a 🔒 icon, "Your payment is secure" in bold small text, and a brief mention of Stripe processing. Appears below the checkout button.

---

## Lists & Grids

### 141. Product Grid
A responsive grid that automatically adjusts columns based on available width. Each cell is at least 280px wide. Contains Listing Cards or Market Box Cards. The grid fills the main content area of browse pages.

### 142. Vendor Grid
Same responsive auto-fill grid as the Product Grid but containing Vendor Cards. Used on the vendors list page.

### 143. Market Grid
Same responsive auto-fill grid containing Market Cards. Used on the markets list page.

### 144. Cross-Sell Grid
A smaller responsive grid (cells at least 180px) at the bottom of the checkout page. Contains Cross-Sell Cards showing other products the buyer might want. Has a ✨ header "Other items you may enjoy…"

### 145. Category Tag Row
A horizontal row of small pills inside a vendor card or market vendor list. Each pill has a light brand-color background and brand-colored text showing a category name. If there are too many to fit, the extras are replaced by a "+X more" pill in muted styling.

### 146. Vendor List (Market Detail)
A vertical list of vendor rows inside a market's detail page. Each row shows: a circular avatar (with image or initial letter), the vendor's name as a link, and category tag pills on the right. Hovering highlights the row. A dropdown filter at the top lets you narrow by category.

### 147. FAQ Accordion
A vertical stack of collapsible question-answer pairs. Each pair is a white card with a thin border. The question is a clickable header that toggles the answer visible/hidden. When closed, a small ▼ indicator sits on the right. When open, the answer appears below with a thin top border separating it from the question. Used on the Help & FAQ page.

---

## Decorative & Layout

### 148. Section Divider Line
A thin horizontal line (1px) in a muted border color. Used to separate sections on a page — between form groups, between the cart items and footer, between pricing details and total.

### 149. Colored Accent Bar
A short, thick horizontal bar (about 40px wide, 4px tall) in the brand color. Sits above a section heading to add visual emphasis. Rounded ends. Used on the "How It Works" page as a heading accent.

### 150. Gradient Hero Section
A full-width section with a diagonal gradient background transitioning from a darker shade of the brand color to the regular brand color. All text inside is white. Used as the page hero on the "How It Works" page and the "Features" page's Get Started section.

### 151. Step Number Circle
A small circle (about 28px) filled with the brand color, containing a white number. Used in ordered step lists to number each step, similar to the Step Number Badge from the landing page but used inline within text lists instead of overlaid on icons.

### 152. Empty State
A centered layout that appears when a list or page has no content to show. Contains a large faded emoji (about 48–60px at low opacity), a heading like "No orders yet," and optionally a brief message and a button linking somewhere useful. The surrounding container often has a dashed border instead of the usual solid border.

### 153. Dashed Border Container
A card outline with a dashed border instead of a solid one. Light background or no fill. Used specifically for empty states and "pitch" cards (like the vendor signup pitch on the dashboard) to create a softer, less-committed visual feel compared to solid-bordered cards.

---

# PART B: Page Location Map

Pages are organized by user flow, from browsing to purchasing to managing orders.

---

## 1. Browse / Shop Page

The main product browsing page. Has a tab toggle at the top to switch between regular products and Market Boxes.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Fixed at the top of the page. |
| Page Title (H1) | Top-left, below header. Says "Browse" or vertical-specific term. |
| BrowseToggle (segmented control) | Below the title. Two side-by-side tab buttons — "Products & Bundles" and "Market Boxes." Selected tab is filled with brand color. Container has a brand-color border. |
| Search Input | Inside a white filter card below the toggle. Full-width on mobile. |
| Search button (solid primary) | Right of the search input. |
| Category dropdown (Filter Dropdown) | Inside the filter card, to the right of search. |
| ZIP code input (small) | Inside the filter card, after a "Near:" label. About 100px wide. |
| "Go" button (small solid primary) | Appears after you enter a 5-digit ZIP. |
| Checkbox (Standard) | "Hide allergen items" — inside the filter card. |
| "Clear Filters" Ghost Button | Inside the filter card, only visible when filters are active. |
| ZIP Active Badge (Capsule Badge) | Below the filter card when a ZIP is active. Shows 📍 + location name + ✕. |
| Market Box Info Card (Info Banner, Blue) | Below the toggle when in Market Boxes view. Light brand-color background explaining what Market Boxes are. |
| Premium Window Info Box | Below the toggle when relevant. Muted background box with an "Upgrade to Premium →" link. |
| Listing Cards (Product Grid) | Main content area. Responsive grid of product cards. Each card has: image/placeholder, Category Badge, optional Allergen Badge, title, description, Price Text, optional Cutoff Badge, location, vendor name + Tier Badge. |
| Market Box Cards (Product Grid) | Same grid area when the Market Box tab is selected. Cards have subscription badges, Availability Badges, Box Type Badges. |
| Empty State | Centered when no results match. Dashed border container with message and optional "Clear Filters" button. |

---

## 2. Listing Detail Page

Shows full details for a single product.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top of page. |
| Back Link | Just below header, left side. "← Back to Browse." |
| Share button | Right side, same row as back link. |
| Page Title (H1) | Left column (or top on mobile). Product name. |
| Price Text (Large) | Below the title. Brand-colored price. |
| Stock status text | Next to or below price. "In Stock" or "Qty: X" in muted text, or "Sold Out" in red. |
| Image gallery — main image | Left column. Square aspect ratio, max 400px tall. Rounded corners. |
| Image gallery — thumbnail strip | Below the main image (if multiple images). Horizontal row of small square thumbnails. Selected one has a brand-color border. |
| Description Card | Right column. White card with "Description" heading, body text, and optional Allergen Warning box (amber border, ⚠️ icon). |
| Pickup Options Card | Right column, below description. Shows grouped pickup locations with Colored Market Dots, selectable Pickup Date Buttons or Time Slot Buttons, and the Add-to-Cart controls. |
| Quantity Stepper | Inside the pickup card. Controls how many to add. |
| Solid Primary Button (Full-Width) — "Add to Cart" | Inside the pickup card, below the quantity stepper. Shows 🛒 icon. |
| "In your cart" notice (Info Banner) | Below the add-to-cart button when items from this listing are already in your cart. Light brand-color background listing what's there. |
| Premium Restricted notice | Replaces the add-to-cart section for non-premium buyers during early access windows. Blue-tinted card with "Upgrade to Premium" button. |
| Vendor Card | Right column, below pickup section. Shows vendor name as a link, "Member since" date, and an Outlined Primary Button ("View Vendor Profile"). |
| "More from Vendor" list | Below vendor card. A list of other products from the same vendor, each showing title and price on a muted background row. |

---

## 3. Market Box Detail Page

Shows full details for a Market Box subscription offering.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top of page. |
| Back Link | Below header. "← Back to Market Boxes." |
| Share button | Right side, same row. |
| Hero image | Full-width, 300px tall. Rounded corners. Emoji placeholder if no image. |
| Box Type Badge | Below image. Warm yellow pill. |
| "Prepaid Weekly Subscription" badge | Next to Box Type Badge. Light blue background, dark blue text. |
| Availability Badge | Next to other badges. Shows "Currently Full" (red) or "X spots left" (brand color). |
| Page Title (H1) | Below badges. In brand color. |
| Vendor link | Below title. "by [name] →" in brand color. |
| Subscription Term Cards (selectable) | When multiple terms exist. Selectable cards showing term length, price, per-week breakdown, and optional Save Badge. |
| Price Text (Large) | When single term. Large brand-colored price with per-week note below. |
| Description Card | White card with "Description" heading and body text. |
| "How It Works" Card | White card explaining the subscription mechanics. Bullet list + an info box in light brand color about weather/skip policy. |
| Pickup Details Card | Side-by-side with vendor card on desktop. Shows 📅 day, 🕐 time, 📍 market name and clickable address. |
| Vendor Info card | Avatar (circle with image or emoji), vendor name link, description, and a solid primary "View Vendor Profile" button. |
| Warning Banner (Amber) | Above the add-to-cart button when there's a block reason. |
| Solid Primary Button (Full-Width) — "Add to Cart" | Bottom of the page. Shows price in the label. |
| Muted Helper Text | Below the button. "X-week subscription · Full amount charged at checkout." |

---

## 4. Markets List Page

Shows all markets/locations with search, filters, and optional location-based sorting.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Page Title (H1) | Top-left, brand color. |
| Filter panel card | Below title. White card with: Search Input, search button (Outlined Primary), State dropdown, City dropdown, Location Type dropdown, and conditional "Clear Filters" button. |
| Location search bar | Below filter panel. Lets you enter a ZIP or use GPS, shows radius selector when active. |
| Location Prompt Card (Info Banner, Blue) | When no location is set. Light blue card with 📍 icon asking to enter a ZIP. |
| Upcoming Events section heading | Below location bar (when events exist). Brand-color H2 with 🎪 emoji. |
| Event Cards (Market Grid) | Grid of Event Cards with amber borders and Event Badges. |
| Results count text | Above the main grid. Muted text showing "X markets found within Y miles." |
| Loading Spinner (small inline) | Next to results count while loading. Tiny spinning circle. |
| Market Cards (Market Grid) | Main grid of market cards. Each has: name, description, address with pin icon + Distance Badge, schedule, season dates, vendor count, optional "Inactive" badge. |
| Empty State | When no markets match. Centered message. |
| "Load More" button | Bottom of grid if there are more results. Blue solid button (not brand-colored). Shows a spinner + "Loading..." while loading more. |

---

## 5. Market Detail Page

Shows full details for a specific market.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Back Link | Below header. "← Back to Markets" with an SVG arrow icon. |
| Market Header Card | White card containing: market emoji icon, optional Event Badge, H1 market name in brand color, optional "Applied" badge (for vendor users). |
| Body text (description) | Below header card. |
| Event Dates Box (amber) | For events only. Amber background box with 📅 dates and optional event website link. |
| Address row | Clickable address text with a small pin SVG icon. Opens in maps. |
| Meta row | Vendor count (👥 emoji) and next market date (📅 emoji) in muted text. |
| Schedule section | Schedule grid showing market hours by day. |
| Season section | 🗓️ emoji with date range. |
| Contact row | Email and phone as links with SVG icons. |
| Legal Disclaimer Box | Gray-background box with muted centered text. |
| Vendor section heading | Brand-color H2 — "Vendors at [Market Name]." |
| Category Filter Dropdown | Above vendor list. "Filter by Category" with option counts. |
| Vendor List (Market Detail) | Vertical list of vendor rows with avatars, names, and Category Tag Row pills. |
| Empty state text | When no vendors are at the market. |

---

## 6. Vendors List Page

Shows all vendors with search, filters, and location-based sorting.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Page Title (H1) | Brand color. |
| Filter panel card | White card with: Search Input, search button (Outlined Primary), Market dropdown, Category dropdown, Sort dropdown, and conditional "Clear Filters" button. |
| Location search bar | Below filter panel. |
| Location Prompt Card (Info Banner, Blue) | When no location set. |
| Favorites Filter Toggle | A pill-shaped toggle button showing heart emoji and count. Red-tinted when active, neutral when inactive. Only visible if logged in with favorites. |
| Results count text | Below filters. Shows count and location context. |
| Vendor Cards (Vendor Grid) | Responsive grid. Each card has: Vendor Avatar (with tier border), name, Star Rating Display, optional Favorite Heart Button, description, Category Tag Row, market names with Distance Badges, listing count + Tier Badge footer. |
| Empty State (Dashed Border Container) | When no vendors match. Large faded emoji, heading, message. Different message when filtering favorites vs. general search. |
| "Load More" button | Bottom. Blue solid button. |

---

## 7. Cart Drawer

Slides in from the right edge when you open the cart.

| Element | Location on Page |
|---------|-----------------|
| Dark overlay | Covers the entire screen behind the drawer. |
| Close Button (Panel) | Top-right of the drawer header. |
| "Shopping Cart" heading | Top of drawer. |
| Item count subtitle | Below heading. |
| Warning Banners | Below header when there are schedule issues (red) or mixed cart types (blue). |
| Cart Item Cards | Scrollable list. Each with: title, vendor, price, Quantity Stepper, pickup info chip, line total, remove (🗑️) button. |
| Uppercase Section Label | "MARKET BOX SUBSCRIPTIONS" divider when mixing types. |
| Market Box Cart Item Cards | Below the divider. Blue-gray background variant. |
| Empty State | When cart is empty. Faded 🛒 emoji + message. |
| Section Divider Line | Between items area and footer. |
| Total row | Footer area. "Total" label + large bold price. |
| Solid Primary Button (dark variant) — "Proceed to Checkout" | Footer. Dark fill instead of brand color. |
| Ghost Button — "Continue Shopping" | Below checkout button. |

---

## 8. Checkout Page

Full checkout flow with items on the left and summary on the right (single column on mobile).

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Back Link | "← Back to Shopping." |
| Page Title (H1) | "Checkout." |
| Error Banner (Red) / Error Display | Top of left column when there are errors. May include "Retry" button and error code chip. |
| Validation failed banner | Red-bordered box when server validation returns errors. |
| Market warning banner | Amber-bordered box when there are market compatibility issues. |
| Market box notice (Info Banner, Blue) | Informational note when cart has mixed types. |
| Section Heading — "Order Items" | Left column. |
| Checkout Item Cards | Stacked vertically. Each with: title, vendor, pickup chip (with market-type emoji), Checkout Stepper, price, "Remove" danger button. |
| Uppercase Section Label | "MARKET BOX SUBSCRIPTIONS" divider. |
| Checkout Market Box Items | Blue-gray cards with 📦 icon, schedule chip. |
| Cross-Sell section | Below items. ✨ header + Cross-Sell Grid of Cross-Sell Cards. |
| Order Summary Card (Sticky) | Right column (or top on mobile). Sticky positioning. Contains: subtotal, fees, tip line, total, Tip Selector (FT only), Payment Method Selector, notices, checkout button, Security Messaging Box. |
| Tip Preset Buttons | Inside order summary (food trucks only). |
| Radio Card Selector (payment methods) | Inside order summary when multiple payment options available. |
| Multi-Pickup Acknowledgment Box | Below payment selector when multiple pickup locations. Amber border with checkbox. |
| Solid Primary Button (Full-Width) — checkout action | At the bottom of the summary card. Dynamic label based on state. |
| Security Messaging Box | Below checkout button. 🔒 icon. |
| Loading Spinner | Full-page centered when checkout is initializing. |
| Empty State | When cart is empty. Large faded 🛒 + "Your cart is empty" + browse CTA. |

---

## 9. Checkout Success Page

Confirmation page after a successful purchase.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Success Check Circle | Centered at top of the success card. Large circle with checkmark. |
| Page Title (H1) | "Order Placed!" below the check circle. |
| Subtitle text | "Thank you for your purchase…" |
| Order details card | White card with metadata grid: Order Number, Date, Status (with Order Status Badge), Total (in brand color), optional tip line. |
| Items list | Below details. Each item on a muted background row: title, quantity, vendor, pickup chip with Colored Market Dot + date/time/market. |
| Market Box subscriptions section | If applicable. Muted rows with brand-color left border accent. Shows offering, vendor, term, price, and pickup schedule chip. |
| Food truck expectation card (Warning Banner, Amber) | FT only. Amber card explaining the 30-min confirmation expectation. |
| Pickup locations summary card | Single location: normal card. Multiple locations: amber-bordered card with Colored Market Dots and map links. |
| "What's Next?" card | Bulleted list of next steps. |
| Outlined Primary Button — "View My Orders" | Bottom, centered. |
| Outlined Primary Button — "Continue Shopping" | Next to "View My Orders." |

---

## 10. External Payment Page

Shown after placing an order with a non-Stripe payment method (cash, Venmo, etc.).

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Large emoji | 💵 (cash) or 📱 (other) at the top, large size. |
| Page Title (H1) | "Order Placed!" or "Complete Your Payment" in brand color. |
| Subtitle | "Order #XXXXXX." |
| Order Summary card | White card with line items, optional small-order fee, total in brand color, "Paying to: VendorName" chip. |
| Payment Instructions card | Light brand-color background card. Explains how to pay. For non-cash methods, includes a large action button linking to the payment service. |
| Refund policy notice | Muted background card with bold "Refund policy" label. |
| "What's next?" notice | Muted background card with instructions. |
| Solid Primary Button — "My Orders" | Bottom action row. |
| Outlined Primary Button — "Continue Shopping" | Next to "My Orders." |
| Muted Helper Text | Help text at the bottom. |

---

## 11. Buyer Orders List

Shows all of the buyer's orders grouped by status.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Back Link | "← Back to Dashboard." |
| Page Title (H1) | "My Orders." |
| Subtitle text | "View and track your purchases." |
| Filter Dropdowns (x2) | Status filter and Market filter, side by side. |
| Section headers | Colored badge + count for each status group: "Ready for Pickup," "In Progress," "Cancelled," "Completed." Each has a colored underline bar. |
| Order Cards | Grouped under section headers. Each with: status-colored header area, price, date, Payment Method Badge (if non-Stripe), Order Number Box, item rows with Item Status Badges, and status-specific bottom banners. |
| Market Box Order Cards | In the same list, with teal coloring, progress bar, and "Week N of M" badge. |
| Status Banners (on cards) | Bottom of active order cards. "Ready for Pickup" (brand color), "Acknowledge Your Pickup" (amber), "Confirmed" (brand color), "External payment pending" (amber). |
| Empty State (Dashed Border Container) | When no orders exist. Faded 📦 emoji + heading + optional browse button. |
| Loading Spinner | Full-page centered while loading. |

---

## 12. Buyer Order Detail

Shows full details for a single order. Layout changes dramatically based on order status.

**When status is "Ready" or "Awaiting Acknowledgment":**

| Element | Location on Page |
|---------|-----------------|
| Pickup Hero Banner | Full-width gradient section with white text. Order number in huge monospace, market name, vendor name, Payment Method Badge. |
| Solid Primary Button (Full-Width, large) — "Confirm Receipt" | Below the hero. Extra tall (56px min). In a light brand-color strip. |
| Muted Helper Text | Below button. Instructions about confirming after receiving items. |
| Problem reporting section | Expandable amber section with per-item checkboxes and description inputs. |

**Standard view (all other statuses):**

| Element | Location on Page |
|---------|-----------------|
| Back Link | "← Back to My Orders." |
| Status Info Banner | Colored banner matching the order status (amber/blue/green/red/purple). |
| Order Number Box | Large dark box with monospace order number. |
| Status Summary Card | Colored card with emoji, title, message, timestamp. |
| Order Timeline | Vertical step indicator showing the order's journey. |
| Pickup Details Card | Gray card with market name, address link, date/time in blue, contact info. |
| Items by market sections | Grouped by market. Each item shows: title, vendor, quantity × price calculation, Item Status Badge, optional cancel button (red), cancellation info if applicable, issue-reported badge if applicable. |
| Order totals | Service fee, tip (if any), and total in large bold text. |
| Error State | When order not found. Error display + "Back to Orders" button. |

---

## 13. Buyer Subscriptions List

Shows all Market Box subscriptions.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Back Link | "← Back to Orders." |
| Page Title (H1) | "My Subscriptions" in brand color. |
| Upcoming pickup banner (Info Banner, Blue) | When next pickup is soon. Shows date, time, optional "Ready for Pickup!" amber badge, address link. |
| Browse CTA button | Small brand-color button to browse more boxes. |
| Subscription cards | White cards. Each with: offering name, Subscription Status Badge (green/indigo/red), vendor, price, week count, pickup info text, Pickup Timeline Pills row, and "View Details →" link. |
| Empty State | When no subscriptions. 📦 emoji + "No Subscriptions Yet" + browse button. |

---

## 14. Subscription Detail Page

Shows full details for one Market Box subscription.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Back Link | "← Back to Subscriptions." |
| Page Title (H1) | Offering name in brand color. |
| Subscription Status Badge | Inline next to title. |
| Vendor link text | "by [name]" below title. |
| Price Text (Large) | Brand-color price. |
| Progress text | "N of M weeks completed." |
| Next Pickup banner | Amber (ready) or blue (scheduled). Shows date in large text, time, "Week N of M" box. |
| Pickup Details Card | Market name, address link, schedule. |
| Confirmation message banner | Dynamic color based on state — brand color (both parties), amber (waiting), red (error). |
| Pickup Schedule section | Card with per-week rows. Each row colored by status with week number, date, status pill, optional "TODAY" badge, optional "Extension" badge, optional "Confirm Pickup" button. |
| Confirm Pickup button (small solid primary) | Inside a schedule row when a pickup is ready. |
| Vendor waiting prompt (amber solid) | Replaces confirm button when vendor confirmed first — urgent styling. |
| Subscription Details card | Key-value grid: Started date, Total Paid, Per Week price. |

---

## 15. Buyer Dashboard

The buyer's home page after logging in.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Page Title (H1) | "Dashboard" with logo image beside it. |
| Welcome text | "Welcome back, [name]" + optional Premium Badge (inline). |
| Ready for Pickup Alert Block | When orders are ready. Brand-color bordered section with order cards inside showing: order number (monospace), item count, vendor, market + emoji, date/time. |
| SMS Opt-In Nudge Banner | When phone number not set. 📱 emoji + clickable card encouraging phone setup. |
| Shopper section heading | 🛒 emoji + "Shopper." |
| Dashboard Cards (2-column grid) | "Browse Products," "My Orders" (with optional Action Needed Badge and orange glow), "My Favorites ❤️," notifications card, feedback card. |
| Premium Upgrade Card | For free buyers. Gradient background, ⭐ icon, benefits list, pricing with "Save 32%" badge, "Upgrade Now →" outlined button. |
| Vendor Pitch Card (Dashed Border) | For non-vendors. Dashed border, feature checklist, vendor signup CTA. |
| Vendor section heading | Emoji + "Vendor" in accent color (for approved vendors). |
| Vendor Dashboard Cards | For vendors. "Vendor Dashboard" card with brand-color border, "Help & FAQ" card, optional Vendor Upgrade card (amber gradient). |
| Admin section | For admins. Purple-tinted card linking to admin panel. |
| Section Divider Lines | Between major sections. |

---

## 16. Settings Page

Account settings and preferences.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Back Link | "← Back to Dashboard." |
| Page Title (H1) | "Settings" in brand color. |
| Account Details card | Standard Text Inputs for Display Name, Email (disabled/grayed), Phone (with optional "Clear" button). SMS consent Checkbox with legal text. "Save Changes" solid primary button. Success/error banners. |
| Member info block | "Member Since" and "Account ID" (monospace) below the form. |
| Membership card | For free tier: blue gradient card with "Upgrade Now" button. For premium: brand-color card with "Cancel Membership" outlined button (opens Cancel Membership Modal). |
| Vendor Account section | Vendor ID (monospace), status badge, Tier Badge (vertical-specific colors). |
| Change Password card | Three password inputs + "Change Password" solid primary button. |
| Notification Preferences card | Three sections (Email, Push, SMS) with Toggle Switches. SMS section may show an info chip about adding a phone number. "Save Preferences" button. |
| Delete Account card (red border) | Body text + "Delete My Account" outlined danger button. Confirmation view: red-tinted box with bullet list, email input, "Cancel" and "Permanently Delete Account" buttons. |

---

## 17. Login Page

| Element | Location on Page |
|---------|-----------------|
| Simple Nav Bar | Minimal header with brand name (left) and "Home" link (right). |
| Brand heading (H1) | Large, centered above the card. |
| Tagline | Below brand heading. |
| Auth Form Card | Centered narrow card with brand-color border. |
| Standard Text Input — Email | Inside card. |
| Standard Text Input — Password | Inside card, with Password Visibility Toggle inside it. |
| Solid Primary Button (Full-Width) — "Login" | Inside card. |
| "Forgot your password?" link | Below button, muted, small. |
| "Don't have an account? Sign up" link | Below card. |
| Error Banner (Red) | Inside card, above inputs, when login fails. |

---

## 18. Signup Page

| Element | Location on Page |
|---------|-----------------|
| Simple Nav Bar | Same as login. |
| Auth Form Card | Same narrow card with brand-color border. Four inputs: Full Name, Email, Password (with toggle), Confirm Password (with toggle). |
| Solid Primary Button (Full-Width) — "Sign Up" | Inside card. |
| "Already have an account? Login" link | Below card. |
| Success state | Card border changes to accent color. "Account Created!" heading. Auto-redirects. |

---

## 19. Forgot Password Page

| Element | Location on Page |
|---------|-----------------|
| Simple Nav Bar | Same as login. |
| Auth Form Card | Narrow card. Single email input. |
| Instructional paragraph | Above the input explaining what will happen. |
| Solid Primary Button (Full-Width) — "Send Reset Link" | Inside card. |
| "Back to Login" link | Below button. |
| Success state | Card border changes to accent color. "Check Your Email" heading. "Back to Login" Outlined Primary Button. |

---

## 20. Reset Password Page

| Element | Location on Page |
|---------|-----------------|
| Simple Nav Bar | Same as login. |
| Auth Form Card | Narrow card. Two password inputs (New, Confirm). |
| Solid Primary Button (Full-Width) — "Update Password" | Inside card. |
| "Back to Login" link | Below button. |
| Error Banner (Red) | Shows if the reset link is expired/invalid. May include inline "Request a new reset link" link. |
| Success state | Card border changes to accent color. "Password Reset Successful!" heading. Auto-redirects. |

---

## 21. Buyer Upgrade Page

Where free-tier buyers can upgrade to Premium.

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Back Link | "← Back to Dashboard." |
| ⭐ icon + Page Title (H1) | "Upgrade to Premium" with star icon. |
| Benefits Card | White card with: featured Market Box benefit (gradient inner card with 📦 icon and "EXCLUSIVE" tag), 4 secondary benefit tiles (each with icon in a colored square + title + description). |
| Pricing Cards (selectable) | Two cards side by side: Monthly and Annual. Selected card has blue border and shadow. "SELECTED" Chip on active card. Annual card has a "SAVE 32%" badge floating at the top. Price in large text with period suffix. |
| Solid Primary Button (Full-Width) — "Become a Premium Member" | Below pricing cards. Dynamic label with price. |
| Error Display | Below button if Stripe errors occur. |
| FAQ section | White card with Q&A pairs (no accordion — all visible). |
| Already Premium state | Success Check Circle + "You're Already Premium!" heading + "Start Shopping" button. |

---

## 22. Subscription Success Page

Shown after completing a buyer tier upgrade or vendor subscription.

| Element | Location on Page |
|---------|-----------------|
| Loading Spinner | While confirming with Stripe. |
| Success Check Circle | Centered. Large circle with checkmark. |
| Page Title (H1) | Dynamic: "Welcome to Premium!" or tier-specific welcome. |
| Subtitle text | Description of what was activated. |
| Benefits block | Light brand-color background card. Uppercase "Your Benefits" heading. Bullet list of included features. |
| Solid Primary Button — "Go to Dashboard" or "Start Shopping" | Below benefits. Blue fill. |
| Settings link | Small text below button. |

---

## 23. Help & FAQ Page

| Element | Location on Page |
|---------|-----------------|
| Header Nav Bar | Top. |
| Back Link | "← Back to Dashboard." |
| Page Title (H1) | "Help & FAQ." |
| Category section headings (H2) | Each category name with a blue underline. |
| FAQ Accordion | Stacked collapsible question/answer cards under each category. |
| Empty State | When no articles exist. Dashed border box with "Check back soon" message. |

---

## 24. How It Works Page

| Element | Location on Page |
|---------|-----------------|
| Gradient Hero Section | Full-width gradient with logo, "How It Works" H1, and subtitle — all white text. |
| Chip Nav Buttons | Below hero. 4 anchor-link pills for quick navigation. |
| Section headings with Colored Accent Bar | Throughout the page. Short colored bar above each H2. |
| Step Lists with Step Number Circles | Numbered step-by-step instructions. Circles with white numbers, text to the right. |
| Info Cards (Left Border) | Green, amber, or blue left border cards for callouts and tips. |
| Two-column pickup guide cards | Side-by-side cards with brand-color top borders — one for Buyers, one for Vendors. |
| Outlined Primary Button — "Browse" CTA | Bottom of page. |
| Footer | Standard footer. |

---

## 25. Features Page

| Element | Location on Page |
|---------|-----------------|
| Sticky Nav Bar | Stays at the top as you scroll. Brand name, "Browse" link, "Get Started" outlined button. |
| Hero Section | Subtle gradient tint. Large H1 "Simple. Local. Connected." + subtitle. |
| Promise Cards (4) | White cards in a grid. Large emoji + title + description each. |
| Shopper section | Muted background. 🛒 heading + 6 feature cards, each with icon in a tinted circle + title + body. "Start Shopping" outlined button. |
| Vendor section | White background. 8 feature cards with emoji icons. "Start Selling" accent-colored solid button. |
| Get Started Section (Gradient) | Brand-color background, white text. 3 numbered steps + two buttons: "Shop Now" (white fill) and "Start Selling" (white outline). |
| Footer | Standard footer. |

---

## 26. Vendor Signup Page

Accessible to any logged-in buyer who wants to become a vendor.

| Element | Location on Page |
|---------|-----------------|
| Simple Nav Bar | Brand name + "Home" + "Dashboard" links. |
| Referral Banner | Conditional. Gradient card with 🎉 icon, "You were invited by [name]!" |
| Auth Form Card — Business Information | Multiple sections of inputs: text, email, phone, date, textarea, dropdown selects, multi-select checkbox grid, file upload. |
| Multi-select checkbox grid | Grid of checkboxes with brand-colored fills when checked. |
| Acknowledgment Cards (×5) | Selectable cards with checkboxes. Brand-color fill when checked, muted when not. |
| Validation Error Banner (Red) | Above submit when validation fails. |
| Outlined Primary Button (Full-Width) — "Submit" | Bottom of form. Fades when not all acknowledgments are checked. |
| Success state | Green-tinted card with "Submitted Successfully!" and dashboard link. |
| Market Limit Reached state | Info card explaining the limit + back button. |
| Not Logged In state | Card with "Login" and "Create Account" buttons side by side. |

---

## 27. Terms of Service / Privacy Policy Page

| Element | Location on Page |
|---------|-----------------|
| Simple Header | "815 Enterprises" brand link. |
| Page Title (H1) | "Terms of Service." |
| "Last updated" text | Italic, muted, below title. |
| Section headings (H2, H3) | Bold headings for each legal section. H2s have scroll-anchor IDs. |
| Body paragraphs | Standard reading text with relaxed line spacing. |
| Inline links | Brand-colored text links to other pages. |
| Privacy section | Embedded below Terms, separated by a thick divider. Anchored at #privacy-policy. |
| Footer | Standard footer. |

---

## 28. About Page

| Element | Location on Page |
|---------|-----------------|
| Simple Header | "815 Enterprises" brand link. |
| Page Title (H1) | "About Us." |
| Section headings (H2) | "Our Mission," "What We Do," "For Vendors," "Contact Us" — with anchor IDs. |
| Body paragraphs and bullet lists | Standard reading text. |
| Contact section box | Muted background card with email link in brand color. |
| Footer | Standard footer. |

---

# PART C: Vertical Differences (Beyond Color Swaps)

Most elements look the same between verticals but with different colors. Here are the specific differences beyond just swapping green↔red:

| Element | Farmers Market (FM) | Food Trucks (FT) |
|---------|-------------------|-------------------|
| Browse toggle labels | "Products & Bundles" / "Market Boxes" | "Menu Items & Bundles" / "Chef Boxes" |
| Listing card placeholder emoji | 🌿 | 🍽️ |
| Tier Badges | Standard / Premium / Featured | Basic / Pro / Boss |
| Tip Selector | Hidden | Visible on checkout |
| Pickup date selection | Date buttons grouped by market | Location picker → time slot grid |
| Box Type Badge values | Same 5 types | Same 5 types (labeled "Chef Box") |
| Default cutoff hours | 18 hours | 0 hours |
| Location type filter | "Markets" | "Food Truck Parks" |
| Page surface warmth | Warm cream/ivory backgrounds | Clean white/neutral backgrounds |
| Text color warmth | Olive green tones | Charcoal/neutral tones |
| Footer background | Deep olive | Near-black |
| Feature page CTA colors | Green primary | Red primary, accent-gold secondary |
| Dashboard card emoji icons | 🌿-themed | 🍽️-themed |

---

# PART D: Notable Inconsistencies

These are visual inconsistencies discovered during the audit that may be intentional or may warrant standardization:

1. **"View Vendor Profile" button** — Outlined on listing detail page, solid-filled on Market Box detail page. Same destination, two styles.

2. **"Clear Filters" button** — Three different treatments: solid gray (browse), muted fill (markets), outlined gray (vendors).

3. **"Load More" button** — Uses hardcoded blue (`#3b82f6`) that's neither the FM nor FT brand color.

4. **Card border radius** — Product cards use 8px (`radius.md`), market/vendor cards use 12px (`radius.lg`).

5. **Cart drawer styling** — Uses hardcoded hex colors (`#333`, `#666`, `#ddd`) instead of design tokens. Predates the token system.

6. **Subscriptions pages** — Use `branding.colors.primary` (hardcoded JS values) instead of CSS custom properties. Doesn't theme via CSS vars.

7. **Buyer upgrade page** — Uses hardcoded blue (`#2563eb`) for buttons instead of the brand color. Premium upgrade has a blue identity separate from both FM green and FT red.

8. **Auth page error banners** — Use `#fee`/`#fcc`/`#c00` shorthand hex while app pages use full `#fee2e2`/`#fecaca`/`#991b1b`. Slightly different reds.

9. **Order detail sub-components** — OrderTimeline and PickupDetails use hardcoded colors while the parent page uses design tokens.

10. **Settings toggle switches and password inputs** — Use hardcoded colors (`#d1d5db`, `#374151`) instead of design tokens.
