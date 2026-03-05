# Smoke Test Checklist

Three tiers — use the one that matches the situation.

**URL:** Replace `[base]` with your staging or production URL.

---

## Tier 1: Targeted Check (After Every Staging Push) — ~2 minutes

**Claude provides this automatically.** After each push, Claude lists 2-3 specific items to verify based on what changed in that push. No need to reference this file.

Example: *"Check that the signup page shows 'min 9 chars' in the password label."*

---

## Tier 2: Critical Path (After Every Production Push) — ~5 minutes

The "is the app broken?" check. Hit these 6 items:

- [ ] `[base]/farmers_market` — FM landing page loads
- [ ] `[base]/food_trucks` — FT landing page loads
- [ ] Log in with test account — dashboard loads
- [ ] `[base]/farmers_market/browse` — browse page loads with listings
- [ ] Open a listing detail page — prices display correctly
- [ ] Open cart — page loads (don't need to complete checkout)

### Quick Report Template
```
Production check — [Date]
Pages load: PASS/FAIL
Login: PASS/FAIL
Browse + listing: PASS/FAIL
Cart: PASS/FAIL
Notes:
```

---

## Tier 3: Full Verification (After Major Releases) — ~30 minutes

Use after: new features, database migrations, architecture changes, or before a launch milestone. Roughly monthly.

### Public Pages
- [ ] FM landing page loads, no console errors
- [ ] FT landing page loads, no console errors
- [ ] FM browse page loads with listings
- [ ] FT browse page loads with listings

### Authentication
- [ ] Login page loads
- [ ] Can log in with test account
- [ ] Can log out
- [ ] Signup page loads, shows correct password requirements

### Buyer Flow
- [ ] Dashboard loads after login
- [ ] Can view a listing detail page
- [ ] Can add item to cart
- [ ] Cart page shows correct prices (subtotal, fees, total)
- [ ] Checkout flow loads (Stripe elements appear)

### Vendor Flow
- [ ] Vendor dashboard loads after login
- [ ] Listings page shows vendor's listings
- [ ] Can create/edit a listing (don't need to save)
- [ ] Orders page loads

### Admin Flow
- [ ] Admin dashboard loads
- [ ] Vendor management page loads
- [ ] Reports page loads

### Notifications
- [ ] Trigger a test notification (e.g., place a test order)
- [ ] In-app notification appears
- [ ] Email received (if enabled)

### Market Boxes
- [ ] Market box browse page loads
- [ ] Subscription flow loads

### Settings & Profile
- [ ] Settings page loads
- [ ] Can update profile info
- [ ] Password change form shows correct requirements

### PWA (Mobile)
- [ ] Site loads on mobile browser
- [ ] "Add to Home Screen" works
- [ ] App icon and splash screen correct

### Full Report Template
```
Full Verification — [Date] — [staging/production]
Public pages: PASS/FAIL
Auth: PASS/FAIL
Buyer flow: PASS/FAIL
Vendor flow: PASS/FAIL
Admin flow: PASS/FAIL
Notifications: PASS/FAIL
Market boxes: PASS/FAIL
Settings: PASS/FAIL
PWA: PASS/FAIL
Notes:
```

---

## Future: Automated Smoke Tests

Tier 1 and Tier 2 can eventually be automated with Playwright, eliminating manual testing for routine deployments. See backlog for tracking.
