# Legal Terms & Conditions — Reference File for Next Session
**Created:** 2026-03-04
**Purpose:** This file contains everything a future session needs to produce accurate, attorney-ready T&C documents that reflect the ACTUAL app mechanics, not generic marketplace language.

---

## STATUS SUMMARY

### What Exists
1. **Strategy document** — `docs/Legal_Strategy_Layered_Business_Relationships.md`
   - Three-tier business relationship framework (good, keep this)
   - Defines WHAT each tier covers and WHY
   - This is the strategic blueprint — still valid

2. **First draft legal documents** — `docs/Legal_Terms_Attorney_Ready.md` (832 lines)
   - 4 documents: Platform User Agreement, Vendor Service Agreement, Vendor Partner Agreement, Privacy Policy
   - **PROBLEM: Too generic.** Written from strategy notes, NOT from actual code/app review
   - Several sections describe behaviors that don't match the actual app
   - User reviewed and identified multiple inaccuracies
   - **This draft should be used as a STARTING POINT, not thrown away** — the legal structure, article organization, and protective language are sound. The specific mechanics need to be corrected.

3. **Current task file** — `apps/web/.claude/current_task.md`
   - Has reference data (company name, fee structures, subscription tiers, etc.)
   - Still valid, should be read alongside this file

### What the Next Session Must Do
1. Do a THOROUGH codebase review of every feature area referenced in the legal docs
2. Correct all inaccurate sections in `docs/Legal_Terms_Attorney_Ready.md`
3. Restructure per the user's feedback below
4. Produce a final version the user can hand to an attorney for proofreading (not rewriting)

---

## USER FEEDBACK — DETAILED CORRECTIONS NEEDED

These are the specific issues the user identified. Each one must be addressed.

### CORRECTION 1: Entity Name — "815 Enterprises" is a DBA, NOT an LLC
- The first paragraph says "815 Enterprises LLC" — **remove "LLC" from the opening**
- The actual LLC name can be introduced later/lower in the agreement
- User wants to move the parties/entity discussion LOWER in the document so someone has to dig to find the corporate structure
- **Key strategy**: Don't lead with the entity details. Lead with normal website terms.

### CORRECTION 2: Hide Multi-Vertical Nature
- Article 10 ("Multi-Vertical Platform") openly declares we're a multi-vertical platform
- **User wants to disguise the fact that this is a multi-vertical app platform**
- Each vertical's terms should reference ONLY that vertical's site
- If terms are kept separate per vertical, we only need to list the one site the user is on
- Remove or restructure Article 10 entirely
- Don't cross-reference farmersmarketing.app and foodtruckn.app in the same document

### CORRECTION 3: Move Article 1 (Business Relationship) Lower
- Currently Article 1 leads with "Establishment of Business Relationship" — too aggressive upfront
- Lead with normal website T&C (account terms, usage rules, payment terms)
- Introduce the tiered business relationship language LOWER in the document
- The protective clauses should feel like standard terms, not stand out as unusual

### CORRECTION 4: Platform Termination Flexibility
- Current clause: "Your access to the Platform is a privilege granted under the terms of this Agreement and may be revoked for violation of these terms."
- **Problem**: This limits termination to "violation of terms" only
- User needs flexibility to remove vendors for ANY reason — business changes, events, restructuring, etc.
- Add "at Company's sole discretion" or "with or without cause" language somewhere
- Place it wherever it doesn't weaken the overall argument

### CORRECTION 5: Fee Disclosure — Must Match Actual Checkout Experience
- Article 4.2(c) says "Fee rates are displayed transparently at checkout and in the Platform's fee schedule"
- **THIS IS FALSE** — the platform does NOT display percentage fees at checkout
- How it ACTUALLY works:
  - The listing price the buyer sees IS the buyer price (6.5% is already built in)
  - The only additional fee shown at checkout is the $0.15 service fee
  - Nowhere in the platform is the 6.5% buyer percentage disclosed to buyers
  - The price-you-see-is-the-price-you-pay is a CORE design principle
- **What the terms SHOULD say**: Disclose that the transaction amount includes a buyer service fee and an order service fee, but do NOT claim we display them at checkout because we don't
- We must disclose the buyer fee percentage (6.5% + $0.15) in the terms document, but should not advertise or highlight it
- Do NOT mention vendor-side fees in the buyer-facing terms — buyers don't need to know what vendors pay

### CORRECTION 6: Tip Handling — Section 4.5 is Inaccurate
- Current text: "The Company does not retain any portion of tips beyond the actual third-party payment processing fees attributable to the tip amount"
- **THIS IS NOT ACCURATE** — the code must be reviewed to determine exactly what happens with tips
- From MEMORY.md context: tips are calculated on `displaySubtotal` (per-item rounded), the platform fee portion of the tip is tracked in `tip_on_platform_fee_cents`
- The terms need to accurately describe what the company does and doesn't retain from tips
- **NEXT SESSION: Review `src/lib/pricing.ts` and checkout code to determine exact tip flow**

### CORRECTION 7: "Communicate Through the Platform" is Misleading
- Multiple sections say buyers should "communicate promptly through the Platform"
- **The platform does NOT facilitate direct buyer-vendor communication**
- What IS available: leaving feedback, canceling orders
- That COULD be construed as communication, but the terms must not imply the platform has a messaging system
- Rework all references to avoid giving the impression of direct messaging

### CORRECTION 8: Liability for Stripe Transactions
- Section 3.3(c) says "Company is not responsible for disputes, losses, or issues arising from transactions completed through External Payment Methods"
- **Problem**: By only disclaiming liability for external payments, it implies the Company IS responsible for Stripe-processed transactions
- The Company is NOT responsible for either type
- Rework the liability language to cover ALL transactions, not just external
- The external payment section can stay as-is, just ensure the general liability section covers Stripe transactions too

### CORRECTION 9: "Electronic Payments" Language
- Section 4.1 says "All electronic payments are processed securely through Stripe"
- **Not accurate**: External payment methods like PayPal, Venmo, and Cash App are ALSO electronic but NOT through Stripe
- Need terminology like "Platform-processed payments" vs "External payments" or "Direct payments"
- Or "internal electronic payments" vs "external payments"

---

## STRUCTURAL CHANGES REQUESTED

