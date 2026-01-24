# Performance Architecture Plan

## Executive Summary

This document outlines the technical implementation plan for scaling the in-person marketplace to handle nationwide traffic with thousands of vendors, buyers, and high-resolution product images.

**Target Performance:**
- API response time: <100ms (p95)
- Support 10,000+ concurrent users during Saturday morning peaks
- Handle 1,000+ vendors per vertical
- Serve high-quality product images without impacting load times

---

## Current Architecture Problems

### Problem 1: O(n) Vendor Queries
```
Current flow:
1. Fetch ALL approved vendors nationwide
2. Fetch ALL their listings
3. Fetch ALL their market associations
4. Calculate distances in JavaScript
5. Filter to nearby vendors
```

**Why this doesn't scale:** With 1,000 vendors, we fetch 1,000 vendor records, potentially 10,000 listings, and 5,000 market associations - then throw away 95% of them.

### Problem 2: No Spatial Indexing
- Lat/lng stored as regular columns
- No database-level geographic filtering
- PostGIS RPC function exists but fails

### Problem 3: Complex Location Logic
- Vendor "location" = MIN(direct_coordinates, any_market_coordinates)
- Requires joining: vendors → listings → listing_markets → markets
- Cannot be expressed as simple WHERE clause

### Problem 4: No Image Optimization (Future)
- Product images will add significant payload
- Need CDN, responsive sizing, lazy loading

---

## Solution Architecture

### Phase 1: Vendor Location Materialization (Implement Now)

**Concept:** Pre-compute each vendor's effective location and store it for fast querying.

#### 1.1 Database Schema

```sql
-- Table to store pre-computed vendor locations
CREATE TABLE vendor_location_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  location_source TEXT NOT NULL, -- 'direct' or 'market'
  source_market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each vendor can have multiple location entries (one per market + direct)
  UNIQUE(vendor_profile_id, COALESCE(source_market_id, '00000000-0000-0000-0000-000000000000'))
);

-- Spatial index for fast bounding box queries
CREATE INDEX idx_vendor_location_cache_coords
ON vendor_location_cache(latitude, longitude);

-- Index for updates
CREATE INDEX idx_vendor_location_cache_vendor
ON vendor_location_cache(vendor_profile_id);
```

#### 1.2 Location Refresh Function

```sql
CREATE OR REPLACE FUNCTION refresh_vendor_locations()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Clear existing cache
  DELETE FROM vendor_location_cache;

  -- Insert direct vendor coordinates
  INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source)
  SELECT id, latitude, longitude, 'direct'
  FROM vendor_profiles
  WHERE status = 'approved'
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

  -- Insert market-based locations (from listing_markets)
  INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source, source_market_id)
  SELECT DISTINCT
    l.vendor_profile_id,
    m.latitude,
    m.longitude,
    'market',
    m.id
  FROM listing_markets lm
  JOIN listings l ON l.id = lm.listing_id
  JOIN markets m ON m.id = lm.market_id
  JOIN vendor_profiles vp ON vp.id = l.vendor_profile_id
  WHERE l.status = 'published'
    AND l.deleted_at IS NULL
    AND m.latitude IS NOT NULL
    AND m.longitude IS NOT NULL
    AND vp.status = 'approved'
  ON CONFLICT DO NOTHING;
END;
$$;
```

#### 1.3 Trigger for Real-time Updates

```sql
-- Refresh specific vendor when their data changes
CREATE OR REPLACE FUNCTION refresh_single_vendor_location()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete old entries for this vendor
  DELETE FROM vendor_location_cache
  WHERE vendor_profile_id = COALESCE(NEW.vendor_profile_id, OLD.vendor_profile_id, NEW.id, OLD.id);

  -- Re-insert (simplified - full refresh for affected vendor)
  -- Direct coordinates
  INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source)
  SELECT id, latitude, longitude, 'direct'
  FROM vendor_profiles
  WHERE id = COALESCE(NEW.vendor_profile_id, NEW.id)
    AND status = 'approved'
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

  -- Market locations
  INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source, source_market_id)
  SELECT DISTINCT l.vendor_profile_id, m.latitude, m.longitude, 'market', m.id
  FROM listing_markets lm
  JOIN listings l ON l.id = lm.listing_id
  JOIN markets m ON m.id = lm.market_id
  WHERE l.vendor_profile_id = COALESCE(NEW.vendor_profile_id, NEW.id)
    AND l.status = 'published'
    AND l.deleted_at IS NULL
    AND m.latitude IS NOT NULL
    AND m.longitude IS NOT NULL
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Triggers
CREATE TRIGGER trg_vendor_location_on_vendor_change
AFTER INSERT OR UPDATE OF latitude, longitude, status ON vendor_profiles
FOR EACH ROW EXECUTE FUNCTION refresh_single_vendor_location();

CREATE TRIGGER trg_vendor_location_on_listing_change
AFTER INSERT OR UPDATE OR DELETE ON listing_markets
FOR EACH ROW EXECUTE FUNCTION refresh_single_vendor_location();
```

