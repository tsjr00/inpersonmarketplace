# Notification Message Templates

All copy for every notification type across every channel.
Variables use `{{variable_name}}` syntax. Review and approve before implementation.

**Sender identity:**
- Email from: `Farmers Marketing <noreply@farmersmarketing.app>`
- SMS from: Twilio number (no branding in body — carrier rules)
- Push: Shows app name from manifest

---

## Buyer-Facing Notifications

---

### 1. Order Confirmed (`order_confirmed`)
**Urgency:** Standard (Email + In-app)
**Trigger:** Vendor confirms a paid order

**In-app title:** Order Confirmed
**In-app message:** {{vendor_name}} confirmed your order #{{order_number}}. We'll let you know when it's ready for pickup.

**Push title:** Order Confirmed
**Push body:** {{vendor_name}} confirmed order #{{order_number}} — we'll notify you when it's ready.

**Email subject:** Your order #{{order_number}} has been confirmed
**Email body:**
```
Hi {{buyer_name}},

Good news — {{vendor_name}} has confirmed your order.

ORDER DETAILS
─────────────
Order:    #{{order_number}}
Item:     {{item_title}}
Vendor:   {{vendor_name}}
Pickup:   {{market_name}}{{pickup_date}}

What happens next?
The vendor is preparing your order. We'll send you another notification
the moment it's ready for pickup.

If you have questions, you can reach the vendor through their profile
on the app.

Happy shopping,
Farmers Marketing
```

---

### 2. Order Ready for Pickup (`order_ready`)
**Urgency:** Immediate (Push + In-app) — SMS fallback if push not enabled
**Trigger:** Vendor marks order as ready

**In-app title:** Your Order is Ready!
**In-app message:** Order #{{order_number}} from {{vendor_name}} is ready for pickup at {{market_name}}. Head over when you're ready!

**Push title:** Your order is ready!
**Push body:** #{{order_number}} from {{vendor_name}} — pick up at {{market_name}} now.

**SMS (fallback only):**
```
Your order #{{order_number}} from {{vendor_name}} is ready for pickup at {{market_name}}. Open the app to view details. - Farmers Marketing
```

**Email subject:** Order #{{order_number}} is ready for pickup!
**Email body:**
```
Hi {{buyer_name}},

Your order is ready and waiting for you!

ORDER DETAILS
─────────────
Order:    #{{order_number}}
Item:     {{item_title}}
Vendor:   {{vendor_name}}
Location: {{market_name}}

HOW TO PICK UP
1. Head to {{vendor_name}}'s booth at {{market_name}}
2. Open the app and go to My Orders
3. Show your order number: #{{order_number}}
4. Confirm the pickup in the app
5. Wait for {{vendor_name}} to confirm the handoff (within 30 seconds)
6. Done

See you at the market!
Farmers Marketing
```

---

### 3. Order Complete (`order_fulfilled`)
**Urgency:** Info (Email only)
**Trigger:** Pickup confirmed by both parties

**In-app title:** Order Complete
**In-app message:** Order #{{order_number}} is complete. Thanks for shopping with {{vendor_name}}!

**Email subject:** Thanks for your purchase — Order #{{order_number}}
**Email body:**
```
Hi {{buyer_name}},

Your order is complete! We hope you love what you got.

ORDER SUMMARY
─────────────
Order:    #{{order_number}}
Item:     {{item_title}}
Vendor:   {{vendor_name}}

Enjoyed your experience? Consider leaving a review — it helps
local vendors grow their business.

Thanks for supporting local,
Farmers Marketing
```

---

### 4. Order Cancelled by Vendor (`order_cancelled_by_vendor`)
**Urgency:** Urgent (SMS + In-app) — buyer may be en route
**Trigger:** Vendor cancels an order

**In-app title:** Order Cancelled
**In-app message:** {{vendor_name}} cancelled your order #{{order_number}}.{{reason}} A refund of {{refund_amount}} will be processed.

**Push title:** Order Cancelled
**Push body:** {{vendor_name}} cancelled order #{{order_number}}. A refund is on the way.