### Document Structure — Per-Vertical Separation
- Each vertical gets its own set of terms referencing ONLY that vertical's domain
- FM terms reference only farmersmarketing.app
- FT terms reference only foodtruckn.app
- No cross-references between verticals in the same document

### Article Ordering — Lead with Normal, Protect Later
Current order vs. desired approach:
```
CURRENT:
Art. 1 - Business Relationship (aggressive)
Art. 2 - User Accounts
Art. 3 - Shopper Obligations
...

DESIRED:
Art. 1 - Basic Terms / Acceptance
Art. 2 - User Accounts
Art. 3 - Shopper Obligations
Art. 4 - Payment Terms
...
Art. [later] - Business Relationship / Consideration (protective clauses)
Art. [later] - IP / Proprietary Rights
Art. [later] - Confidentiality provisions
```

### Entity/Parties Placement
- Don't lead with "815 Enterprises LLC, a Texas limited liability company"
- Use something like "the Company" or just the DBA name upfront
- Full legal entity identification goes in a definitions section or buried lower

---

## CODEBASE REVIEW REQUIREMENTS

The next session MUST review these code areas before writing legal language about them. The first draft was written without this review and that's why it's inaccurate.

### Area 1: Fee Calculation & Display
**Files to review:**
- `src/lib/pricing.ts` — THE source of truth for all fee calculations
- `src/lib/constants.ts` — re-exports pricing constants
- Checkout page/component — what's actually shown to the buyer at checkout
- Listing display — how prices are shown on browse/listing pages

**Questions to answer:**
- Exactly how is the buyer price calculated from the vendor's base price?
- What does the buyer see on the listing card? On the listing detail page? At checkout?
- Is the 6.5% ever shown as a line item, or is it always baked in?
- What exactly is shown at checkout (line items, subtotal, service fee, tip, total)?

### Area 2: Tip Handling
**Files to review:**
- `src/lib/pricing.ts` — tip calculation functions
- Checkout component — tip selection UI and calculation
- Order creation / success route — how tip is recorded
- Stripe payment creation — how tip flows through Stripe

**Questions to answer:**
- What percentage of the tip goes to the vendor?
- Does the platform retain any portion of the tip? If so, how much and why?
- What is `tip_on_platform_fee_cents` and how is it calculated?
- Is the tip calculated on the base food price or the display price (with fees built in)?

### Area 3: Communication Between Buyers and Vendors
**Files to review:**
- Any messaging or chat components (if they exist)
- Order detail pages — what actions are available to buyers/vendors
- Feedback/review system
- Notification types and what they enable

**Questions to answer:**
- Can a buyer send a free-form message to a vendor? (likely NO)
- What can a buyer DO regarding an order? (cancel, leave review, report issue?)
- What can a vendor DO regarding communication? (confirm, mark ready, etc.)
- What notifications are sent and what do they contain?

### Area 4: External Payment System
**Files to review:**
- External payment components/pages
- Checkout flow — how external payment option is presented
- Order management — external payment confirmation flow
- Fee calculation for external payments

**Questions to answer:**
- How does a buyer choose external payment?
- What happens after they choose it? What's the vendor's flow?
- How is the 3.5% vendor fee collected on external payments?
- Who sees what information about external payment options?

### Area 5: Refund / Cancellation Flow
**Files to review:**
- Order cancellation routes/components
- Refund processing code
- Order lifecycle status transitions

**Questions to answer:**
- What are the actual cancellation rules by order status?
- Is there actually a 25% cancellation fee? Or is that made up?
- What's the grace period?
- Can vendors initiate cancellations?

### Area 6: Vendor Onboarding Gates
**Files to review:**
- Vendor signup flow
- 4-gate onboarding system
- Vendor approval process

**Questions to answer:**
- What are the 4 gates exactly?
- What happens at each gate?
- Where would Tier 2 vs Tier 3 acceptance naturally fit?

### Area 7: Subscription / Trial System
**Files to review:**
- Vendor trial system (from Session 48 memory)
- Subscription management
- Tier limits

**Questions to answer:**
- How does the trial work mechanically?
- What happens at trial expiry?
- What are the exact tier names and prices per vertical?

### Area 8: Account Termination / Deletion
**Files to review:**
- Account deletion routes
- Vendor account termination process
- Data retention implementation

**Questions to answer:**
- Can users actually delete their accounts through settings?
- What happens to their data?
- Can the company terminate accounts at will?

### Area 9: Payout System
**Files to review:**
- Vendor payout code
- Stripe Connect implementation
- Payout timing and calculation

**Questions to answer:**
- When do vendors get paid?
- How is the payout calculated (fee deductions)?
- Market box payout timing (at checkout, not per-pickup)

### Area 10: Push Notifications / SMS
**Files to review:**
- Notification types
- SMS implementation (Twilio)
- Push notification implementation (Web Push API)

**Questions to answer:**
- What notification channels exist?
- Is SMS actually active? (A2P 10DLC pending)
- How does opt-out work?

---

## EXISTING DOCUMENTS TO DRAW FROM

| Document | Path | Use |
|----------|------|-----|
| Strategy (tiers) | `docs/Legal_Strategy_Layered_Business_Relationships.md` | Strategic framework — tier definitions, enforcement strategy |
| First draft T&C | `docs/Legal_Terms_Attorney_Ready.md` | Starting point for legal language — structure is good, mechanics need fixing |
| Current task | `apps/web/.claude/current_task.md` | Reference data (fees, tiers, company info) |
| This file | `apps/web/.claude/legal_terms_reference.md` | User corrections, codebase review requirements |
| Pricing source | `src/lib/pricing.ts` | Fee calculations — MUST be reviewed |
| Constants | `src/lib/constants.ts` | Fee percentages, thresholds |
| Schema snapshot | `supabase/SCHEMA_SNAPSHOT.md` | Database structure for data handling claims |
| MEMORY.md | (auto-memory) | Session history, patterns, financial safety notes |
| CLAUDE_CONTEXT.md | (root) | Architecture overview |

---

## KEY PRINCIPLES FOR THE REWRITE