#### 1.4 New Optimized API Query

```typescript
// New vendors nearby query structure
export async function GET(request: NextRequest) {
  const { latitude, longitude, radiusMiles, vertical } = parseParams(request)
  const bounds = getBoundingBox(latitude, longitude, radiusMiles)

  // Step 1: Get vendor IDs within bounding box (FAST - uses index)
  const { data: nearbyLocations } = await supabase
    .from('vendor_location_cache')
    .select('vendor_profile_id, latitude, longitude')
    .gte('latitude', bounds.minLat)
    .lte('latitude', bounds.maxLat)
    .gte('longitude', bounds.minLng)
    .lte('longitude', bounds.maxLng)

  // Deduplicate vendor IDs and calculate min distance per vendor
  const vendorDistances = new Map<string, number>()
  nearbyLocations?.forEach(loc => {
    const dist = haversineDistance(latitude, longitude, loc.latitude, loc.longitude)
    if (dist <= radiusMiles) {
      const existing = vendorDistances.get(loc.vendor_profile_id)
      if (!existing || dist < existing) {
        vendorDistances.set(loc.vendor_profile_id, dist)
      }
    }
  })

  const vendorIds = Array.from(vendorDistances.keys())

  if (vendorIds.length === 0) {
    return NextResponse.json({ vendors: [] })
  }

  // Step 2: Fetch only the vendors we need (FAST - small set)
  const [vendorsResult, listingsResult, marketsResult] = await Promise.all([
    supabase.from('vendor_profiles').select('*').in('id', vendorIds),
    supabase.from('listings').select('vendor_profile_id, category').in('vendor_profile_id', vendorIds).eq('status', 'published'),
    supabase.from('listing_markets').select('listings!inner(vendor_profile_id), markets(id, name)').in('listings.vendor_profile_id', vendorIds)
  ])

  // Step 3: Enrich and return (minimal processing)
  // ... rest of enrichment logic
}
```

**Performance Impact:**
- Before: Fetch 1,000 vendors → process all → return 50
- After: Fetch 50 vendor IDs from indexed table → fetch 50 vendors → return 50
- **Expected improvement: 10-20x faster**

---

### Phase 2: Image Optimization (Before Adding Images)

#### 2.1 Storage Architecture

```
Supabase Storage (already CDN-backed)
└── listings/
    └── {listing_id}/
        ├── original.jpg       (uploaded file, max 5MB)
        ├── large.webp         (1200x1200, quality 85)
        ├── medium.webp        (600x600, quality 80)
        ├── thumbnail.webp     (200x200, quality 75)
        └── blur.txt           (base64 blur placeholder)
```

#### 2.2 Image Processing Pipeline

```typescript
// On image upload (Edge Function or API route)
async function processListingImage(file: File, listingId: string) {
  const supabase = createClient()

  // 1. Upload original
  await supabase.storage
    .from('listings')
    .upload(`${listingId}/original.jpg`, file)

  // 2. Generate variants (use Sharp or Cloudflare Images)
  const variants = await generateImageVariants(file)

  // 3. Upload variants
  await Promise.all([
    supabase.storage.from('listings').upload(`${listingId}/large.webp`, variants.large),
    supabase.storage.from('listings').upload(`${listingId}/medium.webp`, variants.medium),
    supabase.storage.from('listings').upload(`${listingId}/thumbnail.webp`, variants.thumbnail),
  ])

  // 4. Generate and store blur placeholder
  const blurHash = await generateBlurHash(file)
  await supabase.storage.from('listings').upload(`${listingId}/blur.txt`, blurHash)

  return {
    urls: {
      large: getPublicUrl(`${listingId}/large.webp`),
      medium: getPublicUrl(`${listingId}/medium.webp`),
      thumbnail: getPublicUrl(`${listingId}/thumbnail.webp`),
    },
    blurHash
  }
}
```

#### 2.3 Frontend Image Component

```tsx
// components/ListingImage.tsx
function ListingImage({ listing, size = 'medium' }: Props) {
  const [loaded, setLoaded] = useState(false)

  const srcSet = {
    thumbnail: listing.image_urls?.thumbnail,
    medium: listing.image_urls?.medium,
    large: listing.image_urls?.large,
  }

  return (
    <div className="listing-image" style={{ position: 'relative' }}>
      {/* Blur placeholder */}
      {!loaded && listing.blur_hash && (
        <img
          src={`data:image/jpeg;base64,${listing.blur_hash}`}
          style={{ filter: 'blur(20px)', position: 'absolute', inset: 0 }}
        />
      )}

      {/* Actual image with srcset */}
      <img
        src={srcSet[size]}
        srcSet={`
          ${srcSet.thumbnail} 200w,
          ${srcSet.medium} 600w,
          ${srcSet.large} 1200w
        `}
        sizes="(max-width: 640px) 200px, (max-width: 1024px) 300px, 400px"
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
```

