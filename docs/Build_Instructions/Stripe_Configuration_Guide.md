# Stripe Dashboard Configuration Guide

**Date:** January 27, 2026  
**For:** Tracy  
**Purpose:** Set up your Stripe account for farmersmarketing.app

---

## 🎯 OVERVIEW

You're reusing your existing Stripe account. 2026 is the clean dividing line (all prior transactions are from old project).

**Estimated time:** 1-2 hours

---

## ✅ CHECKLIST

Use this to track your progress:

- [ ] 1. Enable Stripe Connect
- [ ] 2. Configure Connect branding
- [ ] 3. Create webhook endpoint
- [ ] 4. Get API keys
- [ ] 5. Get webhook signing secret
- [ ] 6. Add keys to Vercel environment variables
- [ ] 7. Test in Stripe test mode
- [ ] 8. Complete business verification (for live mode)

---

## 📋 STEP-BY-STEP INSTRUCTIONS

### Step 1: Enable Stripe Connect

**Navigate to:** Dashboard → Settings → Connect

**Actions:**
1. Click "Get Started" if Connect not enabled
2. Select account type: **Express**
3. Confirm capabilities:
   - ✅ Card payments
   - ✅ Transfers
4. Save settings

**Why:** Vendors need Connect accounts to receive payouts.

---

### Step 2: Configure Connect Branding

**Navigate to:** Settings → Connect → Branding

**Configure:**
1. **Platform name:** farmersmarketing.app (or "Farmers Marketing")
2. **Logo:** Upload your platform logo
   - Recommended: 512x512px PNG with transparent background
   - Shows on vendor onboarding pages
3. **Brand color:** Your primary brand color (hex code)
   - Used for buttons and accents in Connect UI
4. **Icon:** Same as logo or simplified version

**What vendors see:** "Connect to farmersmarketing.app" with your logo during onboarding.

---

### Step 3: Create Webhook Endpoint

**Navigate to:** Developers → Webhooks → Add endpoint

**Endpoint URL:**
```
Test mode: https://[your-dev-domain]/api/webhooks/stripe
Live mode: https://farmersmarketing.app/api/webhooks/stripe
```

**Events to select:**
- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `account.updated`
- `transfer.created`
- `transfer.reversed`

**Description:** "Platform payment and payout events"

**Version:** Latest API version (should match: 2025-12-15.clover)

**Save** and note the webhook signing secret (shows after creation).

---

### Step 4: Get API Keys

**Navigate to:** Developers → API keys

**Test mode keys (use first):**
1. **Publishable key:** Starts with `pk_test_...`
2. **Secret key:** Starts with `sk_test_...`
   - Click "Reveal test key" to see it
   - Copy immediately

**Live mode keys (use later):**
1. Switch to "Live" mode in top-right
2. Same process, but keys start with `pk_live_...` and `sk_live_...`

**Security:** Never commit secret keys to Git. Store in environment variables only.

---

### Step 5: Get Webhook Signing Secret

**Navigate to:** Developers → Webhooks → Click your endpoint

**Copy:** Signing secret (starts with `whsec_...`)

**Why:** Verifies webhooks are actually from Stripe, not attackers.

---

### Step 6: Add Keys to Vercel

**Navigate to:** Vercel Dashboard → Your Project → Settings → Environment Variables

**Add these 3 variables:**

**For Development:**
```
STRIPE_SECRET_KEY = sk_test_[your_test_key]
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_test_[your_test_key]
STRIPE_WEBHOOK_SECRET = whsec_[your_webhook_secret]
```

**For Production (later):**
```
STRIPE_SECRET_KEY = sk_live_[your_live_key]
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_[your_live_key]
STRIPE_WEBHOOK_SECRET = whsec_[your_webhook_secret]
```

**Important:** Use different webhook secrets for test vs live mode.

**Apply to:** Production environment (for now, test keys)

**Redeploy:** Vercel will prompt you to redeploy to apply new env vars.

---

### Step 7: Test in Test Mode

**After CC builds features:**

**Test checkout:**
1. Browse to your dev site
2. Add items to cart (over $10 minimum)
3. Go to checkout
4. Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits
5. Complete payment
6. Verify order appears in buyer dashboard
7. Check Stripe Dashboard → Payments (should see test payment)