1. **Accuracy over coverage** — Every claim in the terms must match what the code actually does
2. **Don't advertise what we don't show** — If fees aren't displayed at checkout, don't say they are
3. **Per-vertical isolation** — Each vertical gets its own doc, no cross-references
4. **Lead with normal, protect later** — Standard T&C upfront, business relationship protections buried deeper
5. **Hide corporate structure** — DBA name first, LLC details buried
6. **Flexibility to terminate** — Company can remove vendors at sole discretion, not just for violations
7. **No implied communication system** — Don't suggest we have messaging
8. **Liability covers ALL transactions** — Not just external payments
9. **Distinguish payment types clearly** — "Platform-processed" vs "External/Direct" payments
10. **Tip handling must be exact** — Review the code, describe what actually happens

---

## CODEBASE REVIEW FINDINGS

*This section will be populated as each area is reviewed. Findings are written immediately after each area's review.*

### Finding 1: Fee Calculation & Display
**REVIEWED — CRITICAL for legal accuracy**

#### How Fees Actually Work (from `src/lib/pricing.ts` and `src/lib/constants.ts`)

**Constants:**
- `FEES.buyerFeePercent = 6.5`
- `FEES.buyerFlatFeeCents = 15` ($0.15)
- `FEES.vendorFeePercent = 6.5`
- `FEES.vendorFlatFeeCents = 15`

**Stripe (card) payments:**
- Buyer pays: base price × 1.065 + $0.15 flat fee per order
- Vendor receives: base price - 6.5% - $0.15
- Platform keeps: 13% total + $0.30 per order

**External payments (cash, Venmo, etc.):**
- Buyer pays: base price × 1.065 (NO $0.15 flat fee)
- Vendor pays: 3.5% seller fee (invoiced separately)
- Platform keeps: 6.5% buyer fee + 3.5% vendor fee = 10% total

#### What the Buyer ACTUALLY SEES at Each Stage

**Browse/listing pages:** Price shown = `base × 1.065` (6.5% baked in). NO fee breakdown. The price you see IS the price. Example: $10 base → shows as $10.65.

**Shopping cart (CartDrawer):** Per-item prices with 6.5% already included. Cart subtotal with 6.5% included. $0.15 flat fee is NOT shown in cart.

**Checkout page:** Shows:
```
Subtotal: $XX.XX  (sum of display prices — 6.5% already baked in)
Service Fee: $0.15  (explicitly shown)
Small Order Fee: $X.XX  (only if under threshold)
Tip (FT only): $X.XX
Total: $XX.XX
```

**External payment checkout:** The 6.5% buyer fee is silently added to total. NOT broken out as a line item. No $0.15 flat fee on external.

**Order confirmation page:** Shows Service Fee ($0.15) + Tip. Does NOT show 6.5% as separate line.

#### Small Order Fees
- FM: $10 threshold → $1.00 fee if under
- FT: $5 threshold → $0.50 fee if under
- Fireworks: $40 threshold → $4.00 fee if under
- Compared against displayed subtotal (after 6.5% markup), not base

#### CRITICAL FACTS FOR LEGAL TERMS
1. **The 6.5% is NEVER labeled "6.5% platform fee" anywhere in the UI** — it's embedded in prices
2. **Only the $0.15 "Service Fee" is shown as a separate line item at checkout**
3. **Vendor fees are completely hidden from buyers**
4. **The existing terms page (old) DOES state "Buyer service fee: 6.5% of the order subtotal"** — so the percentage IS disclosed in T&C, just not in the UI
5. **On external payments, NO fee breakdown is shown to the buyer at all**

#### What the Legal Terms SHOULD Say
- "Transaction amounts include a buyer service fee of 6.5% of the product subtotal, which is incorporated into the displayed price"
- "An additional order service fee of $0.15 applies to each Platform-processed order and is shown at checkout"
- Do NOT say "fees are displayed transparently at checkout" — the 6.5% is NOT displayed at checkout
- Do NOT mention vendor fee percentages in buyer-facing terms

---

### Finding 2: Tip Handling
**REVIEWED — Previous draft Section 4.5 was INACCURATE**

#### How Tips Actually Work

**Availability:** Food Trucks vertical ONLY. Not available for Farmers Marketing.

**Calculation basis:** Tip is calculated on `displaySubtotal` — the sum of per-item display prices (base + 6.5% buyer fee). NOT on the base food price.

**Formula:**
```
tipAmountCents = Math.round(displaySubtotal × tipPercentage / 100)
```

**UI options (TipSelector.tsx):** No Tip | 10% | 15% | 20% | Custom (0-100%, hard-capped at $50 in API)

**UI message to buyer:** "Your tip goes directly to the vendor"

#### What Happens to the Tip — THE PLATFORM KEEPS A PORTION

This is what the first draft got wrong. Here's the actual split:

```
vendorTipCents = Math.round(baseSubtotalCents × tipPercentage / 100)
tipOnPlatformFeeCents = totalTipAmount - vendorTipCents
```

- **Vendor gets:** Tip calculated on BASE food price only
- **Platform keeps:** The difference — the tip attributable to the 6.5% buyer fee portion
- **Stored in DB:** `orders.tip_on_platform_fee_cents`

**Example:** $18.00 base order, display subtotal $19.17 (after 6.5%), buyer tips 10%:
- Total tip: $1.92 (10% of $19.17)
- Vendor receives: $1.80 (10% of $18.00 base)
- Platform keeps: $0.12 ($1.92 - $1.80)
- Platform keeps ~6.25% of the tip

**In Stripe:** Tip is added as a separate line item. Vendor portion is included in Stripe transfer to vendor.

#### What the Legal Terms SHOULD Say
- DO NOT say "The Company does not retain any portion of tips" — this is false
- ACCURATE: "Tips are calculated on the total displayed order amount. The vendor receives the portion of the tip attributable to the product cost. A small portion of the tip corresponding to the platform service fee is retained by the Company to cover associated processing costs."
- Or more concisely: "Tips are voluntary. The vendor receives the tip on the food cost. The Company retains the portion of the tip attributable to the buyer service fee."
- The UI says "Your tip goes directly to the vendor" — this is technically the vendor PORTION. For legal safety, terms should be more precise.

---

### Finding 3: Buyer-Vendor Communication
**REVIEWED — Previous draft was misleading about communication capabilities**

#### What Communication EXISTS

**NO direct messaging, chat, or DM system.** Period. No buyer-vendor messaging of any kind.

