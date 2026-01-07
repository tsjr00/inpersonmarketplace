# Build Instructions - Phase 5: Verticals Configuration in Database

**Session Date:** January 5, 2026  
**Created by:** Chet (Claude Chat)  
**Phase:** 5 - Database-Driven Verticals  
**Prerequisites:** Phase 4 complete, vendor dashboard working

---

## Objective

Move vertical branding and configuration from JSON files into the database, making the system more dynamic and maintainable. This allows adding new verticals via SQL/admin panel rather than code deployment.

---

## Overview

**Current state:** 
- Branding stored in `config/verticals/*.json` files
- Requires code changes to add new vertical
- Need deployment to update branding

**Target state:**
- Branding stored in `verticals` table (config column)
- Can add/update verticals via SQL or admin panel
- No deployment needed for new verticals
- Fallback to JSON files if database unavailable

---

## Part 1: Update Verticals Table Schema

**Create migration:** `supabase/migrations/20260105_HHMMSS_001_add_branding_to_verticals.sql`

```sql
-- =============================================================================
-- Migration: Add branding configuration to verticals table
-- =============================================================================
-- Created: 2026-01-05 HH:MM:SS CST
-- Author: Claude Code
-- 
-- Purpose:
-- Extends the verticals table to include branding and vendor field configurations.
-- This allows dynamic vertical management without code deployment.
-- The config column will store all vertical-specific data including branding,
-- vendor fields, and other configuration.
--
-- Dependencies:
-- Requires verticals table from 20260103_001_initial_schema.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- N/A - This is additive, no data loss on rollback
-- Config column can be set to NULL if needed
-- =============================================================================

-- No schema changes needed - config column already exists as JSONB
-- This migration just seeds the branding data into existing structure

-- Verify column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'verticals' 
    AND column_name = 'config'
  ) THEN
    RAISE EXCEPTION 'config column does not exist in verticals table';
  END IF;
END $$;

-- Add comment explaining config structure
COMMENT ON COLUMN verticals.config IS 
'Complete vertical configuration including branding, vendor_fields, and other settings. Structure:
{
  "branding": {
    "domain": "example.com",
    "brand_name": "Brand Name",
    "tagline": "Brand tagline",
    "logo_path": "/logos/brand.svg",
    "favicon": "/favicons/brand.ico",
    "colors": {
      "primary": "#hex",
      "secondary": "#hex",
      "accent": "#hex",
      "background": "#hex",
      "text": "#hex"
    },
    "meta": {
      "title": "Page title",
      "description": "Meta description",
      "keywords": "keyword1, keyword2"
    }
  },
  "vendor_fields": [...],
  "other_config": {...}
}';

-- Create index on config for better query performance
CREATE INDEX IF NOT EXISTS idx_verticals_config_gin 
ON verticals USING GIN (config);

COMMENT ON INDEX idx_verticals_config_gin IS 
'GIN index for efficient JSONB queries on vertical configuration';
```

---

## Part 2: Seed Branding Data into Database

**Create migration:** `supabase/migrations/20260105_HHMMSS_002_seed_vertical_branding.sql`

```sql
-- =============================================================================
-- Migration: Seed branding configurations for existing verticals
-- =============================================================================
-- Created: 2026-01-05 HH:MM:SS CST
-- Author: Claude Code
-- 
-- Purpose:
-- Populates the config column with branding and vendor field data for
-- existing fireworks and farmers_market verticals. This data was previously
-- only in JSON files - now it's in the database.
--
-- Dependencies:
-- Requires 20260105_HHMMSS_001_add_branding_to_verticals.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- UPDATE verticals SET config = jsonb_strip_nulls(config - 'branding');
-- =============================================================================

-- Update fireworks vertical with complete config
UPDATE verticals
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{branding}',
  '{
    "domain": "fireworksstand.com",
    "brand_name": "Fireworks Stand",
    "tagline": "Your Premier Fireworks Marketplace",
    "logo_path": "/branding/fireworks-logo.svg",
    "favicon": "/branding/fireworks-favicon.ico",
    "colors": {
      "primary": "#ff4500",
      "secondary": "#ffa500",
      "accent": "#ff6347",
      "background": "#1a1a1a",
      "text": "#ffffff"
    },
    "meta": {
      "title": "Fireworks Stand - Buy & Sell Fireworks",
      "description": "Connect with licensed fireworks sellers in your area",
      "keywords": "fireworks, buy fireworks, fireworks stand, fireworks marketplace"
    }
  }'::jsonb
)
WHERE vertical_id = 'fireworks';

-- Update farmers_market vertical with complete config
UPDATE verticals
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{branding}',
  '{
    "domain": "farmersmarket.app",
    "brand_name": "Fresh Market",
    "tagline": "Farm Fresh, Locally Grown",
    "logo_path": "/branding/farmers-logo.svg",
    "favicon": "/branding/farmers-favicon.ico",
    "colors": {
      "primary": "#2d5016",
      "secondary": "#6b8e23",
      "accent": "#9acd32",
      "background": "#f5f5dc",
      "text": "#2d2d2d"
    },
    "meta": {
      "title": "Fresh Market - Local Farmers & Producers",
      "description": "Buy fresh produce directly from local farmers",
      "keywords": "farmers market, fresh produce, local food, organic"
    }
  }'::jsonb
)
WHERE vertical_id = 'farmers_market';

-- Verify data was inserted
DO $$
DECLARE
  fireworks_branding jsonb;
  farmers_branding jsonb;
BEGIN
  SELECT config->'branding' INTO fireworks_branding
  FROM verticals WHERE vertical_id = 'fireworks';
  
  SELECT config->'branding' INTO farmers_branding
  FROM verticals WHERE vertical_id = 'farmers_market';
  
  IF fireworks_branding IS NULL OR farmers_branding IS NULL THEN
    RAISE EXCEPTION 'Branding data not properly inserted';
  END IF;
  
  RAISE NOTICE 'Branding data successfully seeded for both verticals';
END $$;
```

