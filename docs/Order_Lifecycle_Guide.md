# Order Lifecycle Guide

Complete step-by-step guide for buyers and vendors — from placing an order through pickup confirmation.

---

## Part 1: Regular Orders

### Buyer Side

#### Step 1: Place Your Order
1. Browse listings at your local market
2. Add items to your cart
3. Tap **Checkout** — you'll be redirected to the payment page
4. Complete payment through the secure Stripe checkout
5. After payment, you're redirected back to **My Orders** and your cart is cleared

**What you see:** Your order appears in the **"Order Placed"** section. The vendor has been notified.

#### Step 2: Wait for Vendor Confirmation
The vendor reviews your order and confirms they can fulfill it. No action needed from you.

**What you see:** Order moves to **"Confirmed"** — the vendor is preparing your items.

#### Step 3: Vendor Marks Ready
When the vendor has your items prepared and ready for pickup, they mark them as ready.

**What you see:** Order moves to **"Ready for Pickup"** with a green banner. Head to the market!

#### Step 4: Pickup at the Market
Go to the vendor's booth at the designated market, day, and time window shown on your order.

**At the booth — two scenarios:**

**Scenario A: You confirm first**
1. Tap **"Acknowledge Receipt"** on your order
2. A 30-second timer starts
3. Tell the vendor you're ready — they need to tap **"Fulfill"** on their end within 30 seconds
4. Once both sides confirm, the order is complete and the vendor receives payment

**Scenario B: Vendor confirms first**
1. The vendor taps **"Fulfill"** on their end — you'll see a notification
2. Tap **"Acknowledge Receipt"** to complete the handoff
3. The order is complete and the vendor receives payment

**If the 30-second window expires:** No problem. The timer resets and you can try again. Just tap Acknowledge Receipt again.

#### Step 5: Order Complete
Both you and the vendor confirmed the handoff. The order moves to **"Completed"**. Payment is transferred to the vendor.

---

### Vendor Side

#### Step 1: Receive the Order
A buyer places an order for your items. You receive a notification.

**What you see:** New order appears in your **Orders** dashboard with status **"Pending"**.

#### Step 2: Confirm the Order
Review the order details and tap **"Confirm"** to accept it.

**What happens:** Order status changes to **"Confirmed"**. The buyer is notified you're preparing their items.

#### Step 3: Mark Ready for Pickup
When you've prepared the items and they're ready at your booth, tap **"Mark Ready"**.

**What happens:** Order moves to **"Ready"**. The buyer sees a green "Ready for Pickup" banner.

#### Step 4: Handoff at the Market
When the buyer arrives at your booth:

**Scenario A: Buyer confirms first**
1. The buyer taps "Acknowledge Receipt" on their phone
2. You'll see a notification: **"Buyer acknowledged — Fulfill within 30 seconds!"**
3. Tap **"Fulfill"** within 30 seconds to complete the handoff
4. Payment is released to your account

**Scenario B: You confirm first**
1. Tap **"Fulfill"** on the order
2. The buyer needs to tap "Acknowledge Receipt" on their end
3. Once they do, the handoff is complete and payment is released

**If the 30-second window expires:** The buyer needs to acknowledge receipt again, then you fulfill. This prevents accidental confirmations when parties aren't together.

#### Step 5: Payment Received
After both parties confirm, the order is complete. The payment (minus platform fees) is transferred to your connected Stripe account.

---

### Why the 30-Second Confirmation Window?

The mutual confirmation ensures:
- **Both parties are physically present** — prevents accidental or premature confirmations
- **Accountability** — both buyer and vendor agree the handoff happened
- **Payment protection** — vendor payment is only released after confirmed mutual handoff

---

## Part 2: Market Box Orders (Pre-Paid Multi-Week Purchases)

Market boxes are prepaid for 4 or 8 weeks. You pay once upfront and receive a box each week at the market. Each weekly pickup uses the same mutual confirmation process.

### Buyer Side

#### Step 1: Purchase a Market Box
1. Browse market box offerings (filtered by market or vendor)
2. Select a box — you'll see the name, description, weekly schedule, and total price
3. Tap **"Subscribe"** — you'll be redirected to the payment page
4. Complete the one-time payment (this is NOT a recurring subscription)
5. After payment, your market box appears on **My Orders** with the **"Order Placed"** status

**What you see:** A teal "Market Box" badge, the offering name, "Week 0 of 4" progress, and your next pickup date.

#### Step 2: Weekly Cycle — Wait for Vendor
Each week, the vendor prepares your box. No action needed until they mark it ready.

