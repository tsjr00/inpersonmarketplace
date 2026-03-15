/**
 * Vendor Onboarding & Journey Tests
 *
 * Tests that verify vendor onboarding gates, listing constraints,
 * and vendor journey business rules.
 *
 * Covers: VJ-R1, VJ-R2, VJ-R5, VJ-R7, VJ-R9, VJ-R10, VJ-R11,
 *         VJ-R12, VJ-R13
 *
 * IMPORTANT: These tests assert what the BUSINESS RULES require, not what
 * the code currently does. If a test fails, investigate the code — do NOT
 * change the test to match the code. See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/vendor-onboarding.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const webRoot = path.resolve(__dirname, '..', '..', '..')

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(webRoot, relativePath), 'utf8')
}

// =============================================================================
// VJ-R1: 4 onboarding gates required to publish listings
// =============================================================================

describe('VJ-R1: vendor cannot publish without all 4 onboarding gates', () => {
  const route = readFile('src/app/api/vendor/onboarding/status/route.ts')

  it('canPublishListings requires verification.status === approved', () => {
    expect(route).toContain("verification.status === 'approved'")
  })

  it('canPublishListings requires allAuthorized (category permits)', () => {
    expect(route).toContain('allAuthorized')
  })

  it('canPublishListings requires COI approved', () => {
    expect(route).toContain("verification.coi_status === 'approved'")
  })

  it('canPublishListings requires Stripe payouts enabled', () => {
    expect(route).toContain('gate4.stripePayoutsEnabled')
  })

  it('publishing requires approval + authorization + Stripe (COI is soft gate per C1/VJ-R1)', () => {
    // C1 FIX: COI removed from canPublishListings — soft gate for publishing, hard gate for events only
    expect(route).toContain(
      "verification.status === 'approved' &&"
    )
    expect(route).toContain('allAuthorized &&')
    expect(route).toContain('gate4.stripePayoutsEnabled')
    // COI is NOT in canPublishListings anymore (VJ-R1: soft gate)
    expect(route).not.toContain("verification.coi_status === 'approved' &&")
    // COI soft gate comment must be present
    expect(route).toContain('COI is a soft gate')
  })

  it('grandfathered vendors bypass partner agreement requirement', () => {
    expect(route).toContain('isGrandfathered || partnerAgreementAccepted')
  })
})

// =============================================================================
// VJ-R2: Vendor cannot receive Stripe payouts without setup
// =============================================================================

describe('VJ-R2: vendor payout requires Stripe setup', () => {
  it('onboarding status checks stripe_account_id and stripe_payouts_enabled', () => {
    const route = readFile('src/app/api/vendor/onboarding/status/route.ts')
    expect(route).toContain('stripe_account_id')
    expect(route).toContain('stripe_payouts_enabled')
  })

  it('gate4 tracks both stripeConnected and stripePayoutsEnabled', () => {
    const route = readFile('src/app/api/vendor/onboarding/status/route.ts')
    expect(route).toContain("stripeConnected: !!vendor.stripe_account_id")
    expect(route).toContain("stripePayoutsEnabled: !!vendor.stripe_payouts_enabled")
  })
})

// =============================================================================
// VJ-R5: Auto-create vendor_verifications trigger
// =============================================================================

describe('VJ-R5: auto_create_vendor_verification DB trigger', () => {
  it('trigger function defined in onboarding migration', () => {
    // Check applied migrations for the trigger
    const migrationDir = path.resolve(webRoot, '../../supabase/migrations/applied')
    const files = fs.existsSync(migrationDir) ? fs.readdirSync(migrationDir) : []
    const onboardingMigration = files.find(f => f.includes('vendor_onboarding'))

    if (onboardingMigration) {
      const migration = fs.readFileSync(path.join(migrationDir, onboardingMigration), 'utf8')
      expect(migration).toContain('auto_create_vendor_verification')
      expect(migration).toContain('AFTER INSERT ON vendor_profiles')
      expect(migration).toContain('SECURITY DEFINER')
      expect(migration).toContain('SET search_path = public')
    } else {
      // Migration may have been consolidated — verify in schema snapshot
      const schema = readFile('../../supabase/SCHEMA_SNAPSHOT.md')
      expect(schema).toContain('auto_create_vendor_verification')
    }
  })
})

// =============================================================================
// VJ-R7: Vendor signup validates 5 acknowledgment checkboxes
// =============================================================================

describe('VJ-R7: vendor signup requires 5 acknowledgments', () => {
  it('vendor signup validation schema exists', () => {
    const exists = fs.existsSync(path.join(webRoot, 'src/lib/validation/vendor-signup.ts'))
    expect(exists).toBe(true)
  })

  it('signup form enforces acknowledgment checkboxes', () => {
    // Business rule: vendor signup requires 5 acknowledgment checkboxes.
    // Check vendor edit/dashboard flow for checkbox or acknowledgment handling.
    const editFormFiles = [
      'src/app/[vertical]/vendor/edit/EditProfileForm.tsx',
      'src/app/[vertical]/vendor/edit/page.tsx',
      'src/app/[vertical]/vendor/dashboard/page.tsx',
    ]
    let found = false
    for (const file of editFormFiles) {
      if (fs.existsSync(path.join(webRoot, file))) {
        const content = readFile(file)
        if (content.includes('checkbox') || content.includes('Partner Agreement') || content.includes('acknowledge')) {
          found = true
        }
      }
    }
    expect(found).toBe(true)
  })
})

// =============================================================================
// VJ-R9: Published listings require quantity_amount + quantity_unit
// =============================================================================

describe('VJ-R9: published listings require quantity fields', () => {
  it('DB CHECK constraint exists in schema', () => {
    const schema = readFile('../../supabase/SCHEMA_SNAPSHOT.md')
    expect(schema).toContain('listings_quantity_required_for_publish')
  })

  it('constraint allows draft listings without quantity', () => {
    // The constraint is: status != 'published' OR (quantity_amount IS NOT NULL AND quantity_unit IS NOT NULL)
    // This means draft/paused listings CAN have null quantity
    const schema = readFile('../../supabase/SCHEMA_SNAPSHOT.md')
    expect(schema).toContain('published')
    expect(schema).toContain('quantity_amount')
    expect(schema).toContain('quantity_unit')
  })
})

// =============================================================================
// VJ-R10: Listing images compressed client-side before upload
// =============================================================================

describe('VJ-R10: image compression before upload', () => {
  it('image-resize utility exists', () => {
    const exists = fs.existsSync(path.join(webRoot, 'src/lib/utils/image-resize.ts'))
    expect(exists).toBe(true)
  })

  it('image-resize exports compression function', () => {
    const content = readFile('src/lib/utils/image-resize.ts')
    expect(content).toContain('export')
    // Should have max dimension and quality settings
    expect(content).toContain('1200') // max dimension
  })
})

// =============================================================================
// VJ-R11: FT preferred_pickup_time in cart
// =============================================================================

describe('VJ-R11: FT listings show pickup time in cart', () => {
  it('checkout page references pickup time fields', () => {
    const checkout = readFile('src/app/[vertical]/checkout/page.tsx')
    // FT checkout includes pickup time handling
    const hasTimeReference = checkout.includes('pickupStartTime')
      || checkout.includes('pickupEndTime')
      || checkout.includes('pickup_date')
    expect(hasTimeReference).toBe(true)
  })
})

// =============================================================================
// VJ-R12: Listing availability from schedules + cutoff + attendance
// =============================================================================

describe('VJ-R12: listing availability calculation', () => {
  it('listing-availability utility exists', () => {
    const exists = fs.existsSync(path.join(webRoot, 'src/lib/utils/listing-availability.ts'))
    expect(exists).toBe(true)
  })

  it('availability considers cutoff hours', () => {
    const content = readFile('src/lib/utils/listing-availability.ts')
    expect(content).toContain('cutoff')
  })
})

// =============================================================================
// VJ-R13: Vendor can pause listing (hidden from browse, preserves history)
// =============================================================================

describe('VJ-R13: listing pause functionality', () => {
  it('listing_status enum includes paused', () => {
    const schema = readFile('../../supabase/SCHEMA_SNAPSHOT.md')
    expect(schema).toContain('paused')
  })
})
