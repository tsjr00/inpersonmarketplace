# A2P 10DLC Campaign Compliance Guide

**Purpose:** Reference document for Twilio A2P 10DLC campaign submission and ongoing SMS compliance.

**Status:** Resubmission pending — first submission rejected for CTA verification failure.

**Date:** February 2026

---

## Why the First Submission Was Rejected

**Rejection reason:** "Issues verifying the Call to Action (CTA) provided for the campaign" ([Error 30909](https://www.twilio.com/docs/api/errors/30909))

**Root cause:** Twilio/carrier reviewers could not publicly verify that our app collects SMS consent properly. Specifically, 6 compliance gaps were identified:

| # | Gap | Status |
|---|-----|--------|
| 1 | No publicly visible SMS consent checkbox | **Needs UI build** |
| 2 | No "message and data rates may apply" disclosure | **Added to Terms** |
| 3 | No STOP/HELP keyword instructions | **Added to Terms** |
| 4 | No message frequency disclosure | **Added to Terms** |
| 5 | No privacy policy language about mobile data non-sharing | **Added to Privacy Policy** |
| 6 | No linkable Terms/Privacy policy URLs in submission | **URLs exist, include in resubmission** |

---

## What Carriers Actually Verify

A2P 10DLC reviewers visit your live website/app and look for:

1. **A publicly accessible opt-in page** with a phone number field + consent checkbox
2. **Consent checkbox text** that includes:
   - What messages will be sent (e.g., "order status alerts")
   - Message frequency (e.g., "up to 5 messages per week")
   - "Message and data rates may apply"
   - Links to Terms of Service and Privacy Policy
3. **Terms of Service** with a dedicated SMS/messaging section covering:
   - What types of messages are sent
   - How to opt out (STOP)
   - How to get help (HELP)
   - Message frequency
   - "Message and data rates may apply"
4. **Privacy Policy** with:
   - Statement that mobile phone numbers are NOT sold/shared for marketing
   - Mention of SMS service providers

---

## What Has Been Updated (Legal Pages)

### Terms of Service — New Section 8: "SMS and Text Messaging Terms"
**URL:** `https://farmersmarketing.app/terms#sms-terms`

Added:
- 8.1 Consent to Receive Messages — types of messages, consent language, message frequency
- 8.2 Message and Data Rates — standard disclosure
- 8.3 Opt-Out and Help — STOP/HELP keywords, alternative opt-out methods
- 8.4 Supported Carriers — carrier liability disclaimer

### Privacy Policy — New "Mobile Information Privacy" subsection
**URL:** `https://farmersmarketing.app/terms#privacy-policy`

Added:
- Explicit statement: phone numbers are never sold/rented/shared for promotional purposes
- Phone numbers used solely for transactional notifications
- Third-party SMS providers contractually prohibited from using numbers for other purposes
- SMS opt-out added to "Your Rights and Choices" section

---

## What Still Needs to Be Built (UI)

### Required: SMS Consent Checkbox on Account Settings

**Location:** Account profile settings page (where phone number is added)

**Must include:**
1. Phone number input field (currently missing)
2. Consent checkbox (unchecked by default) with this text:

> "By checking this box, I agree to receive automated SMS/text messages from farmersmarketing.app for order status alerts, pickup notifications, and cancellation notices. Message frequency varies (typically 1-5 per week during active orders). Message and data rates may apply. Reply STOP to opt out, HELP for help. See our [Terms of Service](https://farmersmarketing.app/terms#sms-terms) and [Privacy Policy](https://farmersmarketing.app/terms#privacy-policy)."

**Technical notes:**
- Checkbox must be **unchecked by default** (user must affirmatively opt in)
- Phone number should only be saved to profile when consent checkbox is checked
- Checking the box should set `notification_preferences.sms_enabled = true`
- Unchecking should set `sms_enabled = false`
- The "Coming Soon" state on SMS toggles in NotificationPreferences needs to be removed when this ships
- Consider logging consent timestamp for compliance records

### Required: Opt-In Confirmation Message

After user checks consent and saves phone number, send an initial SMS:
> "Welcome to farmersmarketing.app alerts! You'll receive order & pickup notifications. Reply STOP to unsubscribe, HELP for help. Msg & data rates may apply."

This is a standard TCPA requirement for confirming opt-in.

---

## Resubmission Checklist

Before resubmitting the A2P 10DLC campaign:

### Pre-requisites (must be live on production)
- [ ] Phone number input field added to account settings
- [ ] SMS consent checkbox with required language added
- [ ] Terms of Service Section 8 (SMS terms) live at `/terms#sms-terms`
- [ ] Privacy Policy mobile data language live at `/terms#privacy-policy`
- [ ] Initial opt-in confirmation SMS sending correctly
- [ ] STOP keyword processing works (Twilio handles this automatically)
- [ ] HELP keyword processing works (auto-reply configured in Twilio)

### Campaign Submission Fields

**Campaign description (suggested):**
> Transactional SMS notifications for the farmersmarketing.app marketplace. Messages include order cancellation alerts, pickup issue notifications, and urgent order status changes. Users opt in by providing their phone number and checking a consent checkbox in their account settings at https://farmersmarketing.app.

**Opt-in type:** Web form

**Opt-in description (suggested):**
> Users create an account at https://farmersmarketing.app, navigate to their account profile settings, enter their mobile phone number, and check a consent checkbox that reads: "I agree to receive automated SMS/text messages from farmersmarketing.app for order status alerts, pickup notifications, and cancellation notices. Message frequency varies (typically 1-5 per week). Message and data rates may apply. Reply STOP to opt out, HELP for help." The checkbox is unchecked by default and must be affirmatively checked by the user. The consent checkbox links to our Terms of Service (https://farmersmarketing.app/terms#sms-terms) and Privacy Policy (https://farmersmarketing.app/terms#privacy-policy).

**CTA / opt-in image:** Screenshot of the consent checkbox on the settings page (take after UI is built)

**Message samples (2 required):**
1. "farmersmarketing.app: Your order #FM-A1B2C3 has been cancelled by the vendor. Check your app for details. Reply STOP to unsubscribe."
2. "farmersmarketing.app: Pickup issue with your order at Green City Market. Please check your app for updated pickup details. Reply STOP to opt out."

**Opt-out keywords:** STOP, UNSUBSCRIBE, CANCEL, END, QUIT
**Help keywords:** HELP, INFO

**Terms of Service URL:** `https://farmersmarketing.app/terms`
**Privacy Policy URL:** `https://farmersmarketing.app/terms#privacy-policy`

---

## Key Compliance Rules (Ongoing)

1. **Never send marketing/promotional SMS** — only transactional order-related messages
2. **Always include opt-out** — every SMS should end with "Reply STOP to unsubscribe" or similar
3. **Honor STOP immediately** — Twilio handles this automatically, but verify it's configured
4. **Don't share phone numbers** — contractually and technically enforce this
5. **Log consent** — record when users opt in/out for compliance audits
6. **Message content must match campaign** — only send the message types described in the campaign registration

---

## Cost Notes

- First A2P campaign registration: **$15** (non-refundable, lost on rejection)
- Re-registration: **$15** (another charge)
- Monthly A2P fee: ~$2/month once approved
- Per-message cost: ~$0.0079/segment for standard rate
- Recommendation: Get everything right before resubmitting to avoid another $15 loss

---

## References

- [Twilio A2P 10DLC Registration](https://www.twilio.com/docs/messaging/guides/10dlc)
- [Error 30909 Documentation](https://www.twilio.com/docs/api/errors/30909)
- [CTIA Messaging Principles](https://www.ctia.org/the-wireless-industry/industry-commitments/messaging-interoperability-sms-mms)
- [TCPA Compliance Overview](https://www.twilio.com/docs/messaging/compliance/tcpa)
