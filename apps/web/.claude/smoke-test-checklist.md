# Smoke Test Checklist

Run through these after every staging or production deployment. Check each item and note pass/fail.

**URL:** Replace `[base]` with your staging or production URL.

---

## Critical Path (Always Test)

### 1. Public Pages Load
- [ ] `[base]/farmers_market` — FM landing page loads, no errors
- [ ] `[base]/food_trucks` — FT landing page loads, no errors
- [ ] `[base]/farmers_market/browse` — Browse page loads with listings
- [ ] `[base]/food_trucks/browse` — Browse page loads with listings

### 2. Authentication
- [ ] Login page loads (`[base]/farmers_market/login`)
- [ ] Can log in with test account
- [ ] Can log out
- [ ] Signup page loads and shows correct password requirements (9 chars + complexity)

### 3. Buyer Flow
- [ ] Dashboard loads after login
- [ ] Can view a listing detail page
- [ ] Can add item to cart
- [ ] Cart page shows correct prices (subtotal, fees, total)
- [ ] Checkout flow loads (Stripe elements appear)

### 4. Vendor Flow
- [ ] Vendor dashboard loads after login
- [ ] Listings page shows vendor's listings
- [ ] Can create/edit a listing (don't need to save)
- [ ] Orders page loads

### 5. Admin Flow
- [ ] Admin dashboard loads (`[base]/[vertical]/admin`)
- [ ] Vendor management page loads
- [ ] Reports page loads

---

## Extended Tests (After Major Changes)

### Notifications
- [ ] Trigger a test notification (e.g., place a test order)
- [ ] Check in-app notification appears
- [ ] Check email is received (if email notifications enabled)

### Market Boxes
- [ ] Market box browse page loads
- [ ] Subscription flow works

### Settings
- [ ] Settings page loads
- [ ] Can update profile info
- [ ] Password change form shows correct requirements

### PWA
- [ ] Site loads on mobile browser
- [ ] "Add to Home Screen" prompt works
- [ ] App icon and splash screen correct

---

## Quick Check Template

Copy and paste this to report results:

```
Smoke Test — [Date] — [staging/production]
Public pages: PASS/FAIL
Auth: PASS/FAIL
Buyer flow: PASS/FAIL
Vendor flow: PASS/FAIL
Admin flow: PASS/FAIL
Notes: [any issues found]
```