**What you see:** Market box stays in the **"In Progress"** section showing your weekly progress (e.g., "Week 1 of 4").

#### Step 3: Weekly Cycle — Pickup Ready
When your box is ready, the vendor marks it as ready.

**What you see:** Your market box jumps to **"Ready for Pickup"** with a green banner: "Your market box is ready for pickup!"

#### Step 4: Weekly Cycle — Pickup at the Market
Go to the vendor's booth during the pickup time window.

**At the booth — same mutual confirmation as regular orders:**

**Scenario A: You confirm first**
1. Open your market box subscription detail page
2. Find this week's pickup and tap **"Confirm Pickup"**
3. A 30-second timer starts — tell the vendor to confirm on their end
4. Once both sides confirm within 30 seconds, the pickup is complete
5. Your progress updates (e.g., "Week 2 of 4")

**Scenario B: Vendor confirms first**
1. The vendor taps "Confirm Handoff" on their end
2. You'll see an orange **"Vendor is waiting — Confirm Now!"** button
3. Tap it within 30 seconds to complete the pickup
4. Your progress updates

**If the 30-second window expires:** The timer resets. Either party can start the confirmation again.

#### Step 5: Repeat Each Week
Steps 2-4 repeat every week until all pickups are fulfilled.

#### Step 6: Market Box Complete
After your final weekly pickup is confirmed, the market box moves to **"Completed"**.

---

### Vendor Side

#### Step 1: Receive a Market Box Subscriber
A buyer purchases one of your market box offerings. You'll see them in the **Subscribers** tab of that offering's management page.

**What you see:** The subscriber's name, start date, and subscription status.

#### Step 2: Weekly — Prepare the Box
Each week, prepare the box for this subscriber.

#### Step 3: Weekly — Mark Ready
In the **Pickups** tab, find this week's scheduled pickup and tap **"Mark Ready"**.

**What happens:** The pickup status changes to **"Ready"**. The buyer is notified their box is ready.

#### Step 4: Weekly — Handoff at the Market
When the buyer arrives:

**Scenario A: Buyer confirms first**
1. The buyer taps "Confirm Pickup" on their phone
2. You'll see a **"Buyer confirmed!"** badge on the pickup — it turns orange
3. Tap **"Confirm Handoff Now!"** within 30 seconds
4. Pickup is marked complete, weeks_completed increments

**Scenario B: You confirm first**
1. Tap **"Picked Up"** on the pickup
2. Your button changes to **"Waiting for buyer..."**
3. The buyer has 30 seconds to confirm on their end
4. Once they do, the pickup is complete

**If the 30-second window expires:** The waiting party's confirmation resets. Start the process again.

#### Step 5: Missed Pickups
If a buyer doesn't show up, you can tap **"Missed"** on the pickup. The week counts as fulfilled (the buyer forfeits that week's box).

#### Step 6: Skip a Week
If you need to skip a week (e.g., market closed, produce unavailable), you can skip the pickup. An extension week is automatically added to the end of the subscription so the buyer still receives their full number of boxes.

---

### Market Box Status Overview

| Pickup Status | What It Means |
|---|---|
| **Scheduled** | Upcoming pickup — vendor hasn't prepared it yet |
| **Ready** | Vendor marked the box as ready for pickup |
| **Picked Up** | Both buyer and vendor confirmed the handoff |
| **Missed** | Buyer didn't show up — week forfeited |
| **Skipped** | Vendor skipped the week — extension week added |
| **Rescheduled** | Pickup moved to a different date |

---

## Quick Reference: What To Do at Pickup

### For Buyers
1. Go to the vendor's booth during the pickup time window
2. Open the order on your phone
3. Tap **"Acknowledge Receipt"** (regular order) or **"Confirm Pickup"** (market box)
4. Wait for vendor to confirm, or confirm when you see the vendor is waiting
5. Done! Both parties confirmed within 30 seconds = successful handoff

### For Vendors
1. When the buyer arrives, have the order/pickup ready
2. Open the order on your dashboard
3. Tap **"Fulfill"** (regular order) or **"Picked Up"** (market box)
4. Wait for buyer to confirm, or confirm when you see the buyer is waiting
5. Done! Both parties confirmed within 30 seconds = successful handoff

### Troubleshooting
- **"Confirmation window expired"** — The 30-second timer ran out. Just start the process again.
- **Buyer/vendor not confirming** — Make sure both parties are at the booth with the app open. Either side can go first.
- **Order not showing as "Ready"** — The vendor hasn't marked it ready yet. Wait for the notification or check with the vendor.