#### 2.4 Database Schema Update

```sql
-- Update listings table for optimized images
ALTER TABLE listings ADD COLUMN IF NOT EXISTS image_variants JSONB;
-- Structure: { thumbnail: url, medium: url, large: url, blurHash: string }

-- Migrate existing image_urls to new structure (one-time migration)
```

---

### Phase 3: Caching Strategy

#### 3.1 Multi-Layer Cache

```
Layer 1: Browser Cache (user's device)
├── Static assets: 1 year (immutable)
├── API responses: 0 (no browser cache for dynamic data)

Layer 2: Edge Cache (Vercel CDN)
├── Nearby APIs: 5 minutes, stale-while-revalidate 10 minutes
├── Static pages: 10 minutes
├── Images: 1 year (immutable URLs with hash)

Layer 3: Application Cache (optional Redis)
├── Vendor location cache: refreshed by triggers
├── Market data: 1 hour TTL
├── Computed aggregates: varies
```

#### 3.2 Cache Invalidation Strategy

```typescript
// When vendor location changes
async function invalidateVendorCache(vendorId: string) {
  // 1. Database trigger updates vendor_location_cache (automatic)

  // 2. Purge edge cache for affected regions
  // Get all locations for this vendor
  const { data: locations } = await supabase
    .from('vendor_location_cache')
    .select('latitude, longitude')
    .eq('vendor_profile_id', vendorId)

  // Purge cache keys for each location's grid cell
  const cacheKeys = locations?.map(loc =>
    `${Math.round(loc.latitude * 10) / 10},${Math.round(loc.longitude * 10) / 10}`
  )

  // Vercel doesn't support programmatic purge easily,
  // but 5-min TTL means changes propagate quickly
}
```

---

### Phase 4: Database Optimization

#### 4.1 Required Indexes

```sql
-- Location cache (Phase 1)
CREATE INDEX idx_vlc_coords ON vendor_location_cache(latitude, longitude);
CREATE INDEX idx_vlc_vendor ON vendor_location_cache(vendor_profile_id);

-- Listings performance
CREATE INDEX idx_listings_vendor_status ON listings(vendor_profile_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_listings_category ON listings(category)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Markets performance
CREATE INDEX idx_markets_coords ON markets(latitude, longitude)
  WHERE status = 'active' AND approval_status = 'approved';
CREATE INDEX idx_markets_vertical ON markets(vertical_id, status, approval_status);

-- Listing markets join
CREATE INDEX idx_listing_markets_market ON listing_markets(market_id);
CREATE INDEX idx_listing_markets_listing ON listing_markets(listing_id);
```

#### 4.2 Connection Pooling

```
Supabase Dashboard → Project Settings → Database → Connection Pooling

Settings:
- Pool Mode: Transaction (recommended for serverless)
- Pool Size: 15 (default, increase if needed)

Update connection string:
- From: postgres://...
- To: postgres://...?pgbouncer=true
```

---

## Implementation Timeline

### Week 1: Phase 1 (Location Materialization)
- [ ] Create vendor_location_cache table
- [ ] Create refresh function
- [ ] Create triggers
- [ ] Run initial data population
- [ ] Update vendors/nearby API to use new table
- [ ] Test and deploy

### Week 2: Phase 4 (Database Optimization)
- [ ] Add all indexes
- [ ] Enable connection pooling
- [ ] Monitor query performance
- [ ] Fix PostGIS function if needed

### Before Adding Images: Phase 2
- [ ] Set up image processing pipeline
- [ ] Create storage bucket structure
- [ ] Update listing upload flow
- [ ] Create ListingImage component
- [ ] Test with sample images

### At Scale: Phase 3 Refinements
- [ ] Add Redis if edge cache insufficient
- [ ] Set up monitoring dashboards
- [ ] Load test Saturday morning scenario
- [ ] Document emergency procedures

---

## Performance Targets

| Metric | Current | After Phase 1 | Full Implementation |
|--------|---------|---------------|---------------------|
| Vendors nearby (cold) | ~800ms | ~200ms | <100ms |
| Vendors nearby (cached) | ~200ms | ~50ms | <30ms |
| Markets nearby | ~500ms | ~150ms | <50ms |
| Browse page load | ~1.5s | ~800ms | <500ms |
| Image load (with blur) | N/A | perceived <100ms | perceived <100ms |

---

## Monitoring & Alerts

### Key Metrics to Track
1. API response times (p50, p95, p99)
2. Database query times
3. Cache hit rate
4. Error rate
5. Concurrent connections

### Alert Thresholds
- API p95 > 500ms: Warning
- API p95 > 1000ms: Critical
- Error rate > 1%: Critical
- DB connections > 80%: Warning

---

*This plan should be reviewed and updated as implementation progresses.*
