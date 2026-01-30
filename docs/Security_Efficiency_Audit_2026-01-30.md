# Security & Efficiency Audit Report

**Date:** 2026-01-30
**Scope:** Full codebase audit for production readiness
**Focus:** Security vulnerabilities, performance bottlenecks, scalability concerns

---

## Executive Summary

| Category | Status | Critical Issues | Action Required |
|----------|--------|-----------------|-----------------|
| API Security | NEEDS WORK | 3 critical, 5 medium | Yes - before launch |
| RLS Policies | GOOD (recently fixed) | 1 critical, 3 medium | Yes - 1 migration |
| Frontend Security | GOOD | 0 critical, 2 medium | Optional |
| Stripe Integration | GOOD | 0 critical, 2 medium | Yes - idempotency |
| Performance | MODERATE | 3 high risk | Yes - images, caching |

**Overall Assessment:** The application has a solid foundation but needs hardening in API authorization and performance optimization before handling 1000+ concurrent users.

---

## CRITICAL ISSUES (Fix Before Launch)

### 1. Unsafe Service Client Usage in `/api/listings`

**Severity:** CRITICAL
**File:** `src/app/api/listings/route.ts` (Line 18)

```typescript
const supabase = admin ? createServiceClient() : await createClient()
```

**Issue:** The `admin` parameter comes from query string (`?admin=true`). Any unauthenticated user can bypass RLS by adding this parameter.

**Fix:**
```typescript
// Verify admin role BEFORE using service client
const { data: { user } } = await supabase.auth.getUser()
const isAdmin = user && await verifyAdminRole(user.id)
const client = isAdmin ? createServiceClient() : await createClient()
```

---

### 2. Missing SET search_path in SECURITY DEFINER Functions

**Severity:** CRITICAL
**File:** `supabase/migrations/20260121_002_vendor_activity_monitoring.sql`

**Affected Functions:**
- `update_vendor_last_login()`
- `update_vendor_activity_on_listing()`
- `update_vendor_activity_on_order()`
- `scan_vendor_activity(p_vertical_id)`

**Issue:** Without `SET search_path = public`, attackers can create malicious functions in other schemas that get executed instead.