---

## Part 3: Update Branding Utility to Read from Database

**Update:** `src/lib/branding.ts`

**Replace entire file with:**

```typescript
import { createServerClient } from './supabase/server'

export interface VerticalBranding {
  domain: string
  brand_name: string
  tagline: string
  logo_path: string
  favicon: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  meta: {
    title: string
    description: string
    keywords: string
  }
}

export interface VerticalConfig {
  vertical_id: string
  name_public: string
  branding: VerticalBranding
  vendor_fields?: any[]
  config?: any
}

// Fallback branding for each vertical (used if database unavailable)
export const defaultBranding: Record<string, VerticalBranding> = {
  fireworks: {
    domain: 'fireworksstand.com',
    brand_name: 'Fireworks Stand',
    tagline: 'Your Premier Fireworks Marketplace',
    logo_path: '/branding/fireworks-logo.svg',
    favicon: '/branding/fireworks-favicon.ico',
    colors: {
      primary: '#ff4500',
      secondary: '#ffa500',
      accent: '#ff6347',
      background: '#1a1a1a',
      text: '#ffffff'
    },
    meta: {
      title: 'Fireworks Stand - Buy & Sell Fireworks',
      description: 'Connect with licensed fireworks sellers in your area',
      keywords: 'fireworks, buy fireworks, fireworks stand, fireworks marketplace'
    }
  },
  farmers_market: {
    domain: 'farmersmarket.app',
    brand_name: 'Fresh Market',
    tagline: 'Farm Fresh, Locally Grown',
    logo_path: '/branding/farmers-logo.svg',
    favicon: '/branding/farmers-favicon.ico',
    colors: {
      primary: '#2d5016',
      secondary: '#6b8e23',
      accent: '#9acd32',
      background: '#f5f5dc',
      text: '#2d2d2d'
    },
    meta: {
      title: 'Fresh Market - Local Farmers & Producers',
      description: 'Buy fresh produce directly from local farmers',
      keywords: 'farmers market, fresh produce, local food, organic'
    }
  }
}

/**
 * Get vertical configuration from database
 * Falls back to default branding if database unavailable
 */
export async function getVerticalConfig(verticalId: string): Promise<VerticalConfig | null> {
  try {
    const supabase = createServerClient()
    
    const { data: vertical, error } = await supabase
      .from('verticals')
      .select('vertical_id, name_public, config')
      .eq('vertical_id', verticalId)
      .eq('is_active', true)
      .single()

    if (error || !vertical) {
      console.warn(`Failed to load vertical ${verticalId} from database, using fallback`)
      return getVerticalConfigFallback(verticalId)
    }

    // Extract branding from config
    const branding = vertical.config?.branding as VerticalBranding | undefined

    if (!branding) {
      console.warn(`No branding in database for ${verticalId}, using fallback`)
      return getVerticalConfigFallback(verticalId)
    }

    return {
      vertical_id: vertical.vertical_id,
      name_public: vertical.name_public,
      branding,
      vendor_fields: vertical.config?.vendor_fields,
      config: vertical.config
    }
  } catch (error) {
    console.error(`Error loading vertical config for ${verticalId}:`, error)
    return getVerticalConfigFallback(verticalId)
  }
}

/**
 * Fallback: Use default branding if database unavailable
 */
function getVerticalConfigFallback(verticalId: string): VerticalConfig | null {
  const branding = defaultBranding[verticalId]
  
  if (!branding) {
    return null
  }

  return {
    vertical_id: verticalId,
    name_public: verticalId === 'fireworks' ? 'Fireworks Marketplace' : 'Farmers Market',
    branding
  }
}

/**
 * Get branding by domain (for multi-domain routing)
 */
export async function getBrandingByDomain(domain: string): Promise<{ 
  vertical_id: string
  branding: VerticalBranding 
} | null> {
  try {
    const supabase = createServerClient()
    
    const { data: verticals, error } = await supabase
      .from('verticals')
      .select('vertical_id, config')
      .eq('is_active', true)

    if (error || !verticals) {
      return getBrandingByDomainFallback(domain)
    }

    // Find vertical with matching domain in branding config
    for (const vertical of verticals) {
      const branding = vertical.config?.branding as VerticalBranding | undefined
      if (branding?.domain === domain) {
        return {
          vertical_id: vertical.vertical_id,
          branding
        }
      }
    }

    // No match found - use fallback
    return getBrandingByDomainFallback(domain)
  } catch (error) {
    console.error('Error loading branding by domain:', error)
    return getBrandingByDomainFallback(domain)
  }
}

/**
 * Fallback: Map domains to verticals when database unavailable
 */
function getBrandingByDomainFallback(domain: string): {
  vertical_id: string
  branding: VerticalBranding
} | null {
  const domainMap: Record<string, string> = {
    'fireworksstand.com': 'fireworks',
    'www.fireworksstand.com': 'fireworks',
    'farmersmarket.app': 'farmers_market',
    'www.farmersmarket.app': 'farmers_market',
    'localhost:3002': 'fireworks', // Default for dev
    'inpersonmarketplace.vercel.app': 'fireworks', // Default for staging
  }

  const verticalId = domainMap[domain]
  if (!verticalId) return null

  const branding = defaultBranding[verticalId]
  if (!branding) return null

  return {
    vertical_id: verticalId,
    branding
  }
}

/**
 * Get all active verticals (for homepage listing)
 */
export async function getAllVerticals(): Promise<VerticalConfig[]> {
  try {
    const supabase = createServerClient()
    
    const { data: verticals, error } = await supabase
      .from('verticals')
      .select('vertical_id, name_public, config')
      .eq('is_active', true)
      .order('vertical_id')

    if (error || !verticals) {
      console.warn('Failed to load verticals from database, using fallback')
      return getAllVerticalsFallback()
    }

    return verticals
      .map(v => ({
        vertical_id: v.vertical_id,
        name_public: v.name_public,
        branding: v.config?.branding as VerticalBranding,
        vendor_fields: v.config?.vendor_fields,
        config: v.config
      }))
      .filter(v => v.branding != null) // Only include verticals with branding
  } catch (error) {
    console.error('Error loading all verticals:', error)
    return getAllVerticalsFallback()
  }
}

/**
 * Fallback: Return hardcoded verticals
 */
function getAllVerticalsFallback(): VerticalConfig[] {
  return [
    {
      vertical_id: 'fireworks',
      name_public: 'Fireworks Marketplace',
      branding: defaultBranding.fireworks
    },
    {
      vertical_id: 'farmers_market',
      name_public: 'Farmers Market',
      branding: defaultBranding.farmers_market
    }
  ]
}
```