**What buyers CAN do on an order:**
- View order status timeline (pending → confirmed → ready → fulfilled)
- Confirm/deny pickup (mutual confirmation flow)
- Report issue ("I didn't receive this") — goes to vendor, then admin if disputed
- Cancel order (within rules)
- Rate vendor (1-5 stars + optional comment) after completion
- Share order on social media

**What vendors CAN do:**
- Confirm/reject orders
- Mark items ready → fulfilled
- Resolve buyer issues (confirm delivery or issue refund)
- They CANNOT message buyers, see buyer contact info (except pickup snapshot), or initiate contact

**Issue resolution flow:** Buyer reports → vendor notified → vendor either confirms delivery (disputed, admin notified) or issues refund. NO back-and-forth communication channel.

**Support system:** `/{vertical}/support` — public form (name, email, category, message). Stored in `support_tickets`. Response: "We will get back to you within 24-48 hours." NOT a buyer-vendor communication tool.

**Feedback systems:** ShopperFeedbackForm (categories: suggest_market, technical_problem, feature_request, vendor_concern, general_feedback). Vendor feedback via API. Neither enables buyer-vendor dialogue.

**Notification system:** 26+ notification types, ALL one-directional (inform only, no reply mechanism). Channels: push, SMS, email, in-app.

#### What the Legal Terms SHOULD Say
- REMOVE all references to "communicate through the Platform" for buyer-vendor interaction
- Replace with: "submit order cancellations, report issues, and provide post-transaction feedback through the Platform"
- The issue reporting system can be described as: "Buyers may report fulfillment issues through the Platform's order management system. Vendors may respond by confirming delivery or issuing a refund."
- For vendor obligations, instead of "communicate with shoppers," say: "respond to order confirmations and issue reports through the Platform's order management tools"
- Explicitly state: "The Platform does not provide direct messaging between buyers and vendors. In-person communication at the point of pickup is the buyer's and vendor's responsibility."

### Finding 4: External Payment System
**REVIEWED — Detailed mechanics documented**

#### How Buyers Choose External Payment
- Checkout page shows `PaymentMethodSelector` with radio buttons
- Only available for single-vendor carts (multi-vendor must use Stripe)
- Not available for market box orders (force Stripe-only)
- Vendor must have Stripe connected AND configured at least one external method
- Options: Credit/Debit Card (Stripe), Venmo, Cash App, PayPal, Cash at Pickup

#### The External Payment Flow
1. Buyer selects method (e.g., "Venmo"), clicks pay button
2. Server creates order IMMEDIATELY (status: `pending`, inventory decremented, cart cleared)
3. Buyer redirected to external checkout page showing:
   - For cash: "Pay Cash at Pickup" with instructions
   - For Venmo/Cash App/PayPal: "Complete Your Payment" with deep link button that opens the app pre-filled with amount + order number
   - Order summary with subtotal, buyer fee (6.5%), small order fee (if applicable), total
   - Warning: "Refunds for external payments handled directly between you and vendor"
4. Vendor receives `new_external_order` notification

#### Vendor Handling of External Orders
- Order appears with colored banner:
  - Cash: Blue banner — "Cash Order — Confirm You Can Fulfill This"
  - Venmo/CashApp/PayPal: Yellow banner — "Payment sent via [method] — Verify and confirm below"
- Vendor checks their payment app, then clicks "Confirm Payment Received"
- Order moves from `pending` → `paid` → normal fulfillment flow

#### 3.5% Vendor Fee Collection
- Formula: `subtotal × 0.035` (rounded)
- NOT auto-deducted from Stripe payouts
- Logged to `vendor_fee_ledger` table as debit entry
- Fees accumulate; vendor pays via Stripe Checkout when balance exceeds $50 or is 40+ days old
- Vendor sees balance on dashboard PaymentMethodsCard

#### Deep Links Generated
```
Venmo: https://venmo.com/{username}?txn=pay&amount={amount}&note=Order%20{number}
Cash App: https://cash.app/${cashtag}/{amount}
PayPal: https://paypal.me/{username}/{amount}USD
Cash: (no link, just instructions)
```

#### What the Legal Terms SHOULD Say
- Order is created BEFORE payment is verified — this is intentional
- Platform CANNOT process refunds for external payments — buyer must contact vendor directly
- Use "Platform-processed payments" instead of "electronic payments" (since Venmo etc. are also electronic)
- External payment methods include: cash, Venmo, Cash App, PayPal
- Vendor 3.5% fee is invoiced and collected separately, not deducted from payouts

---

### Finding 5: Refund / Cancellation Flow
**REVIEWED — Previous draft Section 4.4 had several inaccuracies**

#### Actual Cancellation Rules

**Cancellable statuses:** `pending`, `confirmed`, `ready`
**NOT cancellable:** `fulfilled`, `cancelled`, `refunded`

#### Grace Periods (hardcoded per vertical, NOT "at platform's discretion")
- **Farmers Marketing:** 1 hour from order creation
- **Food Trucks:** 15 minutes from order creation
- **Fireworks:** 1 hour (default)

#### The 25% Cancellation Fee — When It Applies
Applied ONLY when BOTH conditions are true:
1. Grace period has expired
2. AND vendor has confirmed the order (status = `confirmed` or `ready`)

If EITHER condition is false → full refund, no fee.

#### Full Refund Scenarios (No Fee)
1. Within grace period — regardless of vendor status
2. After grace period BUT vendor hasn't confirmed yet (status still `pending`)
3. Vendor rejects the order (always full refund including buyer fees)
4. Vendor initiates refund for reported issue (refunds subtotal only — NOTE: buyer fees NOT refunded in this path, potential discrepancy)

#### 25% Fee Calculation
```
buyerPaidForItem = subtotal + round(subtotal × 0.065) + round($0.15 / totalItems)
cancellationFee = round(buyerPaidForItem × 0.25)
buyerRefund = buyerPaidForItem - cancellationFee
vendorShare = cancellationFee - platformApplicationFee (13% of cancellation fee)
```

#### Key Facts for Legal Terms
- The fee is EXACTLY 25% (not "up to 25%" — no vendor override in code)
- `cutoff_hours` is for ORDER PLACEMENT cutoffs, NOT cancellation eligibility
- Buyer fees (6.5% + prorated $0.15) ARE included in the refund base for cancellation fee calculation
- Vendor cancellation rate tracked: warning at 10%+ after 10+ orders
- Market box orders: no cancel path exists in code (non-cancellable by design)
- Stripe refund uses deterministic idempotency key: `refund-{paymentIntentId}-{amount}`

