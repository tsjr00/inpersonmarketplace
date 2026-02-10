# Stripe Integration - Questions for CC

**Date:** January 27, 2026  
**From:** Chet (Claude Chat)  
**To:** CC (Claude Code)  
**Purpose:** Establish shared understanding before Tracy configures Stripe account

---

## 🎯 GOAL

Tracy has an existing Stripe account from a prior project. She wants to configure it for BuildApp/farmersmarketing.app. I need to understand exactly how our payment flows work so I can advise her on proper Stripe setup.

---

## 📋 BACKGROUND CONTEXT I HAVE

**From memory/summaries:**
- Platform uses Stripe Connect for vendor payouts
- Platform fee: 6.5% added to buyer-facing prices
- Order flow: Pending → Confirmed → Ready → Handed Off → Fulfilled (buyer confirms)
- Two product types: Regular listings + Market Box subscriptions
- Vendor tiers: Standard, Premium
- Buyer tiers: Free, Premium
- Pickup location selection per item
- Cutoff times before market day

**What I need to confirm:**

---

## 1️⃣ STRIPE CONNECT IMPLEMENTATION

### Current Status
**Q1.1:** Is Stripe Connect currently implemented in the codebase?  
- If yes, which integration type? (Standard, Express, Custom)
- Which files contain the Connect integration?

**Q1.2:** Do vendors onboard through Stripe Connect?  
- Where is the onboarding flow? (URL/component)
- Do we create Connected Accounts automatically or manually?

**Q1.3:** Are vendor payouts automated or manual?  
- If automated, what triggers a payout?
- If manual, what's the admin workflow?

---

## 2️⃣ PAYMENT FLOW - ONE-TIME PURCHASES

### Checkout Process
**Q2.1:** When buyer checks out, what happens in Stripe?
- Do we create a Payment Intent immediately?
- Do we create a Charge?
- Do we use Checkout Sessions?

**Q2.2:** What is the exact payment flow step-by-step?

Example flow to confirm:
```
1. Buyer clicks "Checkout"
2. We create Stripe Checkout Session (or Payment Intent?)
3. Buyer completes payment
4. Money goes where? (Platform account? Held? Direct to vendor?)
5. Vendor confirms order ready
6. Buyer picks up and confirms
7. We trigger payout to vendor
8. Platform fee is taken how/when?
```

**Q2.3:** Are payments captured immediately or on authorization + capture?

**Q2.4:** Where is payment held before vendor fulfillment?
- In platform Stripe account?
- In escrow?
- Direct to vendor Connect account?

### Multi-Vendor Orders
**Q2.5:** When a buyer orders from 3 vendors in one checkout, what happens?
- One Stripe session with 3 line items?
- Three separate Stripe sessions?
- How do we split the payment?

### Platform Fee Collection
**Q2.6:** How is the 6.5% platform fee collected?
- Application fee on Connect charge?
- Separate charge to buyer?
- Taken from vendor payout?

**Q2.7:** The 6.5% is added to buyer price, right? (Not taken from vendor amount)
- Example: Vendor sets $10 → Buyer pays $10.65 → Vendor gets $10, Platform gets $0.65?
- Or different math?

---

## 3️⃣ PAYOUTS TO VENDORS

### Payout Timing
**Q3.1:** When exactly does vendor get paid?
- Immediately after buyer confirms pickup?
- On a schedule (daily, weekly)?
- Manual admin trigger?

**Q3.2:** What triggers the payout?
- API call when buyer clicks "Confirm Pickup"?
- Cron job that checks fulfilled orders?
- Admin approval required?

**Q3.3:** Which API endpoint handles payouts?
- File path?
- Does it create Stripe Transfer or Payout?

### Payout Records
**Q3.4:** Do we store payout records in our database?
- Table name?
- What columns?
- Do we reconcile with Stripe?

**Q3.5:** Can vendors see their payout history?
- URL/component?
- Do we show pending vs completed?