---

## Part 4: Update Homepage to Use Database Verticals

**Update:** `src/app/page.tsx`

**Replace vertical loading with:**

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { getAllVerticals } from '@/lib/branding'
import Link from 'next/link'

export default async function HomePage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get verticals from database
  const verticals = await getAllVerticals()

  return (
    <div style={{ padding: 40 }}>
      {/* Auth Navigation */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        gap: 10,
        marginBottom: 30 
      }}>
        {user ? (
          <>
            <span>Welcome, {user.email}</span>
            <Link href="/dashboard" style={{ color: '#0070f3', marginLeft: 10 }}>
              Dashboard
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" style={{ color: '#0070f3' }}>
              Login
            </Link>
            <span>|</span>
            <Link href="/signup" style={{ color: '#0070f3' }}>
              Sign Up
            </Link>
          </>
        )}
      </div>

      {/* Page Header */}
      <h1 style={{ marginBottom: 30 }}>FastWrks – InPersonMarketplace</h1>

      {/* Verticals Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 20,
        marginTop: 30
      }}>
        {verticals.map((vertical) => (
          <Link
            key={vertical.vertical_id}
            href={`/${vertical.vertical_id}/vendor-signup`}
            style={{
              display: 'block',
              padding: 30,
              backgroundColor: vertical.branding.colors.background,
              color: vertical.branding.colors.text,
              border: `2px solid ${vertical.branding.colors.primary}`,
              borderRadius: 8,
              textDecoration: 'none',
              transition: 'transform 0.2s'
            }}
          >
            <h2 style={{ 
              color: vertical.branding.colors.primary,
              marginBottom: 10
            }}>
              {vertical.branding.brand_name}
            </h2>
            <p style={{ 
              color: vertical.branding.colors.secondary,
              marginBottom: 15
            }}>
              {vertical.branding.tagline}
            </p>
            <span style={{ 
              color: vertical.branding.colors.accent,
              fontWeight: 600
            }}>
              Become a Vendor →
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

---

## Part 5: Test Database-Driven Verticals

### Test 1: Verify Database Has Branding
```sql
-- Run in Supabase SQL Editor
SELECT 
  vertical_id,
  name_public,
  config->'branding'->>'brand_name' as brand_name,
  config->'branding'->>'domain' as domain,
  is_active
FROM verticals
ORDER BY vertical_id;
```

**Expected:** 2 rows with branding data

### Test 2: Homepage Loads Verticals
1. Visit http://localhost:3002
2. ✅ Should show both verticals
3. ✅ Fireworks card with dark background
4. ✅ Farmers market card with beige background
5. ✅ Correct colors and branding

### Test 3: Signup Pages Still Work
1. Click fireworks card
2. ✅ Should show fireworks signup with branding
3. Go back, click farmers market
4. ✅ Should show farmers market signup with branding

### Test 4: Fallback Works
1. Stop Supabase connection (change .env.local URL temporarily)
2. Restart dev server
3. Visit homepage
4. ✅ Should still show verticals (using fallback)
5. ✅ Branding should match defaults

### Test 5: Add New Vertical (Via SQL)
```sql
-- Add a test vertical
INSERT INTO verticals (vertical_id, name_public, is_active, config)
VALUES (
  'test_market',
  'Test Market',
  true,
  '{
    "branding": {
      "domain": "testmarket.com",
      "brand_name": "Test Market",
      "tagline": "Testing the System",
      "logo_path": "/branding/test-logo.svg",
      "favicon": "/branding/test-favicon.ico",
      "colors": {
        "primary": "#0066cc",
        "secondary": "#0099ff",
        "accent": "#00ccff",
        "background": "#ffffff",
        "text": "#000000"
      },
      "meta": {
        "title": "Test Market",
        "description": "Test description",
        "keywords": "test"
      }
    },
    "vendor_fields": []
  }'::jsonb
);
```

1. Add vertical via SQL above
2. Visit homepage
3. ✅ Should show 3 verticals now
4. ✅ Test Market card should appear
5. ✅ No code deployment needed

---

## Migration Files

**Files to create:**
1. `20260105_HHMMSS_001_add_branding_to_verticals.sql`
2. `20260105_HHMMSS_002_seed_vertical_branding.sql`

**Remember:** Use actual timestamps when creating files

---

## Session Summary Requirements

**Tasks Completed:**
- [ ] Created migration to add branding comments
- [ ] Created migration to seed branding data
- [ ] Updated branding utility to read from database
- [ ] Added fallback branding for offline mode
- [ ] Updated homepage to use getAllVerticals()
- [ ] Applied migrations to Dev
- [ ] Applied migrations to Staging
- [ ] All test scenarios passed

**Migration Files Created:**
```
supabase/migrations/20260105_HHMMSS_001_add_branding_to_verticals.sql
  Purpose: Add comments and index for config column
  Created: [timestamp]
  Applied: ✅ Dev ([timestamp]) | ✅ Staging ([timestamp])

supabase/migrations/20260105_HHMMSS_002_seed_vertical_branding.sql
  Purpose: Seed branding data for fireworks and farmers_market
  Created: [timestamp]
  Applied: ✅ Dev ([timestamp]) | ✅ Staging ([timestamp])
```

**Files Modified:**
```
src/lib/branding.ts - Complete rewrite to use database
src/app/page.tsx - Updated to use getAllVerticals()
```

**Testing Results:**
- Database contains branding data
- Homepage loads verticals from database
- Signup pages use database branding
- Fallback works when database unavailable
- Can add new verticals via SQL without deployment

---

## Benefits of This Change

### For Development
- Add new verticals without code deployment
- Update branding without rebuilding app
- Test new verticals in staging easily
- Cleaner separation of data and code

### For Operations
- Can enable/disable verticals dynamically
- Can A/B test different branding
- Can manage verticals via admin panel (future)
- Single source of truth in database

### For Scaling
- Easy to add new marketplaces
- Supports white-label scenarios
- Config versioning via database
- Backup and restore easier

---

**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Priority:** Medium (infrastructure improvement)
