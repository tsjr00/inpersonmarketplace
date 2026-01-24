# Pre-Launch Scaling Checklist

## Overview
This document outlines critical performance optimizations to implement before launching to a nationwide user base. These are designed to handle thousands of concurrent users during peak times (Saturday morning market hours).

---

## ✅ Phase 1: Completed (Immediate Optimizations)

These optimizations are already implemented:

### 1. Parallel Database Queries
- **File:** `src/app/api/vendors/nearby/route.ts`
- Secondary queries (listings, market_vendors, listing_markets) now run in parallel with `Promise.all()`
- **Impact:** 60-70% reduction in response time

### 2. Bounding Box Pre-filtering
- **Files:** `vendors/nearby/route.ts`, `markets/nearby/route.ts`
- Database queries now filter by lat/lng bounds before returning results
- Markets query uses `.gte()/.lte()` on latitude/longitude columns
- **Impact:** 90%+ reduction in JS distance calculations

### 3. Edge Caching
- Responses cached at Vercel edge for 5 minutes
- Cache key based on rounded coordinates (~5 mile grid)
- `stale-while-revalidate` serves cached content while refreshing
- **Impact:** Repeat requests served in <50ms

---

## 🔲 Phase 2: Before Launch (1-2 weeks prior)

### 4. Fix PostGIS RPC Function
**Priority: HIGH**

The `get_markets_within_radius` RPC function is failing. When working, it provides 100x faster queries.

```sql
-- Verify PostGIS is enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create or fix the function
CREATE OR REPLACE FUNCTION get_markets_within_radius(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION,
  vertical_filter TEXT DEFAULT NULL,
  market_type_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  -- ... other columns
  distance_miles DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.*,
    ST_Distance(
      ST_MakePoint(m.longitude, m.latitude)::geography,
      ST_MakePoint(user_lng, user_lat)::geography
    ) / 1609.344 as distance_miles
  FROM markets m
  WHERE ST_DWithin(
    ST_MakePoint(m.longitude, m.latitude)::geography,
    ST_MakePoint(user_lng, user_lat)::geography,
    radius_meters
  )
  AND m.status = 'active'
  AND m.approval_status = 'approved'
  AND (vertical_filter IS NULL OR m.vertical_id = vertical_filter)
  AND (market_type_filter IS NULL OR m.market_type = market_type_filter)
  ORDER BY distance_miles;
END;
$$;
```

### 5. Add Database Indexes
**Priority: HIGH**

```sql
-- Spatial index for PostGIS (if using geography type)
CREATE INDEX IF NOT EXISTS idx_markets_location
ON markets USING GIST (ST_MakePoint(longitude, latitude)::geography);

-- Standard indexes for bounding box queries
CREATE INDEX IF NOT EXISTS idx_markets_lat ON markets(latitude);
CREATE INDEX IF NOT EXISTS idx_markets_lng ON markets(longitude);
CREATE INDEX IF NOT EXISTS idx_markets_vertical_status
ON markets(vertical_id, status, approval_status);

-- Vendor indexes
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_lat ON vendor_profiles(latitude);
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_lng ON vendor_profiles(longitude);
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_vertical_status
ON vendor_profiles(vertical_id, status);

-- Listing market associations
CREATE INDEX IF NOT EXISTS idx_listing_markets_market ON listing_markets(market_id);
CREATE INDEX IF NOT EXISTS idx_listing_markets_listing ON listing_markets(listing_id);
```

### 6. Pre-computed ZIP Code Lookups
**Priority: MEDIUM**

Create a background job that pre-computes vendors/markets per ZIP code region.

```sql
-- Table structure
CREATE TABLE zip_vendor_cache (
  zip_prefix VARCHAR(3) PRIMARY KEY,  -- First 3 digits of ZIP
  vendor_ids UUID[],
  market_ids UUID[],
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh nightly or when vendor locations change
```

**Implementation:**
- Create Vercel cron job or Supabase Edge Function
- Runs nightly at 2am
- Pre-computes vendors within ~100 miles of each ZIP prefix centroid
- Saturday morning queries become simple array lookups

---

## 🔲 Phase 3: At Scale (Post-Launch Monitoring)

### 7. Database Connection Pooling
**When:** If you see connection errors under load

- Enable Supabase connection pooling (PgBouncer)
- Switch from `postgres://` to `postgres://...?pgbouncer=true`
- Update connection string in environment variables

### 8. Read Replicas
**When:** If database CPU consistently >70%

- Add Supabase read replica
- Route location queries to replica
- Keep writes (orders, etc.) on primary

### 9. Redis Caching Layer
**When:** If edge caching isn't sufficient

- Add Upstash Redis (serverless, Vercel-friendly)
- Cache vendor/market data with 5-10 minute TTL
- Reduces database load significantly

---

## Performance Targets

| Metric | Current | Target | At Scale |
|--------|---------|--------|----------|
| Vendors nearby response | ~800ms | <200ms | <100ms |
| Markets nearby response | ~500ms | <150ms | <100ms |
| Concurrent users | ~100 | 1,000 | 10,000+ |
| Saturday morning peak | untested | 500 req/min | 5,000 req/min |

---

## Monitoring Checklist

Before launch, set up:

- [ ] Vercel Analytics (response times, errors)
- [ ] Supabase Dashboard (query performance, connections)
- [ ] Error tracking (Sentry or similar)
- [ ] Uptime monitoring (status page)

---

## Emergency Procedures

### If site is slow on Saturday morning:

1. **Check Vercel Functions** - Look for timeout errors
2. **Check Supabase** - Connection pool exhaustion?
3. **Increase cache TTL** - Temporarily bump to 15-30 minutes
4. **Enable maintenance mode** - If necessary, show cached content only

### Quick cache purge:
```bash
# Vercel edge cache is automatic, but you can force revalidation
# by deploying or using on-demand revalidation
```

---

*Last updated: January 2026*
*Review this checklist 2 weeks before any major launch milestone.*
