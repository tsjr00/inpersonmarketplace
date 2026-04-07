# Flow Integrity Test Protocol

## Why This Exists

Our existing tests catch bugs in individual files — wrong calculations, missing auth checks, broken business rules. But they miss bugs that live *between* files: a form that submits to an API that returns data a page can't handle, a redirect that points to a page missing a handler, a frontend param that no backend route reads.

**The signup confirmation bug (Session 68)** is the canonical example: `send-email/route.ts` correctly built a URL pointing to `/dashboard`, and `dashboard/page.tsx` correctly required auth. Neither file had a bug. The bug was the missing connection — dashboard didn't call `verifyOtp()` to confirm the email before requiring auth.

**What audits miss:**
1. **Cross-file flows** — each file looks correct alone, but the journey across files breaks
2. **Missing code** — a handler that should exist but was never written (nothing to grep for)
3. **Frontend/backend contract mismatches** — frontend reads a field the API doesn't return, or sends a param the API ignores
4. **Dead paths** — RPCs defined but never called, API routes no frontend links to, enum values no code sets

---

## Protocol Levels

### Level 1: Critical Path Flow Traces

**What:** Map every critical user journey step-by-step. For each step, verify the code exists and connects to the next step.

**When to run:** Before any production push. After major feature work. When auditing a feature area.

**How:** For each flow below, trace through the actual code files. At each step, verify:
- The file/function exists
- It receives the data the previous step sends
- It produces the data the next step expects
- Error states are handled (not just happy path)

#### Auth Flows
```
SIGNUP:
  1. Signup page → supabase.auth.signUp({ emailRedirectTo })
  2. Supabase fires send-email hook → /api/auth/send-email
  3. send-email builds verificationUrl → links to /{vertical}/{ACTION_REDIRECT_PATHS[type]}
  4. User clicks link → lands on target page with ?token_hash=&type=
  5. Target page calls supabase.auth.verifyOtp({ token_hash, type })
  6. Session established → redirect to dashboard
  
  VERIFY: Every entry in ACTION_REDIRECT_PATHS points to a page that handles token_hash.
  CHECK: grep for verifyOtp in each target page.

PASSWORD RESET:
  1. Forgot password page → supabase.auth.resetPasswordForEmail({ redirectTo })
  2. send-email hook → builds URL to /{vertical}/reset-password
  3. User clicks → reset-password page → verifyOtp → shows password form
  4. User submits → supabase.auth.updateUser({ password })
  
  VERIFY: reset-password page handles token_hash.

LOGIN:
  1. Login page → supabase.auth.signInWithPassword()
  2. Success → router.push to dashboard
  3. Dashboard → enforceVerticalAccess → user profile loaded
  
  VERIFY: login redirect targets exist and load for authenticated users.
```

#### Order Flows
```
ATTENDEE-PAID EVENT ORDER:
  1. Event shop page fetches /api/events/[token]/shop
  2. API returns: event, vendors, listings, waves, schedule, payment_model
  3. Shop page renders vendor cards with items
  4. User selects items → addToCart() → /api/cart/items POST
  5. Cart page → checkout → /api/checkout/session POST
  6. Stripe redirect → /api/checkout/success GET
  7. Order created → notification to vendor + buyer
  8. Vendor sees order in Pickup Mode → fulfills
  
  VERIFY: Every API call the shop page makes → the API handles that endpoint.
  VERIFY: Cart API accepts event market_id.
  VERIFY: Vendor orders API returns event orders.

COMPANY-PAID EVENT ORDER:
  1. Shop page detects payment_model='company_paid' + wave_ordering_enabled
  2. Access code entry → /api/events/[token]/verify-code POST
  3. Wave selection → /api/events/[token]/waves/reserve POST
  4. Item selection → /api/events/[token]/order POST
  5. RPC create_company_paid_order runs
  6. Notification to vendor + buyer
  7. Vendor fulfills → /api/vendor/orders/[id]/fulfill POST
  8. Fulfill route detects payment_model='company_paid' → skips Stripe transfer
  
  VERIFY: fulfill route handles company_paid (doesn't attempt Stripe transfer).
  VERIFY: vendor orders API returns company-paid orders.
  VERIFY: settlement report separates company-paid from attendee-paid.
```

#### Event Lifecycle Flow
```
EVENT REQUEST → COMPLETION:
  1. Event form POST → /api/event-requests
  2. Self-service: auto-approve → approveEventRequest() → market + token + access_code
  3. Auto-match → autoMatchAndInvite() → vendor notifications
  4. Vendor accepts → /api/vendor/events/[marketId]/respond PATCH
  5. Threshold reached → organizer notified → status='ready'
  6. Organizer selects vendors → /api/events/[token]/select POST
  7. Pre-orders open → shop page accessible
  8. Event day → cron Phase 14 → status='active'
  9. Event ends → cron Phase 15 → status='review'
  10. Admin completes → settlement report
  
  VERIFY: Every status transition has code that performs it.
  VERIFY: Every status has at least one exit path (except terminal: completed, cancelled, declined).
```

### Level 2: Cross-File Consistency Tests (Automated — Vitest)

These are deterministic tests that verify things match across files. Add to `src/lib/__tests__/flow-integrity.test.ts`.