**SMS:**
```
{{vendor_name}} cancelled your order #{{order_number}}. A refund of {{refund_amount}} is being processed. Open the app for details. - Farmers Marketing
```

**Email subject:** Order #{{order_number}} has been cancelled
**Email body:**
```
Hi {{buyer_name}},

We're sorry — {{vendor_name}} was unable to fulfill your order.

ORDER DETAILS
─────────────
Order:    #{{order_number}}
Item:     {{item_title}}
Vendor:   {{vendor_name}}
{{reason_line}}

REFUND
──────
A refund of {{refund_amount}} will be processed to your original
payment method. Please allow 5-10 business days for the refund
to appear on your statement.

We apologize for the inconvenience. You're welcome to browse
other vendors and place a new order anytime.

Farmers Marketing
```

---

### 5. Order Expired (`order_expired`)
**Urgency:** Standard (Email + In-app)
**Trigger:** Vendor didn't confirm within the allowed window

**In-app title:** Order Expired
**In-app message:** Order #{{order_number}} expired because it wasn't confirmed in time. A refund of {{refund_amount}} will be processed.

**Email subject:** Order #{{order_number}} has expired — refund incoming
**Email body:**
```
Hi {{buyer_name}},

Unfortunately, your order expired because the vendor wasn't able
to confirm it within the required timeframe.

ORDER DETAILS
─────────────
Order:    #{{order_number}}
Item:     {{item_title}}
Vendor:   {{vendor_name}}

REFUND
──────
A refund of {{refund_amount}} will be processed to your original
payment method. Please allow 5-10 business days for the refund
to appear.

This doesn't happen often — you're welcome to place a new order
with the same vendor or explore other options on the marketplace.

Farmers Marketing
```

---

## Vendor-Facing Notifications

---

### 6. New Paid Order (`new_paid_order`)
**Urgency:** Standard (Email + In-app)
**Trigger:** Buyer completes checkout (payment confirmed)

**In-app title:** New Order Received
**In-app message:** {{buyer_name}} placed order #{{order_number}} for {{item_title}}. Pickup at {{market_name}} on {{pickup_date}}.

**Push title:** New order!
**Push body:** {{buyer_name}} ordered {{item_title}} — confirm in your dashboard.

**Email subject:** New order #{{order_number}} from {{buyer_name}}
**Email body:**
```
Hi {{vendor_name}},

You have a new order!

ORDER DETAILS
─────────────
Order:    #{{order_number}}
Customer: {{buyer_name}}
Item:     {{item_title}}
Pickup:   {{market_name}} on {{pickup_date}}

NEXT STEP
Please open your Vendor Dashboard and confirm this order.
The customer is counting on you!

Go to Dashboard: {{dashboard_url}}

Farmers Marketing
```

---

### 7. Order Cancelled by Buyer (`order_cancelled_by_buyer`)
**Urgency:** Standard (Email + In-app)
**Trigger:** Buyer cancels before pickup

**In-app title:** Order Cancelled by Customer
**In-app message:** {{buyer_name}} cancelled order #{{order_number}} for {{item_title}}.{{reason}} No action needed on your part.

**Email subject:** Order #{{order_number}} cancelled by customer
**Email body:**
```
Hi {{vendor_name}},

A customer has cancelled their order.

ORDER DETAILS
─────────────
Order:    #{{order_number}}
Customer: {{buyer_name}}
Item:     {{item_title}}
{{reason_line}}

No action is needed on your part. The item's inventory has been
restored automatically.

Farmers Marketing
```

---

### 8. Vendor Application Approved (`vendor_approved`)
**Urgency:** Standard (Email + In-app)
**Trigger:** Admin approves vendor application

**In-app title:** You're Approved!
**In-app message:** Your vendor application has been approved. Start adding your products and connect with customers at local markets.