---

## 4️⃣ MARKET BOX SUBSCRIPTIONS

### Stripe Product Type
**Q4.1:** Are Market Boxes set up as Stripe Subscriptions?
- If yes, do we create Subscription objects?
- If no, how are they billed?

**Q4.2:** Which billing intervals are supported?
- Weekly, Biweekly, Monthly (from context)
- Do these map to Stripe's standard intervals?
- Or custom billing logic?

### Subscription Flow
**Q4.3:** When buyer subscribes to a Market Box, what happens?

Example flow to confirm:
```
1. Buyer clicks "Subscribe"
2. We create Stripe Subscription with interval (weekly/biweekly/monthly)
3. First payment happens when?
4. Recurring payments happen automatically?
5. Vendor gets paid when? (per delivery or monthly?)
```

**Q4.4:** Are subscription payments handled differently than one-time?
- Same platform fee (6.5%)?
- Same payout timing?

**Q4.5:** Can buyers cancel subscriptions?
- Where? (URL/component)
- Do we cancel in Stripe automatically?
- Proration handling?

### Subscription Deliveries
**Q4.6:** How do subscriptions translate to pickup events?
- Does each billing cycle create an order?
- Or are they separate "fulfillments"?
- Table: `fulfillments`?

**Q4.7:** If buyer misses a pickup, what happens?
- Still charged?
- Credit/skip?
- Vendor still paid?

---

## 5️⃣ REFUNDS & CANCELLATIONS

### Buyer Cancellations
**Q5.1:** Can buyers cancel orders before pickup?
- Where? (URL/component)
- Before which status? (Before confirmed? Before ready?)

**Q5.2:** When buyer cancels, what happens in Stripe?
- Full refund?
- Partial refund (platform keeps fee)?
- Who initiates the Stripe refund?

**Q5.3:** If vendor already confirmed ready, can buyer still cancel?
- Different refund policy?
- Platform decision or vendor decision?

### Vendor-Initiated Actions
**Q5.4:** Can vendors cancel/refund orders?
- Where? (URL/component)
- What's the Stripe flow?

### Handling Disputes
**Q5.5:** If there's a dispute (wrong item, quality issue), who handles it?
- Platform or vendor?
- Do we have a dispute resolution flow?
- Stripe dispute webhooks implemented?

---

## 6️⃣ STRIPE CUSTOMERS

### Customer Creation
**Q6.1:** Do we create Stripe Customer objects?
- When? (At signup? First purchase?)
- Where in code?

**Q6.2:** Do we store Stripe customer_id in our database?
- Table? Column?

**Q6.3:** Do we save payment methods for repeat purchases?
- Or new payment each time?

---

## 7️⃣ WEBHOOKS

### Current Implementation
**Q7.1:** Are Stripe webhooks implemented?
- Webhook endpoint URL/file?
- Which events are we listening for?

**Q7.2:** Critical events we need:
- `payment_intent.succeeded`?
- `account.updated` (Connect accounts)?
- `transfer.created` (payouts)?
- `customer.subscription.updated`?
- Others?

**Q7.3:** How do we verify webhook signatures?
- Webhook secret stored where?

---

## 8️⃣ TEST MODE vs PRODUCTION

### Current State
**Q8.1:** Is the app currently using Stripe test mode?
- Test API keys in .env?
- Any production keys set up?

**Q8.2:** From recent summary: "Vendor fulfill now works without Stripe in development mode"
- Does this mean Stripe is optional in dev?
- What gets skipped?
- Status: 'skipped_dev' in payout records?

**Q8.3:** What needs to change to go from test → production?
- Just swap API keys?
- Webhook URLs?
- Connect account changes?

---

## 9️⃣ FEES & PRICING

### Stripe Fees
**Q9.1:** Who pays Stripe's processing fees (2.9% + 30¢)?
- Platform absorbs?
- Passed to buyer?
- Passed to vendor?