#### What the Legal Terms SHOULD Say
- Specify exact grace periods (1 hour FM, 15 minutes FT) — NOT "brief" or "at discretion"
- Say "25% cancellation fee" not "up to 25%"
- Clarify: full refund if cancelled within grace period OR before vendor confirms
- Clarify: 25% fee only if BOTH grace period expired AND vendor confirmed
- Clarify: vendor-initiated rejections always result in full refund
- Don't reference `cutoff_hours` in cancellation language — it only affects ORDER PLACEMENT
- Market boxes are non-refundable after purchase

---

### Finding 6: Vendor Onboarding Gates
**REVIEWED — Detailed for Tier 2/3 placement decisions**

#### The 4 Gates

**Gate 1: Business Verification** — Upload business formation documents (license, DBA, LLC articles). Admin reviews and approves.

**Gate 2: Category Authorization / Required Permits** — Per-category permits for FM (homemade goods, dairy, honey). Flat permit list for FT (food handler card, MFU permit, CFM certificate, fire safety certificate). Admin reviews.

**Gate 3: Market Ready (Insurance)** — Upload Certificate of Insurance (COI). Admin reviews.

**Gate 4: Payment Setup (Stripe Connect)** — Connect bank account via Stripe. Auto-verified when `stripe_payouts_enabled = true`.

**Additional step:** Prohibited Items Acknowledgment (before submitting for approval). Timestamp stored.

#### Vendor Status Progression
`draft` → `submitted` → `approved` (auto-grants trial) OR `rejected`
After approval: can be `suspended` by admin

#### 5 Mandatory Signup Acknowledgments (already exist in signup form)
1. Locally produced/freshly prepared products
2. Independent business status + regulatory compliance
3. Product safety responsibility + permits
4. Platform is marketplace only + indemnification
5. Honesty, legality, transparency + misrepresentation = termination

#### Where Tier 2 & 3 Fit
**Tier 2 (Vendor Service Agreement):** After Gate 1, before Gate 2. Modal/checkbox with full agreement. Store `service_agreement_accepted_at` in `vendor_verifications`.

**Tier 3 (Vendor Partner Agreement):** After all 4 gates approved, before vendor can publish listings. Block publishing until signed. Store `partner_agreement_accepted_at` in `vendor_profiles`.

**Database migration needed:** `user_agreement_acceptances` table (already designed in first draft).

---

### Finding 7: Subscription / Trial System
**REVIEWED (from MEMORY.md + prior sessions)**

#### Subscription Tiers by Vertical
**Farmers Marketing:**
- Standard (free) — default
- Premium ($24.99/mo via Stripe)

**Food Trucks:**
- Free — default
- Basic ($10/mo)
- Pro ($30/mo)
- Boss ($50/mo)

#### Trial System (FT only, currently)
- Auto-granted when admin approves vendor
- 90 days of Basic tier ($10/mo value = $30 total value)
- `subscription_status = 'trialing'`
- Columns: `trial_started_at`, `trial_ends_at`, `trial_grace_ends_at`
- Grace period: 14 days after trial expires
- During grace: yellow banner on dashboard, features still available
- After grace: excess listings → draft, market boxes → inactive, downgrade to free
- Cron Phase 10 handles lifecycle (reminders at 14d/7d/3d, expiry, grace expiry)

#### Tier Limits (from `src/lib/vendor-limits.ts`)
Controls: product listings, market locations, schedule slots, market box access, subscriber caps

#### What the Legal Terms SHOULD Say
- Trial is complimentary, not guaranteed — "at Company's sole discretion"
- Trial has quantifiable economic value (state the subscription rate)
- No obligation to subscribe after trial
- Account reverts to free-tier features and limits upon trial expiry
- Grace period language: "a brief transition period during which features remain accessible"

---

### Finding 8: Account Termination & Deletion
**REVIEWED — Critical for terms accuracy**

#### User Self-Service Deletion
- Available in `/{vertical}/settings` → DeleteAccountSection
- 2-step confirmation: click button → type email to confirm
- Soft-delete approach:
  - `display_name` → "Deleted User"
  - `email` → NULL
  - `deleted_at` → timestamp
  - Vendor profiles: `status → 'deleted'`, business_name → "Deleted Vendor"
  - Listings: `deleted_at` set
  - Market boxes: `active → false`
- Auth user NOT fully deleted (needs admin background job)
- Rate limited: 3/hour

#### Company Termination of Vendors
Admin can:
- **Approve** → triggers trial, notifications
- **Reject** → with optional reason, notification sent
- **Suspend** → direct status update, listings hidden, NO notification sent to vendor
- **Reactivate** → status back to approved

**On suspension:**
- Listings remain in DB but hidden from buyers
- Market boxes NOT auto-deactivated
- Existing confirmed orders still proceed
- Payouts NOT blocked
- No vendor notification (gap in the code)