**Email subject:** Welcome aboard — your vendor application is approved!
**Email body:**
```
Hi {{vendor_name}},

Congratulations — you've been approved as a vendor on Farmers Marketing!

GETTING STARTED
───────────────
1. Log in and go to your Vendor Dashboard
2. Add your first product listings (photos + descriptions)
3. Join a market to start reaching local buyers
4. Orders will come in as customers discover your products

Go to Dashboard: {{dashboard_url}}

Tips for success:
• Great photos make a big difference — natural light works best
• Write descriptions that tell your story
• Keep your inventory up to date to avoid cancellations
• Respond to orders quickly — buyers appreciate it

We're excited to have you on the platform!

Farmers Marketing
```

---

### 9. Vendor Application Rejected (`vendor_rejected`)
**Urgency:** Standard (Email + In-app)
**Trigger:** Admin rejects vendor application

**In-app title:** Application Update
**In-app message:** Your vendor application was not approved at this time.{{reason}} You're welcome to reapply after addressing any feedback.

**Email subject:** Update on your vendor application
**Email body:**
```
Hi {{vendor_name}},

Thank you for your interest in selling on Farmers Marketing.

After reviewing your application, we're unable to approve it at
this time.
{{reason_section}}

You're welcome to reapply after addressing any feedback above.
If you have questions, please reach out to our support team.

Farmers Marketing
```

---

### 10. Market Approved (`market_approved`)
**Urgency:** Standard (Email + In-app)
**Trigger:** Admin approves a market listing

**In-app title:** Market Approved!
**In-app message:** Your market "{{market_name}}" has been approved and is now visible to buyers.

**Email subject:** "{{market_name}}" is now live!
**Email body:**
```
Hi {{vendor_name}},

Great news — your market "{{market_name}}" has been approved
and is now live on Farmers Marketing!

Buyers in the area can now discover your market, browse your
products, and place orders for pickup.

Tip: Make sure your product listings are up to date and your
market schedule is accurate. Buyers use this info to plan their
visits.

Go to Dashboard: {{dashboard_url}}

Farmers Marketing
```

---

### 11. Pickup Confirmation Needed (`pickup_confirmation_needed`)
**Urgency:** Immediate (Push + In-app)
**Trigger:** Buyer taps "I've picked up my order"

**In-app title:** Confirm Pickup
**In-app message:** {{buyer_name}} says they've received order #{{order_number}}. Please confirm the handoff now.

**Push title:** Confirm pickup now
**Push body:** {{buyer_name}} picked up order #{{order_number}} — confirm in your dashboard.

**SMS (fallback):**
```
{{buyer_name}} picked up order #{{order_number}}. Open the app to confirm the handoff. - Farmers Marketing
```

---

### 12. Pickup Issue Reported (`pickup_issue_reported`)
**Urgency:** Urgent (SMS + In-app)
**Trigger:** Buyer or system reports a pickup problem

**In-app title:** Pickup Issue Reported
**In-app message:** An issue was reported for order #{{order_number}}.{{reason}} Please check your dashboard for details.

**SMS:**
```
Issue reported for order #{{order_number}}: {{reason}}. Please check your Farmers Marketing dashboard. - Farmers Marketing
```

**Email subject:** Issue reported — Order #{{order_number}}
**Email body:**
```
Hi {{vendor_name}},

An issue has been reported for one of your orders.

ORDER DETAILS
─────────────
Order:    #{{order_number}}
Item:     {{item_title}}
Issue:    {{reason}}

Please check your Vendor Dashboard for full details and next steps.

Go to Dashboard: {{dashboard_url}}

Farmers Marketing
```

---

### 13. Low Stock Warning (`inventory_low_stock`)
**Urgency:** Info (Email only)
**Trigger:** Inventory drops to or below threshold (5 units)

**In-app title:** Low Stock Warning
**In-app message:** "{{listing_title}}" is running low with {{quantity}} remaining. Consider restocking soon.

**Email subject:** Low stock alert — "{{listing_title}}"
**Email body:**
```
Hi {{vendor_name}},

Heads up — one of your products is running low.

STOCK ALERT
───────────
Product:   {{listing_title}}
Remaining: {{quantity}} units

If this product is popular, consider restocking to avoid
missed sales. You can update your inventory from your
Vendor Dashboard.

Go to Listings: {{listings_url}}

Farmers Marketing
```

---