**Q9.2:** Example calculation:
- Vendor sets item at $10.00
- Platform adds 6.5% = $10.65 buyer pays
- Stripe takes 2.9% + $0.30 = ???
- Vendor receives: ???
- Platform receives: ???

Please provide exact math.

### Multi-Vendor Split
**Q9.3:** With 3 vendors in one order:
- Example: Vendor A $10, Vendor B $15, Vendor C $20
- With 6.5% fee: $10.65 + $15.98 + $21.30 = $47.93 total
- Stripe processing fee on $47.93 or per vendor?
- How is the $47.93 split in Stripe?

---

## 🔟 BUYER TIERS (PREMIUM)

### Premium Membership
**Q10.1:** Do buyer tiers affect payment flow?
- Different platform fee for premium buyers?
- Or unrelated to payments?

**Q10.2:** If premium buyer membership is paid:
- Is that a separate Stripe subscription?
- Or one-time payment?
- How is it set up?

---

## 1️⃣1️⃣ VENDOR TIERS (PREMIUM)

### Premium Vendor Membership
**Q11.1:** Do vendor tiers affect payment flow?
- Do premium vendors pay a membership fee?
- Is it Stripe-based?
- Different platform fee for premium vendors?

---

## 1️⃣2️⃣ ADMIN ACTIONS

### Manual Overrides
**Q12.1:** Can admins manually trigger payouts?
- URL/component?
- Which Stripe action does it call?

**Q12.2:** Can admins issue refunds on behalf of vendors?
- Where?
- Full control or limited?

**Q12.3:** Can admins see all Stripe transactions?
- Dashboard or reports?
- Which data is exposed?

---

## 1️⃣3️⃣ CURRENT BLOCKERS

### Implementation Gaps
**Q13.1:** What Stripe features are NOT yet implemented?
- List anything that's stubbed/mocked/TODO

**Q13.2:** What works in test mode but might break in production?
- Known issues?
- Areas needing testing?

**Q13.3:** Are there any Stripe-related errors in logs?
- Recent failures?
- Common issues?

---

## 1️⃣4️⃣ CONFIGURATION NEEDED

### Stripe Dashboard Setup
**Q14.1:** What does Tracy need to configure in her Stripe account?
- Products/Prices?
- Webhooks?
- Connect settings?
- Tax settings?

**Q14.2:** Are there any specific Stripe settings required?
- Radar rules?
- Fraud prevention?
- Payout schedule?

---

## 1️⃣5️⃣ ENVIRONMENT VARIABLES

### Required Keys
**Q15.1:** Which Stripe keys are required?
- `STRIPE_SECRET_KEY`?
- `STRIPE_PUBLISHABLE_KEY`?
- `STRIPE_WEBHOOK_SECRET`?
- `STRIPE_CONNECT_CLIENT_ID`?
- Others?

**Q15.2:** Where are these stored?
- `.env.local`?
- Vercel environment variables?
- Both?

---

## 📝 REQUEST FOR CC

**Please provide:**

1. **Answers to all questions above** (as detailed as possible)
2. **Current implementation status** (what's done, what's stubbed, what's missing)
3. **File paths** for key Stripe integration code
4. **Example flows** with actual code snippets where helpful
5. **Known issues or gotchas** with current Stripe setup
6. **Stripe dashboard setup checklist** (what Tracy needs to configure)

**Priority Questions:**
- Q2.2 (Payment flow step-by-step)
- Q3.1 (Payout timing)
- Q4.3 (Subscription flow)
- Q9.2 (Fee calculation example)
- Q14.1 (Stripe dashboard config needed)

---

## 🎯 NEXT STEPS

After CC answers:
1. I'll review and create a Stripe setup guide for Tracy
2. Tracy configures her Stripe account
3. We test end-to-end payment flows
4. We move to production when ready

---

**Thanks, CC! Take your time and be thorough - this is critical infrastructure.**