**Fix:** Create migration to add `SET search_path = public` to all SECURITY DEFINER functions:
```sql
CREATE OR REPLACE FUNCTION update_vendor_last_login()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE vendor_profiles SET last_login_at = NOW() WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

---

### 3. Admin Authorization Not Centralized

**Severity:** HIGH
**Files:** 20+ admin routes with duplicated logic

**Issue:** Admin role check is inconsistent across routes:
```typescript
// Pattern varies between files:
callerProfile?.role === 'admin'
callerProfile?.roles?.includes('admin')
'admin' = ANY(roles)  // In SQL
```

**Fix:** Create centralized admin verification:
```typescript
// src/lib/auth/admin.ts
export async function verifyAdminRole(userId: string): Promise<boolean> {
  // Single source of truth for admin checks
}
```

---

### 4. Debug Endpoint Exposed

**Severity:** HIGH
**File:** `src/app/api/debug/markets/route.ts`

**Issue:** Debug endpoint queries all markets without authentication. Comment in file says "remove after debugging."

**Fix:** Delete this file or add authentication:
```bash
rm src/app/api/debug/markets/route.ts
```

---

## HIGH PRIORITY ISSUES

### 5. Missing Rate Limiting on Sensitive Endpoints

**Affected Routes:**
- `/api/user/delete-account` - Account deletion with no rate limit
- `/api/admin/*` - All admin routes
- `/api/auth/me` - Auth endpoint

**Fix:** Add rate limiting:
```typescript
const rateLimitResult = checkRateLimit(`admin:${clientIp}`, { limit: 30, windowSeconds: 60 })
```

---

### 6. Stripe Idempotency Keys Missing

**Severity:** HIGH
**Files:**
- `src/lib/stripe/payments.ts` - `createRefund()`
- `src/app/api/subscriptions/checkout/route.ts`

**Issue:** Without idempotency keys, retried requests can create duplicate refunds or subscriptions.

**Fix:**
```typescript
const refund = await stripe.refunds.create({
  payment_intent: paymentIntentId,
  amount,
}, {
  idempotencyKey: `refund_${paymentIntentId}_${Date.now()}`
})
```

---

### 7. Images Not Optimized

**Severity:** HIGH (Performance)
**Files:**
- `src/app/[vertical]/browse/page.tsx` (Lines 770-793)
- `src/app/[vertical]/market-box/[id]/page.tsx`

**Issue:** Using raw `<img>` tags instead of Next.js `Image`. Full-resolution images served to all devices.

**Impact:** Mobile users download 1-2MB images for 280px cards. With 1000 users = 2GB+ bandwidth/hour.

**Fix:**
```tsx
import Image from 'next/image'

<Image
  src={primaryImage.url}
  alt={listing.title}
  width={280}
  height={200}
  loading="lazy"
/>
```

---

### 8. Missing Database Indexes

**Add these indexes for 1000+ user scale:**

```sql
-- User profile lookups (auth checks)
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);

-- Market schedules
CREATE INDEX idx_market_schedules_market_status
  ON market_schedules(market_id, status, day_of_week);

-- Cart items (high concurrency)
CREATE INDEX idx_cart_items_buyer_listing
  ON cart_items(buyer_user_id, listing_id);

-- Market box offerings
CREATE INDEX idx_market_box_offerings_vendor_status
  ON market_box_offerings(vendor_profile_id, status, active);
```

---

### 9. Admin Analytics Memory Issue

**File:** `src/app/api/admin/analytics/top-vendors/route.ts` (Lines 68-86)

**Issue:** Loops through ALL transactions in memory for aggregation.

**Impact:** With 1M transactions = 100MB+ memory usage per request.

**Fix:** Use SQL aggregation:
```sql
SELECT vendor_id, SUM(amount_cents) as total
FROM transactions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY vendor_id
ORDER BY total DESC
LIMIT 10;
```

---

## MEDIUM PRIORITY ISSUES

### 10. Missing Cache Headers on Analytics

**Files:**
- `/api/vendor/analytics/overview/route.ts`
- `/api/admin/analytics/top-vendors/route.ts`

**Fix:**
```typescript
return NextResponse.json(data, {
  headers: {
    'Cache-Control': 'private, max-age=60, stale-while-revalidate=120'
  }
})
```

---

### 11. Input Validation Missing

**Files:**
- `/api/cart/add/route.ts` - No type/range validation on quantity
- `/api/vendor/profile/route.ts` - No length limits on display_name
- `/api/admin/admins/route.ts` - Email not validated

**Fix:** Add Zod schema validation:
```typescript
import { z } from 'zod'

const CartAddSchema = z.object({
  listingId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100)
})
```

---

### 12. Expensive React Computations

**File:** `src/app/[vertical]/browse/page.tsx` (Lines 83-113)

**Issue:** `groupListingsByCategory()` runs on every render with O(n log n) complexity.

**Fix:**
```typescript
const groupedListings = useMemo(() =>
  groupListingsByCategory(listings),
  [listings]
)
```

---

### 13. Test vs Live Mode Detection

**File:** `src/lib/stripe/config.ts`

**Issue:** No explicit validation that live keys aren't used in development.

**Fix:**
```typescript
const isLiveMode = stripeSecretKey?.startsWith('sk_live_')
if (isLiveMode && process.env.NODE_ENV === 'development') {
  throw new Error('Cannot use live Stripe keys in development!')
}
```

---

### 14. Missing Stripe Dispute Handling

**File:** `src/lib/stripe/webhooks.ts`

**Missing Events:**
- `charge.refunded` - Sync partial refunds
- `charge.dispute.created` - Alert on chargebacks
- `charge.dispute.closed` - Update dispute status

---

## LOW PRIORITY / INFORMATIONAL

### 15. Console.log Statements in Production

**Issue:** Multiple `console.error()` calls may expose info in production logs.

**Files:** 15+ API routes with console logging.

**Recommendation:** Use structured logging library (Pino, Winston) for production.

---

### 16. LocalStorage Usage

**File:** `src/components/landing/LocationEntry.tsx`

**Issue:** Stores zip code in localStorage with 30-day expiration.

**Risk:** LOW - Non-sensitive data, but consider sessionStorage for shorter retention.

---

### 17. Missing Content Security Policy

**Recommendation:** Add CSP headers in `next.config.js`:
```javascript
headers: [
  {
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Content-Security-Policy', value: "default-src 'self'" }
    ]
  }
]
```

---

## RECOMMENDED EXTERNAL TOOLS

### Great Fits for This Project:

| Tool | Purpose | Why Great Fit |
|------|---------|---------------|
| **Sentry** | Error tracking | Already have error tracing system - Sentry adds stack traces, performance monitoring, user session replay |
| **Upstash Redis** | Distributed rate limiting | Current in-memory rate limiting resets on serverless cold starts. Upstash is serverless-native Redis |
| **Cloudflare Images** or **imgix** | Image optimization | Transform and cache images at edge. Integrate with existing Supabase storage |
| **Zod** | Schema validation | Type-safe runtime validation for all API inputs. Already TypeScript-based codebase |
| **PostHog** | Product analytics | Self-hostable, privacy-focused alternative to Mixpanel. Good for understanding user flows |
| **Resend** | Transactional email | Simple API, good deliverability. Better than raw SMTP for order confirmations |

### Not Recommended:

| Tool | Reason |
|------|--------|
| Auth0/Clerk | Already using Supabase Auth - adding another auth layer adds complexity |
| Prisma | Already using Supabase client with good patterns - migration cost not worth it |
| GraphQL | REST API is well-structured - GraphQL adds complexity without clear benefit here |

---

## ACTION PLAN

### Week 1 (Before Launch):

1. **Day 1-2:** Fix Critical Issues #1-4
   - Remove debug endpoint
   - Fix /api/listings admin bypass
   - Create SECURITY DEFINER migration
   - Centralize admin auth

2. **Day 3:** Add Rate Limiting
   - Add to delete-account, admin routes
   - Add to auth endpoints

3. **Day 4-5:** Performance Quick Wins
   - Add missing database indexes
   - Replace `<img>` with `next/image` in browse page
   - Add cache headers to analytics routes

### Week 2 (Post-Launch Polish):

4. Add Stripe idempotency keys
5. Add Zod input validation
6. Implement useMemo for expensive computations
7. Add test/live mode detection

### Week 3+ (Scaling):

8. Integrate Upstash Redis for distributed rate limiting
9. Set up Cloudflare Images or imgix
10. Add Sentry for production error monitoring
11. Load test with k6 for 1000+ users

---

## SECURITY SCORECARD

| Area | Score | Notes |
|------|-------|-------|
| Authentication | 9/10 | Proper Supabase auth throughout |
| Authorization | 6/10 | Needs centralization, one bypass found |
| Input Validation | 5/10 | Client-side only, needs Zod |
| RLS Policies | 8/10 | Recently fixed, one migration needed |
| Stripe Security | 7/10 | Good foundation, missing idempotency |
| Rate Limiting | 4/10 | Partial implementation |
| Data Encryption | 10/10 | Supabase handles at rest, HTTPS in transit |
| **Overall** | **7/10** | Good foundation, needs hardening |

## PERFORMANCE SCORECARD

| Area | Score | Notes |
|------|-------|-------|
| Database Queries | 8/10 | Good batching, minor index gaps |
| Caching | 6/10 | Partial - needs analytics caching |
| Image Optimization | 3/10 | Critical - using raw img tags |
| Bundle Size | 7/10 | Acceptable, could use code splitting |
| API Response Size | 8/10 | Good selective field selection |
| **Overall** | **6/10** | Adequate for launch, optimize for scale |

---

## FILES REVIEWED

- 109 API routes
- 82 client components
- 49 database migrations
- 15+ lib utility files
- Stripe integration (12 files)
- Supabase client configuration

**Audit completed by:** Claude Code
**Total findings:** 17 items (4 critical, 5 high, 5 medium, 3 low)
