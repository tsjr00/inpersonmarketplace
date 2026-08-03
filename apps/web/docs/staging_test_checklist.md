# Staging Test Checklist

**Master checklist · last updated: 2026-08-02**

This is the **canonical printable test checklist** for InPersonMarketplace staging. Print or email a copy to the tester. They fill in the header, work through each section, and check off Pass/Fail/Skip per test. Notes only required on failures.

**Staging URLs:**
- FM (Farmers Market): `https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app/farmers_market`
- FT (Food Trucks): `https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app/food_trucks`
- Admin: `https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app/admin`

**Approximate time:** 3-5 hours for the full pass. **Section 11 alone is ~60-90 minutes** — that's the never-tested new work, and test 11.3 includes a 10-minute wait you can run other tests during.

**Test data:** Tester should have access to platform admin, vendor, market manager, and buyer test accounts (provided separately). Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.

---

## Tester header (fill in before starting)

- **Date tested:** ________________________
- **Tester name:** ________________________
- **Browser / device:** ________________________ (e.g., Chrome / Mac, Safari / iPhone)
- **Account email(s) used:** ________________________________________________
- **Vertical(s) tested:**  [ ] Farmers Market    [ ] Food Trucks    [ ] Both

---

## How to use this checklist

1. Work through sections in order — earlier sections set up state used by later ones (e.g., creating a vendor before testing vendor operations).
2. Each test specifies the **role** (account type) you need to be in. Log out and in as needed.
3. After each test, check **one** of `[ ] Pass`, `[ ] Fail`, or `[ ] Skip`.
4. **Notes are only required for failures.** Write what went wrong + what you expected. Keep it short — one sentence is fine.
5. If a step is unclear or you can't tell whether it passed, mark it `[ ] Skip` and note "unclear" — don't guess.
6. **Differences between FM and FT** are called out per-test in a "Vertical notes" line. If both are listed, test each separately.

---

## Sections