#### What the Legal Terms SHOULD Say
- Company can suspend/terminate "at any time, with or without cause, upon notice" (even though notification isn't implemented yet — terms should require it)
- Suspension hides vendor from marketplace but preserves data
- Account deletion is self-service with soft-delete (anonymized, not purged)
- Certain data retained per retention policy (transaction records for 7+ years for tax/legal)
- Surviving obligations (confidentiality, non-compete) persist after deletion

---

### Finding 9: Payout System
**REVIEWED (from MEMORY.md + prior sessions)**

#### How Vendor Payouts Work
- Stripe Connect used for all vendor payouts
- Payout happens per-item at fulfillment (when vendor marks item as fulfilled)
- Vendor receives: `base_price - vendor_fee(6.5%) - prorated_flat_fee($0.15/totalItems) + vendor_tip_share`
- Stripe transfer uses `transferToVendor()` with deterministic idempotency key
- Double-payout prevention: checks `vendor_payouts` table before initiating
- If Stripe transfer fails after DB update, status reverted in catch block

#### Market Box Payouts
- Different from regular orders
- Payout happens at CHECKOUT (not per-pickup)
- Full prepaid vendor payout when buyer purchases
- `base_price_cents` stored in Stripe metadata for reliable calculation
- Migration 059 added `market_box_subscription_id` column

#### External Payment "Payouts"
- No Stripe payout for external payments (vendor already has the money)
- Platform collects the 3.5% fee via fee ledger → Stripe Checkout invoice
- Vendor must separately pay accumulated fees

#### What the Legal Terms SHOULD Say
- Vendor payouts processed upon order fulfillment confirmation
- Payout = order amount minus applicable vendor service fees
- Prepaid offerings: vendor receives payout upon buyer's initial purchase, not per-delivery
- External payments: vendor collects directly; platform invoices applicable fees separately
- Platform not responsible for Stripe Connect account issues

---

### Finding 10: Push Notifications / SMS
**REVIEWED (from MEMORY.md + prior sessions)**

#### Notification Channels
1. **In-app** — always (writes to `notifications` table)
2. **Push** — Web Push API with VAPID keys (browser permission required)
3. **Email** — Resend (both domains verified: mail.farmersmarketing.app, mail.foodtruckn.app)
4. **SMS** — Twilio (A2P 10DLC registration PENDING carrier approval — may not be active yet)

#### Channel Priority
- When push_enabled, SMS auto-skipped (service.ts logic)
- In-app always fires regardless of other channels
- Email sends for most notification types

#### Opt-Out Mechanisms
- `notification_preferences` in `user_profiles` — users can disable push/SMS/email
- SMS: Reply STOP to opt out
- Push: Browser permission revocation
- Email: can be disabled in settings (but transactional emails like order confirmations may still send)

#### 26+ Notification Types
All one-directional, inform-only. No reply mechanism.

#### What the Legal Terms SHOULD Say
- Platform sends notifications via in-app, email, push, and SMS (when available)
- SMS: consent obtained at account creation/opt-in. Not a condition of purchase.
- Message frequency varies with order activity
- Opt-out available via settings, STOP reply, or browser settings
- Be honest about SMS: "SMS notifications may be available pending carrier authorization" or simply "when enabled"
- Standard carrier charges may apply
- Don't overclaim SMS capability if A2P 10DLC isn't approved yet

---

## COMPILED INACCURACIES IN FIRST DRAFT (`docs/Legal_Terms_Attorney_Ready.md`)

This is a quick-reference list of every section in the first draft that needs correction, mapped to the finding that explains why.

### Document 1: Platform User Agreement

| Section | Issue | Finding # |
|---------|-------|-----------|
| **Header** | Says "815 Enterprises LLC" — should be DBA only, LLC details lower | User Correction 1 |
| **Header** | Lists both farmersmarketing.app AND foodtruckn.app — should be per-vertical | User Correction 2 |
| **Art. 1** | Leads with "Establishment of Business Relationship" — move lower | User Correction 3 |
| **Art. 1.3** | "may be revoked for violation of these terms" — too narrow, need at-will | User Correction 4 |
| **Art. 3.2(d)** | "Communicate promptly through the Platform" — no messaging system | Finding 3 |
| **Art. 3.3(c)** | Disclaims liability only for external payments — implies liable for Stripe | User Correction 8 |
| **Art. 4.1** | "All electronic payments are processed through Stripe" — Venmo/CashApp are also electronic | User Correction 9 |
| **Art. 4.2(c)** | "Fee rates are displayed transparently at checkout" — 6.5% is NOT displayed | User Correction 5, Finding 1 |
| **Art. 4.4** | "up to 25%" — it's exactly 25%. Grace period is specific, not "at discretion" | Finding 5 |
| **Art. 4.5** | "Company does not retain any portion of tips" — FALSE, retains tip on platform fee | User Correction 6, Finding 2 |
| **Art. 10** | Entire "Multi-Vertical Platform" article — reveals multi-vertical structure | User Correction 2 |
| **Art. 11** | SMS terms may overclaim — A2P 10DLC pending | Finding 10 |

### Document 2: Vendor Service Agreement

| Section | Issue | Finding # |
|---------|-------|-----------|
| **Header** | Same entity/multi-vertical issues | User Corrections 1, 2 |
| **Art. 2.3(d)** | "Communicating promptly with shoppers" — no direct communication | Finding 3 |
| **Art. 2.4** | "Platform facilitates communication" — it doesn't | Finding 3 |
| **Art. 3.1(d)** | "Current fee rates are displayed in your vendor dashboard" — verify this is accurate | Finding 1 |
| **Art. 3.4** | Trial language is sound but should specify exact trial terms by vertical | Finding 7 |

### Document 3: Vendor Partner Agreement

| Section | Issue | Finding # |
|---------|-------|-----------|
| **Header** | Same entity issues | User Correction 1 |
| **Art. 3.1(c)(iii)** | External payment fee "remitting" language — fees are invoiced via fee ledger, not remitted directly | Finding 4 |
| **Art. 3.1(d)** | Vendor should not "independently advertise" external payment — verify what's actually restricted | Finding 4 |

### Document 4: Privacy Policy

| Section | Issue | Finding # |
|---------|-------|-----------|
| **Header** | Lists both domains | User Correction 2 |
| **Section 1.1(e)** | "Communications: Messages sent through the Platform" — no messaging system | Finding 3 |

---

## ACTION PLAN FOR NEXT SESSION

### Step 1: Read This File First
Read `apps/web/.claude/legal_terms_reference.md` (this file) completely before touching any legal documents.

### Step 2: Read the Existing Draft
Read `docs/Legal_Terms_Attorney_Ready.md` to understand the current structure.

### Step 3: Restructure Per User Feedback
Apply these structural changes:
1. **Per-vertical separation** — Create FM-specific and FT-specific versions (or use placeholder variables)
2. **Move Article 1 (Business Relationship) lower** — Lead with standard T&C
3. **Move entity identification lower** — Use DBA "815 Enterprises" upfront, LLC details buried
4. **Remove Article 10 (Multi-Vertical)** — Don't reveal multi-vertical architecture
5. **Add at-will termination language** — Company can terminate at sole discretion

### Step 4: Fix All Inaccurate Sections
Use the "Compiled Inaccuracies" table above. For each one:
1. Read the referenced Finding for exact mechanics
2. Rewrite the section to match the code
3. Verify the new language doesn't introduce other inaccuracies

### Step 5: Verify Against Code
For any claim in the terms about how something works, check:
- Does the code actually do this?
- Is there a UI element that shows/hides this?
- Is the terminology right? ("Platform-processed" not "electronic", etc.)

### Step 6: Produce Final Draft
Write updated `docs/Legal_Terms_Attorney_Ready.md` with all corrections.
The attorney should be able to read it and make targeted edits, not rewrite it.

### Documents the Next Session Needs

| Priority | Document | Path | Why |
|----------|----------|------|-----|
| 1 | **This reference file** | `apps/web/.claude/legal_terms_reference.md` | All corrections + findings |
| 2 | **First draft T&C** | `docs/Legal_Terms_Attorney_Ready.md` | Starting point to edit |
| 3 | **Strategy doc** | `docs/Legal_Strategy_Layered_Business_Relationships.md` | Tier framework |
| 4 | **Current task** | `apps/web/.claude/current_task.md` | Reference data |
| 5 | **Pricing source** | `src/lib/pricing.ts` | Fee calculations (spot-check) |
| 6 | **Constants** | `src/lib/constants.ts` | Fee percentages |
| 7 | **Checkout page** | `src/app/[vertical]/checkout/page.tsx` | What buyer actually sees |
| 8 | **Vendor signup** | `src/app/[vertical]/vendor-signup/page.tsx` | 5 acknowledgments text |
| 9 | **Existing terms page** | `src/app/[vertical]/terms/page.tsx` | What's currently deployed |

---

## TERMINOLOGY GUIDE

Use these terms consistently in the legal documents:

| Concept | USE | DON'T USE |
|---------|-----|-----------|
| Card payments through Stripe | "Platform-processed payments" | "Electronic payments" (Venmo is also electronic) |
| Cash/Venmo/CashApp/PayPal | "External payments" or "Direct payments" | "Non-electronic" |
| The 6.5% buyer fee | "Buyer service fee" | "Platform fee" (too vague) |
| The $0.15 flat fee | "Order service fee" | "Transaction fee" |
| The 6.5% vendor fee | "Vendor service fee" (Tier 2+ only) | Don't mention in buyer terms |
| The 3.5% external fee | "External payment vendor fee" (Tier 2+ only) | Don't mention in buyer terms |
| Order management actions | "Order management tools" | "Communication" |
| Issue reporting | "Issue reporting system" | "Dispute resolution" (implies mediation) |
| 815 Enterprises | "the Company" (first mention: DBA only) | "815 Enterprises LLC" (save for lower section) |
| Tip handling | "Vendor receives tip on product cost; processing portion retained" | "Tips go directly to vendor" (not fully accurate) |

---

## ADDITIONAL FINDINGS (Gap Review — Session 2)

These findings cover areas NOT in the original 10 findings but required for accurate legal documents.

### Finding 11: Data Collection & Privacy (ACTUAL practices)

#### Cookies
- **Only 1 cookie**: `user_location` — httpOnly, 30-day TTL, contains lat/lng/radius/locationText/source
- No tracking cookies, no advertising cookies, no third-party cookies

#### Analytics & Tracking
- **NO third-party analytics** — no Google Analytics, Plausible, PostHog, Mixpanel
- Internal analytics only:
  - `buyer_search_log`: ZIP, vertical, results count (anonymized — no user_id)
  - `public_activity_events`: vendor name, item name, city (expires 7 days)
  - `vendor_activity_scan_log`: nightly quality checks
- No pixel tracking, no click tracking, no page view duration tracking

#### Location Data Collection (3 methods)
1. **Browser GPS**: `navigator.geolocation.getCurrentPosition()` — requires browser permission
2. **Manual ZIP entry**: Geocoded via Census API → Nominatim → static lookup (fallbacks)
3. **Reverse geocoding**: Nominatim/OpenStreetMap — receives lat/lng only, no user ID
- Stored in: `user_location` cookie + `user_profiles.preferred_latitude/longitude` (if authenticated)

#### Third-Party Services That Receive User Data
| Service | Data Sent | Purpose |
|---------|-----------|---------|
| **Stripe** | Email, order amount, fees, metadata (order_id, vendor_id) | Payment processing, payouts |
| **Resend** | Email address, order details, user name | Transactional email delivery |
| **Twilio** | Phone number, message content | SMS notifications (A2P 10DLC pending) |
| **Supabase** | All user/vendor/order data | Database + auth + file storage |
| **Vercel** | Server logs, IP | Hosting |
| **Sentry** | Error message, stack trace, user_id (optional), route | Error monitoring (only if DSN configured) |
| **Census API** | ZIP code only | Geocoding (no user identity) |
| **Nominatim/OSM** | Lat/lng only | Reverse geocoding (no user identity) |

#### Image Storage
- **Supabase Storage buckets** — ALL public URLs
- `listing-images`: listings + market boxes (JPEG/WebP, 1MB max, 1200px compressed)
- `vendor-images`: profile photos (JPEG/PNG/GIF/WebP, 2MB max)
- `vendor-documents`: COI, permits, licenses (PDF/JPEG/PNG, 10MB max)
- **No content moderation** — no scanning, filtering, or automated review
- Cache: 1-year cache control on listing images

#### What's NOT Stored Locally
- Full credit card numbers (Stripe handles)
- CVV codes, card expiration dates
- Biometric data (none collected)

#### Data Export
- **No data export endpoint exists** — no GDPR subject access request mechanism
- Admin can manually query Supabase dashboard

#### Audit Logging
- `audit_log`: table changes with old/new data, IP address, user_agent
- `admin_activity_log`: admin actions with target user + details
- `error_logs`: error_code, message, context, breadcrumbs, user_id, route, severity
- **No automatic purge** — data stays indefinitely unless Cron Phase 9 cleans (error_logs 90d, notifications 60d, activity_events 30d)

#### Privacy Policy Implications
- Cookie section should be minimal (1 essential cookie only)
- No advertising/tracking section needed
- Third-party sharing section must list ALL 8 services above
- Location is OPTIONAL — users can browse without providing it
- Phone is OPTIONAL — not required for signup
- Soft deletes mean data persists (anonymized) after account deletion
- Payment records retained 7+ years for tax/legal compliance

---

### Finding 12: Prohibited Items, Age, Content, Market Boxes, Quality, Geography

#### Prohibited Items (actual lists from `src/lib/onboarding/category-requirements.ts`)

**Farmers Marketing (10 items):**
1. Controlled substances (including THC/CBD regardless of legal status)
2. Firearms & ammunition (including accessories)
3. Explosives & fireworks
4. Tobacco & nicotine products
5. Alcohol
6. Raw (unpasteurized) milk
7. Live animals
8. Recalled or adulterated products
9. Resale or wholesale items (not vendor-produced)
10. Counterfeit or trademarked goods

**Food Trucks (8 items):**
1. Controlled substances (including THC/CBD)
2. Firearms & ammunition
3. Explosives & fireworks
4. Tobacco & nicotine products
5. Alcohol (unless properly licensed)
6. Food from non-inspected sources (must be vendor-prepared or approved commissary)
7. Recalled or adulterated products
8. Counterfeit or trademarked goods

- Shown via `ProhibitedItemsModal.tsx` during vendor signup
- Vendor must click "I Acknowledge This Policy"
- Timestamp stored in `vendor_verifications.prohibited_items_acknowledged_at`

#### Age Verification
- **NO age verification system exists** — no birthdate fields, no age checks, no "must be 18" checkboxes
- Buyers authenticate with email/password only (Supabase Auth)
- Vendors acknowledge legal compliance generically, not age-specifically
- **Legal terms should NOT claim we verify age** — we don't

#### User Content / Image License
- No terms in code explicitly grant platform a license to use uploaded images
- Images stored in public Supabase buckets — accessible by URL to anyone
- **No content moderation** — no automated scanning, no user flagging mechanism
- Legal terms should include a content license grant + right to remove

#### Market Box / Chef Box Full Lifecycle
- Buyer purchases prepaid multi-week offering (1, 4, or 8 weeks)
- Payment: full amount upfront via Stripe (6.5% buyer fee + $0.15)
- Vendor payout: at checkout (not per-pickup) — Migration 059
- Weekly pickups auto-generated as `market_box_pickups` records
- **FM can skip weeks** (extends subscription +1 week). **FT cannot skip.**
- Mutual confirmation: vendor marks ready → buyer confirms pickup → 30-sec window
- Missed pickups: marked `missed` by cron Phase 4.7 (2+ days past scheduled_date)
- **No explicit cancellation endpoint found** — terms say non-refundable, code doesn't contradict
- No automatic refund for vendor-missed deliveries

#### Vendor Quality Scoring
- **Not a score** — it's an alert system with 5 nightly checks
- Checks: schedule conflict, low stock + event, price anomaly, ghost listing, inventory velocity
- Severity levels: action_required, heads_up, suggestion
- **Non-punitive** — alerts only, no tier demotion, no public score
- Vendor can dismiss findings (7-day cooldown before re-alert)
- Described as "trade secret" in Tier 3 but it's really just alerts, not an algorithm

#### Geographic Restrictions
- **De facto US-only** (all geocoding APIs assume US ZIP codes, Census Bureau API)
- **No explicit enforcement code** — no country validation, no state whitelist
- ZIP input validated as 5 digits only
- Legal terms can say "designed to operate within the United States" — accurate

---

### Finding 13: Complete Order Lifecycle

#### Order-Level Statuses
`pending` → `paid` → `confirmed` → `ready` → `completed` → OR `cancelled` → `refunded`

#### Order-Item-Level Statuses (where real workflow happens)
`pending` → `confirmed` → `ready` → `fulfilled` → (order completes)
OR at any point: → `cancelled` → `refunded`

#### Normal Flow
1. **Pending**: Item created at checkout. Vendor has until `expires_at` to confirm.
2. **Confirmed**: Vendor accepted. Can mark ready.
3. **Ready**: Vendor prepared item. Awaiting buyer pickup.
4. **Fulfilled**: Both buyer + vendor confirmed handoff. Payout triggered.
5. **Completed**: All items fulfilled → `atomic_complete_order_if_ready()` fires.

#### 30-Second Mutual Confirmation Window
- Buyer clicks "Acknowledge Receipt" → `buyer_confirmed_at` set
- `confirmation_window_expires_at` = NOW + 30 seconds
- Vendor must click "Confirm Handoff" within 30 seconds
- If window expires → Cron Phase 7 auto-fulfills (buyer already acknowledged)

#### Auto-Expiry Rules (Cron Phase 1)
- **Food Trucks**: 24 hours from order creation
- **Farmers Marketing**: 24 hours after market pickup window start time (or 7 days if no pickup_date)
- Expired items: full refund, inventory restored, buyer notified

#### Buyer Rights by Stage
| Stage | Cancel | Report Issue | Rate | Pickup |
|-------|--------|-------------|------|--------|
| Pending | Yes (full refund) | No | No | No |
| Confirmed | Yes (grace period rules) | No | No | No |
| Ready | Yes (grace period rules) | No | No | No |
| Fulfilled | No | Yes | Yes | Yes |

#### Vendor Rights by Stage
| Stage | Confirm | Mark Ready | Fulfill | Reject |
|-------|---------|-----------|---------|--------|
| Pending | Yes | No | No | Yes (full refund) |
| Confirmed | — | Yes | No | Yes (full refund) |
| Ready | — | — | Yes (handoff) | Yes (full refund) |
| Fulfilled | — | — | — | No |

#### Cron Auto-Actions (daily ~6am CT)
- Phase 1: Expire unconfirmed items → refund
- Phase 2: Cancel abandoned Stripe checkouts (10+ min old)
- Phase 3: Auto-cancel expired external payment orders
- Phase 3.5: Reminder to vendors for unconfirmed external orders (2+ hrs)
- Phase 3.6: Auto-confirm external orders 24h past pickup
- Phase 4: Notify buyer of missed pickup
- Phase 4.5: Warn about stale confirmed items
- Phase 4.7: Mark market box pickups as missed (2+ days late)
- Phase 5: Retry failed vendor payouts
- Phase 7: Auto-fulfill items where buyer confirmed but vendor didn't (window expired)
- Phase 9: Data retention cleanup (error_logs 90d, notifications 60d, activity_events 30d)
- Phase 10: Trial lifecycle (reminders, expiry, grace, auto-unpublish)

#### Key Legal Implications
- Mutual confirmation required before payout processes
- Auto-expiry protects buyers from unresponsive vendors
- Vendor reliability tracked (10%+ cancellation rate → warning)
- Inventory always restored on any cancellation path
- External payment refunds are NOT platform-processed (buyer contacts vendor directly)