### 14. Out of Stock (`inventory_out_of_stock`)
**Urgency:** Standard (Email + In-app)
**Trigger:** Inventory reaches 0

**In-app title:** Item Out of Stock
**In-app message:** "{{listing_title}}" is now out of stock. Update your listing to restock or it will be hidden from buyers.

**Email subject:** "{{listing_title}}" is out of stock
**Email body:**
```
Hi {{vendor_name}},

One of your products has sold out.

STOCK ALERT
───────────
Product: {{listing_title}}
Status:  Out of stock

Out-of-stock items are automatically hidden from the marketplace.
To make this product available again, update your inventory in
your Vendor Dashboard.

Go to Listings: {{listings_url}}

Farmers Marketing
```

---

### 15. Payout Processed (`payout_processed`)
**Urgency:** Info (Email only)
**Trigger:** Stripe payout completes

**In-app title:** Payout Sent
**In-app message:** A payout of {{payout_amount}} has been sent to your bank account. It should arrive in 1-2 business days.

**Email subject:** Payout of {{payout_amount}} is on the way
**Email body:**
```
Hi {{vendor_name}},

A payout has been sent to your connected bank account.

PAYOUT DETAILS
──────────────
Amount:   {{payout_amount}}
Status:   Sent
Arrival:  1-2 business days (varies by bank)

You can view your full payout history in your Vendor Dashboard.

Go to Dashboard: {{dashboard_url}}

Farmers Marketing
```

---

## Admin-Facing Notifications

---

### 16. New Vendor Application (`new_vendor_application`)
**Urgency:** Standard (Email + In-app)
**Trigger:** Vendor submits application for review

**In-app title:** New Vendor Application
**In-app message:** {{vendor_name}} submitted a vendor application. Review it in the admin panel.

**Email subject:** New vendor application — {{vendor_name}}
**Email body:**
```
A new vendor application has been submitted for review.

APPLICANT
─────────
Name:     {{vendor_name}}
Email:    {{vendor_email}}

Please log in to the Admin Dashboard to review and approve
or reject this application.

Go to Admin: {{admin_url}}

Farmers Marketing (automated)
```

---

## SMS Guidelines

All SMS messages must:
- Stay under 160 characters when possible (single segment)
- End with `- Farmers Marketing` for sender identification
- Include no URLs (link-free — drive users to the app)
- Only fire when push is NOT enabled (SMS is the fallback)
- Only cover the 4 urgent scenarios:
  1. Order ready for pickup
  2. Pickup confirmation needed
  3. Order cancelled by vendor
  4. Pickup issue reported

---

## Variable Reference

| Variable | Source | Example |
|----------|--------|---------|
| `{{buyer_name}}` | user_profiles.display_name | "Sarah" |
| `{{vendor_name}}` | vendor_profiles.profile_data.business_name | "Green Valley Farm" |
| `{{order_number}}` | orders.order_number | "FM-7X3K9" |
| `{{item_title}}` | listings.title | "Organic Heirloom Tomatoes" |
| `{{market_name}}` | markets.name | "Downtown Saturday Market" |
| `{{pickup_date}}` | Formatted from pickup_snapshot | "Saturday, Feb 8" |
| `{{refund_amount}}` | Formatted from subtotal_cents | "$12.50" |
| `{{payout_amount}}` | Formatted from payout cents | "$45.00" |
| `{{quantity}}` | listings.quantity | "3" |
| `{{listing_title}}` | listings.title | "Raw Wildflower Honey" |
| `{{reason}}` | cancellation_reason or issue_description | "Item unavailable" |
| `{{reason_line}}` | Conditional: `Reason: {{reason}}` or omitted | "Reason: Item unavailable" |
| `{{reason_section}}` | Multi-line block with reason or generic text | See rejected template |
| `{{dashboard_url}}` | Generated from vertical | "/farmers-market/vendor/dashboard" |
| `{{listings_url}}` | Generated from vertical | "/farmers-market/vendor/listings" |
| `{{admin_url}}` | Generated from vertical | "/farmers-market/admin/vendors" |
| `{{vendor_email}}` | From auth or profile | "vendor@example.com" |