1. [Public Site & Browse](#1-public-site--browse) — 3 tests
2. [Auth & Account](#2-auth--account) — 2 tests
3. [Buyer Order Flow](#3-buyer-order-flow) — 5 tests (highest value — money path)
4. [Market Box Subscriptions](#4-market-box-subscriptions) — 3 tests
5. [Events (Organizer & Attendee)](#5-events-organizer--attendee) — 3 tests
6. [Vendor Onboarding & Profile](#6-vendor-onboarding--profile) — 4 tests
7. [Vendor Operations](#7-vendor-operations) — 5 tests
8. [Market Manager](#8-market-manager) — 7 tests (newest big feature)
9. [Platform Admin](#9-platform-admin) — 3 tests
10. [Cross-Vertical & Notifications](#10-cross-vertical--notifications) — 2 tests

**Total: 37 tests.**

---

## 1. Public Site & Browse

### 1.1 Landing page loads cleanly

**Role:** Logged out
**URL:** `/farmers_market`

What to do:
1. Visit URL
2. Confirm page renders fully (logo, hero, footer)
3. Open browser console (F12 → Console tab) — check for red errors
4. Click the main nav links one at a time and confirm each routes without error

**Expected:** Page loads, no red console errors, all nav links work.
**Vertical notes:** Repeat for `/food_trucks` (different branding expected: orange vs green).

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 1.2 Markets list page filters correctly

**Role:** Logged out
**URL:** `/farmers_market/markets`

What to do:
1. Visit URL — note how many markets appear
2. Scroll through the list — markets with zero published-listing vendors should NOT appear
3. Click a market card — should open market profile page
4. Use the location prompt if shown (or skip it)

**Expected:** Only markets with at least one onboarded vendor are listed. Clicking a market opens its detail page.
**Vertical notes:** FT shows "where today" style locations (mobile trucks). FM shows static markets.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 1.3 Browse page + search

**Role:** Logged out
**URL:** `/farmers_market/browse`

What to do:
1. Visit URL
2. If prompted, enter a ZIP code (use one from your area)
3. Browse the listings shown
4. Use the search input — type a partial product name
5. Click a listing to open its detail page

**Expected:** Browse loads, location prompt works, search filters listings, detail page opens.
**Vertical notes:** Both verticals should work the same way.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 2. Auth & Account

### 2.1 Buyer signup + email confirmation

**Role:** Logged out → new buyer
**URL:** `/farmers_market/signup`

What to do:
1. Visit URL
2. Sign up with a fresh email address (or test+`random`@gmail.com style)
3. Check your inbox for the confirmation email
4. Click the confirmation link → should land you on `/dashboard` logged in

**Expected:** Email arrives within ~1 min, link works, you're logged in afterward.
**Vertical notes:** FT signup should ALSO work via `/food_trucks/signup` and route to FT dashboard.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 2.2 Login + password reset

**Role:** Logged out
**URL:** `/farmers_market/login`

What to do:
1. Log in with an existing test buyer account → should land on dashboard
2. Log out
3. Click "Forgot password" → enter your email → check inbox for reset email
4. Click reset link → set a new password → log in with new password

**Expected:** Login works, password reset email arrives, new password works.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 3. Buyer Order Flow

### 3.1 Add item to cart

**Role:** Buyer (logged in)

What to do:
1. From `/farmers_market/browse`, click any listing
2. Choose a market + pickup date if asked
3. Click "Add to cart" with quantity 1
4. Click cart icon (top right) — item should appear with correct price

**Expected:** Cart shows the item, correct quantity, correct price.
**Vertical notes:** FM listings always have pickup dates. FT may have differences for event vendors.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 3.2 Checkout + Stripe payment (test card)

**Role:** Buyer with item in cart

What to do:
1. Open cart → click "Checkout"
2. Confirm tip amount (or leave default)
3. Click "Proceed to payment" → Stripe Checkout opens
4. Enter test card `4242 4242 4242 4242`, future expiry, any CVC, any ZIP
5. Complete payment

**Expected:** Stripe redirects back to `/checkout/success`. Order number is shown. Item moves out of cart.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 3.3 Buyer orders dashboard shows new order

**Role:** Buyer (just completed checkout in 3.2)
**URL:** `/farmers_market/buyer/orders`

What to do:
1. Visit URL
2. Confirm the new order from 3.2 appears in the list
3. Click into the order detail page
4. Confirm: order number, item, vendor, market, pickup date, total all correct

**Expected:** Order shows up immediately. All details match what you bought.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 3.4 Buyer cancels an order

**Role:** Buyer with an open order (not yet picked up)

What to do:
1. Open an order detail page
2. Click "Cancel order" (only available before pickup)
3. Confirm cancellation
4. Stripe refund initiates — note the timing

**Expected:** Order status changes to "cancelled". Refund issued (visible in test mode in Stripe dashboard, or just on the buyer order page).

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 3.5 Confirm pickup + rate the vendor

**Role:** Buyer (with a paid + ready-for-pickup order; you may need vendor to mark it "ready" via test 7.4 first)

What to do:
1. Open buyer order detail
2. Click "Confirm pickup"
3. After confirming pickup, look for the rating prompt (overall + per-vendor)
4. Submit a 5-star rating

**Expected:** Order status → "completed". Rating saved. Vendor payout triggers (visible to vendor in 7.5).

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 4. Market Box Subscriptions

### 4.1 Browse market boxes

**Role:** Buyer (logged in)

What to do:
1. From the dashboard or vendor profile, find a market box offering
2. Click into the market box detail page
3. Read the description, price, term length, frequency
4. Confirm you see "Subscribe" button (assuming capacity available)

**Expected:** Box detail loads with all info. Subscribe button present if capacity allows.
**Vertical notes:** FT may have fewer market box offerings than FM.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 4.2 Subscribe to a market box

**Role:** Buyer

What to do:
1. From a market box detail page, click "Subscribe"
2. Choose start date + duration (term)
3. Pay via Stripe with `4242 4242 4242 4242`
4. After success, visit `/farmers_market/buyer/subscriptions`

**Expected:** New subscription appears. Pickup schedule shown for the term.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 4.3 Confirm a market box pickup

**Role:** Buyer with active market box subscription

What to do:
1. Visit `/farmers_market/buyer/subscriptions/<sub-id>`
2. Find an upcoming pickup
3. On pickup date, click "Confirm pickup"

**Expected:** That pickup marked complete. Next pickup remains scheduled.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 5. Events (Organizer & Attendee)

### 5.1 Submit an event request

**Role:** Logged-out organizer (or fresh account)
**URL:** `/farmers_market/events` (find "Request an event" CTA)

What to do:
1. Click "Request an event"
2. Fill in: event name, date, location, expected attendees, event setting (indoor/outdoor/either)
3. Submit

**Expected:** Confirmation shown. Email confirmation sent to organizer.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 5.2 Event shop page loads (as attendee)

**Role:** Logged-in buyer (or use an existing event token URL provided to you)
**URL:** `/farmers_market/events/<token>/shop`

What to do:
1. Visit a valid event token URL
2. Browse the vendor list at the event
3. Click into a listing
4. Add to cart (if attendee + wave is open)

**Expected:** Event-only listings appear. Wave selection prompt if applicable.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 5.3 Reserve a wave + order via company-paid flow

**Role:** Logged-in attendee with access code (for company-paid events only)

What to do:
1. Visit `/farmers_market/events/<token>/select`
2. Enter access code if prompted
3. Pick a wave time
4. Choose your item
5. Confirm order (no Stripe — company pays)

**Expected:** Order created with payment_model='company_paid'. No buyer payment required.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 6. Vendor Onboarding & Profile

### 6.1 Vendor signup

**Role:** Fresh email, vendor side
**URL:** `/farmers_market/vendor-signup`

What to do:
1. Fill in vendor signup form (business name, category, etc.)
2. Submit
3. Check email for confirmation → click link
4. Land on vendor dashboard

**Expected:** Account created, you're in vendor dashboard.
**Vertical notes:** FT signup is at `/food_trucks/vendor-signup` and asks for slightly different fields (e.g., truck info).

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 6.2 Complete 3-gate onboarding (COI + business docs + category docs)

**Role:** Newly signed-up vendor
**URL:** `/farmers_market/vendor/edit`

What to do:
1. Scroll to "Documents & Certifications" section
2. Upload a PDF or image to each gate that's required for your category
3. Upload a COI (any test PDF) in the COI section
4. Check vendor dashboard — onboarding checklist should reflect uploads

**Expected:** Files upload without error. Status shows "Pending review" per gate. Onboarding progress advances.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 6.3 Edit vendor profile + upload images

**Role:** Vendor
**URL:** `/farmers_market/vendor/edit`

What to do:
1. Update business description
2. Upload a profile image
3. Upload a cover image
4. Save

**Expected:** Changes save. Visible immediately on `/farmers_market/vendor/<id>/profile`.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 6.4 Vendor with grandfathered COI can upload a real one

**Role:** Vendor whose COI status is "approved" but has only placeholder rows (no actual file)
**URL:** `/farmers_market/vendor/edit`

What to do:
1. Scroll to "Certificate of Insurance" section
2. You should see "Document unavailable" for the existing row AND a "+ Upload COI" button (Session 87 fix)
3. Click "+ Upload COI" and upload a test PDF
4. Status flips to "Pending review"

**Expected:** Upload button visible even though status was "approved". Upload succeeds. Status changes.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 7. Vendor Operations

### 7.1 Create + publish a listing

**Role:** Approved vendor
**URL:** `/farmers_market/vendor/listings/new`

What to do:
1. Fill in: name, description, price, inventory, category, image upload
2. Save as draft → confirm draft state
3. Publish → confirm listing now visible in browse

**Expected:** Listing creates, publishes, shows in browse search.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 7.2 Assign listing to a market

**Role:** Vendor
**URL:** `/farmers_market/vendor/listings/<id>/edit`

What to do:
1. Open a published listing
2. Click "Manage markets" section
3. Add at least one market with active schedules
4. Save

**Expected:** Listing shows under the market on `/farmers_market/markets/<id>`.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 7.3 View incoming orders

**Role:** Vendor with a recent buyer order (from test 3.2)
**URL:** `/farmers_market/vendor/orders`

What to do:
1. Visit URL
2. Confirm the order placed in test 3.2 appears
3. Click into the order
4. Confirm: buyer name (if available), item, pickup date, payout amount all shown

**Expected:** Order visible immediately. All fields accurate.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 7.4 Mark order ready + confirm pickup

**Role:** Vendor with a paid order
**URL:** Vendor order detail page

What to do:
1. Open the order
2. Click "Mark ready"
3. Status → "ready for pickup". Buyer gets notification.
4. After buyer confirms pickup (test 3.5), click "Confirm handoff" if shown OR rely on auto-completion

**Expected:** Status changes correctly at each step. Payout triggers after handoff.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 7.5 Vendor Stripe payout shows in dashboard

**Role:** Vendor with at least one completed order
**URL:** `/farmers_market/vendor/dashboard/stripe`

What to do:
1. Visit URL
2. Confirm Stripe Connect status shows "Connected" (or complete onboarding if not)
3. Visit `/farmers_market/vendor/pickup` → confirm payout balance reflects completed orders

**Expected:** Stripe Connect shows connected. Payout amount visible and accurate.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 8. Market Manager

### 8.1 Submit market manager intake form

**Role:** Public (logged out OK)
**URL:** `/farmers_market/market-manager-program`

What to do:
1. Click "Apply" or similar CTA
2. Fill in: market name, address (with auto-geocode), market type, description, your name + email
3. Submit
4. Confirm submission message + email confirmation

**Expected:** Form submits. Email confirmation arrives. Pending market appears in admin queue (test in 9.2).

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 8.2 Admin approves pending market

**Role:** Platform admin
**URL:** `/admin/markets` (filter to pending)

What to do:
1. Find the market submitted in 8.1
2. Click "Approve" (or similar)
3. Market status → active
4. Manager receives email with manager dashboard link

**Expected:** Approval works. Manager gets email with dashboard access.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 8.3 Market manager onboarding wizard

**Role:** Market manager (use link from approval email)
**URL:** `/farmers_market/market-manager/<marketId>/onboarding`

What to do:
1. Click through each wizard step: branding, booth inventory, opt-in agreements, vendors, placeholders
2. Use "I have no existing vendors/placeholders yet" ack where applicable
3. Reach the end → dashboard

**Expected:** Each step saves. Progress indicator updates. End-of-wizard lands in dashboard.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 8.4 Manager invites a vendor (NEW-8)

**Role:** Market manager
**URL:** Manager dashboard → "Invite vendors" section

What to do:
1. Click "Invite vendor"
2. Enter a fresh vendor email
3. Send invitation
4. Vendor receives email with custom link
5. Vendor clicks link → completes vendor signup → auto-associated with the market

**Expected:** Invitation sent. Vendor signup pre-fills association. After signup, vendor shows up in manager's vendor list.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 8.5 Manager Stripe Connect onboarding

**Role:** Market manager
**URL:** Manager dashboard → Stripe section

What to do:
1. Click "Connect Stripe" or similar
2. Complete Stripe Express onboarding (test mode — fake SSN ending 0000, test bank account)
3. Return to manager dashboard
4. Status shows "Connected" + payouts enabled

**Expected:** Stripe onboarding completes. Manager can now receive booth rental payments.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 8.6 Vendor books a weekly booth (Phase C)

**Role:** Vendor at a manager's market (with manager's Stripe Connect complete)
**URL:** `/farmers_market/vendor/markets/<marketId>/book`

What to do:
1. Click "Book a booth"
2. Select booth size tier + week
3. Accept opt-in agreement
4. Pay via Stripe with `4242 4242 4242 4242`
5. Confirm booking shows in vendor's bookings page (`/vendor/bookings`)

**Expected:** Booking succeeds. Manager + vendor both get notifications. Booth label auto-assigned.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 8.7 Manager uploads market verification documents (NEW-7)

**Role:** Market manager
**URL:** Manager dashboard → "Verification Documents" section

What to do:
1. Click "Upload document"
2. Select doc type (e.g., insurance, business license)
3. Upload a test PDF
4. Confirm file appears in the list

**Expected:** Upload succeeds. Doc appears in manager view AND admin can see it from admin vendor management.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 9. Platform Admin

### 9.1 Approve a pending vendor

**Role:** Platform admin
**URL:** `/admin/vendors/pending`

What to do:
1. Find a vendor in pending state with uploaded docs
2. Open the vendor detail
3. Click each document to view it (should open via signed URL, ~1-hour TTL)
4. Click "Approve" overall (or approve each gate)

**Expected:** Doc views work (no 400). Approval moves vendor to active. Vendor receives email.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 9.2 Vertical admin pending intake surface

**Role:** Platform admin
**URL:** `/farmers_market/admin/markets` (filter: pending)

What to do:
1. Confirm any pending markets from test 8.1 appear
2. Open one to see full intake details
3. Click "Approve" inline

**Expected:** Pending intake markets show on vertical admin surface. Inline approve works.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 9.3 Error log dashboard

**Role:** Platform admin
**URL:** `/admin/error-logs`

What to do:
1. Visit URL
2. Confirm recent errors (last 24h) appear
3. Filter by vertical
4. Click into one error → see breadcrumbs + stack

**Expected:** Errors load, filter works, detail view shows full trace.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 10. Cross-Vertical & Notifications

### 10.1 Vertical isolation sanity check

**Role:** Any logged-in user

What to do:
1. While viewing FM, confirm only FM markets / FM vendors / FM listings appear
2. Switch URL to FT (`/food_trucks/...`)
3. Confirm only FT data appears
4. Confirm branding differs (FM = green, FT = orange/coral)

**Expected:** No cross-vertical leakage. Branding swaps correctly.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 10.2 In-app + email notifications fire

**Role:** Any user with notifications enabled
**URL:** `/farmers_market/notifications`

What to do:
1. Trigger a known notification (e.g., place an order → vendor gets "new order"; or vendor accepts invitation)
2. Within 1-2 min, confirm in-app notification appears at `/notifications`
3. Confirm email lands in the relevant inbox
4. Check notification count badge updates

**Expected:** Both channels deliver promptly. Email looks correct (branded, no broken images).

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## 11. New since the last production push (added 2026-08-02)

> These three features are on staging and have **never been tested**. Production does not have them. Everything in this section is new code — if you only have time for part of a pass, do this section.
>
> **Migrations 213–216 are applied to staging. Production has none of them.**

### 11.1 Vendor sets pickup capacity (FT)

**Role:** Approved food truck vendor
**URL:** `/food_trucks/vendor/edit` → **Pickup Capacity** card

What to do:
1. Answer the three questions: total orders you can complete in one pickup window (all customers, walk-ups included), how many of those can be app pre-orders, and items in a typical order
2. Read the shown math — it should multiply your app-order answer by your typical-order-size answer to get the item cap
3. Change the item cap to something different (the override) and save
4. Reload the page

**Expected:** All answers persist. The math line matches your inputs. The override sticks rather than snapping back to the calculated number. Wording refers to your actual slot length (15 or 30 min) — not a hardcoded number.

**Vertical notes:** Food trucks only. This card should not appear for FM vendors.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.2 A full pickup slot is blocked (FT) — the core of the feature

**Role:** Vendor (setup), then two buyers
**URL:** `/food_trucks/vendor/edit`, then a food truck listing page

What to do:
1. As the vendor, set the **app pre-orders** answer to `1` and save
2. As buyer #1, order that vendor's item for a specific pickup time — complete payment
3. As buyer #2 (or a private window), open the same listing and open the pickup time dropdown

**Expected:** The time buyer #1 took now shows **"— Full"** and cannot be selected. Other times are still selectable. If you force it through anyway, checkout refuses with *"This pickup time is full. Please pick another time."*

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.3 An abandoned checkout releases the slot (FT)

**Role:** Buyer
**URL:** A food truck listing for a vendor with capacity set to 1

What to do:
1. Add an item, choose a pickup time, proceed to the Stripe checkout page
2. **Close the tab without paying**
3. Immediately re-check that pickup time as another buyer — it should still read **Full**
4. Wait 10 minutes, re-check the same time

**Expected:** Full for ~10 minutes (someone might still be paying), then **available again** — without anyone running a cron job or cancelling anything. If it is still Full after 15 minutes, that is a **Fail**: it means abandoned checkouts are holding slots.

**Why this matters:** this was a real bug caught in review. Uncaught, one walked-away buyer could have blocked a lunch slot for a whole day.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.4 Changing prep time warns that capacity is stale (FT)

**Role:** Food truck vendor with a capacity already saved
**URL:** `/food_trucks/vendor/edit` → **Pickup Prep Time** card

What to do:
1. Note your current prep time (15 or 30 min)
2. Switch it to the other value and Save

**Expected:** An amber warning appears telling you your order capacity was set for the old slot length and probably needs to change. It should name both numbers (old slot length vs new).

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.5 Two service windows in one day (FT) — CONDITIONAL

**Role:** Buyer
**Only run this if** the following returns rows:
```sql
SELECT market_id, day_of_week, COUNT(*) FROM market_schedules
 WHERE active = true GROUP BY 1,2 HAVING COUNT(*) > 1;
```

What to do:
1. Find a market that operates two windows on the same weekday (e.g. lunch and dinner)
2. As a buyer, order from a truck there and pick a time in the **second** window

**Expected:** The later time is accepted and checkout completes. A rejection reading *"That pickup time is no longer available"* for a time the truck genuinely serves is a **Fail**.

**Skip and mark N/A if the query returns no rows** — the fix was preventive.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.6 Platform admin creates a cause beneficiary

**Role:** Platform admin
**URL:** `/admin/cause`

What to do:
1. Create a beneficiary organization (name + how they receive money)
2. Save, reload, confirm it persists and shows as active

**Expected:** Beneficiary appears in the list and is available to attach to an event.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.7 Enable Community Chip In on an event

**Role:** Vertical admin (and repeat as platform admin)
**URL:** `/food_trucks/admin/events` (and `/farmers_market/admin/events`)

What to do:
1. Open an event, find the **Community Chip In** control
2. Attach the beneficiary from 11.6, enable it, save
3. Log in as the **other** admin type and confirm you can see and change the same setting

**Expected:** Both a vertical admin and a platform admin can manage this. Setting persists across reload.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.8 Buyer adds a Chip In at checkout

**Role:** Buyer
**URL:** `/food_trucks/checkout` after adding an item from a Chip-In-enabled event

What to do:
1. In the Chip In section, pick an amount
2. Read the disclosure text
3. Complete payment with the test card
4. Check the order confirmation and receipt

**Expected:** The chip-in amount is added on top of your order total and shown as its own line. The copy states plainly that this is **not a tax-deductible donation** and that 100% goes to the organization. The paid total matches order + fees + chip in.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.9 Round-up campaign appears when there is no event chip-in

**Role:** Platform admin, then buyer
**URL:** `/admin/cause`, then any checkout

What to do:
1. As admin, create an active round-up campaign for a beneficiary
2. As a buyer, check out on a **normal** order (not an event with its own chip-in)

**Expected:** A round-up offer appears at checkout, rounding to the next dollar. Same not-tax-deductible disclosure. Declining it leaves the total unchanged.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.10 Refunding an item does NOT refund the chip in

**Role:** Vendor (reject an order) or admin (refund), using an order from 11.8
**URL:** `/food_trucks/vendor/orders`

What to do:
1. Take an order that included a chip in and reject/refund the item
2. Check the buyer's refund amount

**Expected:** The buyer is refunded for the item, fees per existing policy — **but the chip in is not returned**. This is the deliberate policy decision (it goes to the organization either way). Confirm the buyer-facing copy said so before they paid.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.11 Chip In funds accumulate and remit in batches

**Role:** Platform admin
**URL:** `/admin/cause` → remittances

What to do:
1. After 11.8/11.9, confirm the beneficiary's balance reflects the chip-ins collected
2. Confirm balances below the minimum are **held**, not sent (we batch rather than transferring cents at a time)
3. If the beneficiary is set to receive a manual check, record one and confirm the balance draws down

**Expected:** Balance math matches what buyers actually paid. Nothing auto-sends below the batch minimum. Recording a check reduces the balance and leaves an audit trail.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.12 Admin enters tax jurisdictions for a market

**Role:** Platform admin
**URL:** `/admin/markets` → click **Edit** on a market (not the market name — the name opens the read-only view)

What to do:
1. Find the **tax jurisdictions** card
2. Confirm the Texas state row (6.25%) is pre-seeded and cannot be removed
3. Use the market address with the linked Comptroller Rate Locator to look up the real local jurisdictions; enter each with its **seven-digit** code
4. Deliberately type a rate as a decimal (e.g. `.015`) and click away
5. Try to enter jurisdictions totalling more than 8.25%
6. Save

**Expected:** The decimal auto-converts to `1.5%` with a visible warning. Over-8.25% is blocked with a clear error and **Save stays disabled while invalid**. Codes reject non-digits and cap at 7. Saved values persist across reload.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.13 Changing a market address clears tax verification

**Role:** Platform admin
**URL:** `/admin/markets` → Edit on the market from 11.12

What to do:
1. Change any part of the address (street, city, or ZIP) and save
2. Return to the tax jurisdictions card

**Expected:** A loud amber **"Re-verify needed"** banner appears. The jurisdictions you entered are **still there** (not wiped) — you re-confirm them rather than re-typing.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

### 11.14 Vertical admin can manage tax jurisdictions

**Role:** Vertical admin
**URL:** `/food_trucks/admin/markets` → edit a market

What to do:
1. Open a market's edit modal and find the tax jurisdictions card
2. Make a change and save

**Expected:** Same card, same validation, saves correctly. A vertical admin should be able to do this for markets in their own vertical.

Result: [ ] Pass   [ ] Fail   [ ] Skip
Notes: _________________________________________________________

---

## End-of-pass summary (tester fills in)

- **Total Pass:** _____ / 51
- **Total Fail:** _____
- **Total Skip:** _____
- **Most concerning failure:** ________________________________________________
- **Anything that felt "off" but wasn't a clear failure:** ________________________________________________
- **Time spent:** _____ hours
- **Date completed:** ________________________

**Return this filled-out checklist to:** [your email here]

---

## For the maintainer (Tracy) — how this file evolves

- This file is the **canonical master**. To run a test pass, copy/print/email this file as-is and give to the tester.
- When you add new features, add new tests to the relevant section. Keep existing test numbers stable (renumbering breaks regression comparisons across runs). Number new tests as `8.8`, `8.9`, etc.
- When a feature is deprecated, mark its test as `~~strikethrough~~` rather than deleting — preserves historical context.
- Filled-out test pass results (PDF, scan, email) can be archived under `apps/web/.claude/test_runs/<date>_<tester>.pdf` if you want them in the repo. Or anywhere else — there's no system dependency.
- Bump the "last updated" date at the top whenever you change anything substantive.

**Last updated: 2026-08-02 — added Section 11 (14 tests): FT pickup capacity, Community Chip In, tax jurisdictions. 51 tests across 11 sections. Sections 1-10 unchanged; existing test numbers stable.**
