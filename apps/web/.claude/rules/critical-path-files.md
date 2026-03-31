# RULE: Critical Path File Protection

**Priority: ABSOLUTE — This rule applies before ANY edit to the files listed below.**

## What This Is

These files handle money, inventory, and order fulfillment. A bug in any of them causes direct financial harm to real vendors and buyers. They are tested, proven, and working. The risk of modifying them is categorically higher than modifying any other file in the codebase.

## The Protected Files

| File | Why It's Critical |
|------|------------------|
| `src/app/api/cart/items/route.ts` | Every item added to every cart flows through this file. A silent failure means buyers think they ordered but didn't. |
| `src/app/api/cart/items/[id]/route.ts` | Cart item updates and deletions. |
| `src/app/api/cart/validate/route.ts` | Pre-checkout validation. If it false-passes, bad orders reach Stripe. |
| `src/app/api/checkout/session/route.ts` | Creates Stripe checkout sessions. Handles inventory decrement. Errors here mean double-charges, lost inventory, or failed orders. |
| `src/app/api/checkout/success/route.ts` | Post-payment order creation. If this fails, Stripe charged the buyer but no order exists. |
| `src/app/api/checkout/external/route.ts` | External payment checkout. Same financial risk as session route. |
| `src/lib/stripe/payments.ts` | Stripe transfer and refund logic. Wrong math = vendors get wrong payout. |
| `src/lib/stripe/webhooks.ts` | Processes Stripe webhook events. Missed or mishandled events = payments not recorded. |
| `src/app/api/vendor/orders/[id]/reject/route.ts` | Refund + inventory restore. Errors mean buyer not refunded or inventory not restored. |
| `src/app/api/vendor/orders/[id]/fulfill/route.ts` | Triggers vendor payout. Errors mean vendor doesn't get paid. |
| `src/app/api/vendor/payouts/route.ts` | Vendor payout initiation. Double-payout prevention lives here. |
| `src/lib/pricing.ts` | Fee calculations. Every cent displayed and charged comes from this file. |
| `src/lib/vendor-limits.ts` | Tier limits and subscriber caps. Controls what vendors can do. |

## The Mechanical Gate

Before opening Edit or Write on ANY file in this list:

1. **Name the file explicitly in your message.** Not "I'll update the cart" — the exact path: `src/app/api/cart/items/route.ts`.
2. **State the risk.** One sentence: what breaks if this change has a bug. Example: "If this fails silently, items won't be added to the cart but the UI will show success."
3. **Show the exact lines you will change.** Not a summary — the actual before/after diff.
4. **Wait for explicit approval referencing the file.** "Yes, modify cart/items" counts. "Yes, proceed with the design" does NOT — design approval is not file-level approval.

All four steps. Every time. No exceptions.

## Why This Exists

In Session 66, Claude added 60 lines of event order cap enforcement to `cart/items/route.ts`. The design was approved, but modifying this specific file was never called out. The change broke the entire cart — items were not being saved. The user discovered it in production. Zero items in `cart_items` after multiple add-to-cart attempts that showed success messages.

The root cause was not the code logic — it was the decision to put new code inside a critical path file without flagging the elevated risk. The cart API had been working. The change was unnecessary in that location. A separate validation endpoint would have achieved the same result without touching proven infrastructure.

**Design approval ≠ file-level approval.** Approving "enforce order caps at cart-add time" does not authorize modifying `cart/items/route.ts`. The WHERE matters as much as the WHAT.

## When New Features Need Critical Path Changes

Sometimes a feature genuinely requires modifying a critical path file. When that happens:

1. **Say so explicitly:** "This feature requires modifying `cart/items/route.ts` because [specific reason why it can't live elsewhere]."
2. **Propose alternatives first:** Can it be a separate endpoint? A pre-check? A database trigger? A middleware? Exhaust non-critical-path options before proposing a critical-path change.
3. **If it must be in the critical path:** Show the minimal change, explain the risk, and wait for file-specific approval.

## This Rule Cannot Be Overridden

No autonomy mode, no time pressure, no "it's just a query" justification. These files are protected because they handle money. A vendor's family depends on payouts being correct. A buyer's trust depends on their cart working. The cost of caution is seconds of conversation. The cost of a bug is real financial harm.