**Test vendor onboarding:**
1. Create vendor account
2. Start Connect onboarding
3. Should redirect to Stripe-hosted form
4. Use test business details
5. Complete onboarding
6. Verify vendor can receive payouts

**Test payout:**
1. As vendor, mark order as ready
2. As buyer, confirm pickup (after CC builds this)
3. Check Stripe Dashboard → Connect → Transfers
4. Should see transfer to vendor's Connect account

---

### Step 8: Complete Business Verification (For Live Mode)

**Required for live payments.**

**Navigate to:** Settings → Account details

**Provide:**
- Business name
- Business type (LLC, sole proprietor, etc.)
- EIN or SSN
- Business address
- Bank account for platform payouts
- Representative details (you)

**Documents may be requested:**
- Business registration
- ID verification
- Bank statement

**Approval time:** 1-3 business days typically

**You can test with test keys while verification is pending.**

---

## 🔐 SECURITY CHECKLIST

- [ ] Secret keys stored only in Vercel env vars (not in code)
- [ ] Webhook endpoint uses HTTPS (not HTTP)
- [ ] Webhook signature verification enabled in code
- [ ] API keys have proper restrictions (if available)
- [ ] Test mode keys used for development
- [ ] Live mode keys only in production environment

---

## 💳 PAYOUT SCHEDULE

**Navigate to:** Settings → Payouts

**For Platform (your account):**
- Recommended: Daily automatic
- Or: Weekly on Fridays
- Or: Manual (you control when)

**For Vendors (Connect accounts):**
- Set by Stripe automatically (usually daily)
- Vendors can change in their Connect dashboard

---

## 📊 RECOMMENDED DASHBOARD SETTINGS

**Radar (Fraud Prevention):**
- Navigate to: Radar → Rules
- Basic protection is automatic
- Consider adding:
  - Block payments if CVC check fails
  - Block payments if postal code check fails
  - Review high-value orders manually

**Email Receipts:**
- Navigate to: Settings → Emails
- Enable: Customer receipts
- Customize: Add your branding

**Business Details:**
- Navigate to: Settings → Business settings
- Complete: Name, website, support email
- Shows on customer receipts and statements

---

## 🧪 TESTING CHECKLIST

After configuration complete:

**Test these scenarios:**
- [ ] $10 order checkout (minimum)
- [ ] $50 order checkout
- [ ] Multi-vendor order
- [ ] Payment with test card 4242...
- [ ] Payment failure with test card 4000 0000 0000 0002
- [ ] Vendor onboarding flow
- [ ] Webhook events received (check logs)
- [ ] Payout transfer to vendor

**All passing? Ready to switch to live mode.**

---

## 🚀 GOING LIVE

**When ready to accept real payments:**

1. Complete business verification (if not done)
2. Switch Vercel env vars to live keys
3. Create new webhook endpoint for production URL
4. Update STRIPE_WEBHOOK_SECRET with live webhook secret
5. Redeploy production
6. Test with small real transaction
7. Verify money moves correctly
8. Monitor for issues for first week

**Start slow:**
- Soft launch with limited users
- Watch transactions closely
- Fix issues quickly
- Scale up when confident

---

## 🆘 TROUBLESHOOTING

**"Connect not available"**
- Account may need verification first
- Contact Stripe support

**"Webhook not receiving events"**
- Check endpoint URL is correct
- Verify HTTPS (not HTTP)
- Check Stripe webhook logs for errors

**"Test cards not working"**
- Make sure in test mode
- Use exact card number: 4242 4242 4242 4242
- Check API version matches

**"Transfers failing"**
- Vendor Connect account may not be complete
- Check vendor onboarding status
- Verify capabilities include "transfers"

---

## 📞 SUPPORT

**Stripe Support:**
- Dashboard → Help & Support
- Live chat available
- Email: support@stripe.com

**Documentation:**
- stripe.com/docs
- stripe.com/docs/connect

---

## ✅ COMPLETION CHECKLIST

Before you tell CC to start building:

- [ ] Connect enabled
- [ ] Branding configured
- [ ] Webhooks created (test mode)
- [ ] API keys copied
- [ ] Webhook secret copied
- [ ] All keys added to Vercel
- [ ] Production redeployed with new env vars

**Once complete:** Tell CC to proceed with bug fixes and feature builds.

**After CC finishes:** Run through testing checklist above.

---

**Questions? Ask before moving forward.**