```typescript
// Test categories:

// 2A. Auth redirect paths → target pages exist
// For each entry in ACTION_REDIRECT_PATHS, verify the page directory exists.

// 2B. Notification actionUrls → target routes exist  
// For each notification type, verify the actionUrl function produces a URL
// that corresponds to an existing page route.

// 2C. API params consumed by frontend → backend reads them
// Known contracts: pickup page sends event_orders=true → vendor orders API reads it.
// Event shop page reads data.waves → shop API returns waves field.

// 2D. Enum/status consistency
// CHECK constraint values → code uses the same values.
// Status labels in UI → match status values in DB.

// 2E. FK disambiguation completeness
// Every query that joins vendor_profiles ↔ market_vendors uses FK hint.
```

### Level 3: Missing Handler Detection (Automated — Vitest)

Tests that verify required code exists. These are "structural" tests — they pass or fail based on code presence, not runtime behavior.

```typescript
// 3A. Every RPC defined in migrations → called somewhere in app code
// Prevents: find_next_available_wave() defined but never called.

// 3B. Every payment_model value → has a checkout/fulfillment path
// Prevents: hybrid exists as form option but has no checkout flow.

// 3C. Every API route in app/api/ → linked from at least one frontend page or component
// Prevents: dead API routes that nothing calls.

// 3D. Every notification type → has a caller (sendNotification with that type)
// Prevents: notification types defined but never triggered.
```

### Level 4: Frontend/Backend Contract Tests (Automated — Vitest)

Tests that verify the data shapes flowing between frontend and backend match.

```typescript
// 4A. Shop page reads field X from /api/events/[token]/shop response
// → verify the API select query includes field X

// 4B. Dashboard reads field X from organizer events query
// → verify the query selects field X

// 4C. Vendor prep page reads field X from /api/vendor/events/[marketId]/prep
// → verify the API returns field X

// Implementation: parse the API route's .select() string and the frontend's
// destructuring/access patterns. Flag mismatches.
```

### Level 5: Dead Path Detection (Periodic — Agent-assisted)

Not automated, but should be run periodically (every 5 sessions or after major features).

```
5A. Functions exported but never imported
5B. API routes with zero frontend callers
5C. DB columns never read or written by app code
5D. Enum values never set by any code path
5E. Notification types never triggered by any code path
5F. RPC functions never called from app code
```

---

## Running the Protocol

### Quick Check (every commit — automated)
- Vitest business rules tests ← existing
- Playwright smoke tests (46 tests) ← existing  
- Level 2 consistency tests: `src/lib/__tests__/flow-integrity.test.ts` (35 tests)
- Level 3 missing handler tests: included in flow-integrity.test.ts
- Cross-file business rules: `src/lib/__tests__/cross-file-business-rules.test.ts` (50 tests)
  - BR-1: Platform fee 6.5% consistent (pricing.ts, RPC, settlement, fulfill)
  - BR-2: company_paid string consistent across full order chain
  - BR-3: Company-paid fulfill skips Stripe completely
  - BR-4: External payment 3.5% fee consistent
  - BR-5: Wave capacity flows from vendor → generation → enforcement
  - BR-6: Access code generated → stored → verified
  - BR-7: Hybrid dollar cap flows from form → shop → settlement
  - BR-8: Order notifications sent for ALL payment models
  - BR-9: Settlement visibility rules (company=detail, attendee=aggregate)
  - BR-10: Event cron uses per-market timezone
  - BR-11: One company-paid item per attendee enforced
  - BR-12: Vendor order cap validated before add-to-cart

### Pre-Push Check (before staging push)
- All Quick Check tests
- Level 1 flow trace: manually walk the auth flows (5 minutes)
- Level 4 contract tests ← NEW (add to vitest)

### Feature Audit (after major feature work)
- All Pre-Push checks
- Level 1 flow trace: walk ALL flows relevant to the feature
- Level 5 dead path detection (agent-assisted scan)

### Periodic Health Check (every 5 sessions)
- Full Level 1 trace of all critical paths
- Full Level 5 dead path scan
- Review and update this protocol with new flows

---

## How to Add a New Flow

When building a new feature that spans multiple files:

1. **Before coding:** Write the flow trace (step-by-step like the examples above)
2. **After coding:** Walk the trace, verifying each step connects
3. **Add to Level 2/3:** If the flow creates new contracts or handlers, add automated tests
4. **Update this doc:** Add the flow trace to the appropriate section

---

## Failure Response

When a flow integrity test fails:

1. **Don't fix the test.** The test is documenting a real contract.
2. **Trace the flow** to find where the break is.
3. **Fix the code** — add the missing handler, fix the contract mismatch, wire the param.
4. **Add a regression test** so the specific break can't recur.

---

## Session Instructions

**For Claude (future sessions):**

When asked to run flow integrity tests, or when doing a feature audit:

1. Read this file first.
2. For Level 1 traces: actually read the code at each step. Don't summarize from memory. Follow the data through each file.
3. For Level 2-4: run `npx vitest run src/lib/__tests__/flow-integrity.test.ts`.
4. For Level 5: use Explore agents to scan for dead paths, then verify findings by reading code.
5. Report findings as: FLOW BREAK (cross-file disconnect), MISSING HANDLER (code that should exist), CONTRACT MISMATCH (frontend/backend disagree), or DEAD PATH (defined but unused).
6. Never present a finding without citing the specific files and lines involved.
