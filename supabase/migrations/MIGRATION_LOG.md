# Migration Application Log

## Legend
- ✅ Applied successfully
- ❌ Failed / Not yet applied
- 🔄 In progress
- ⚠️ Needs attention

---

## Current Status

| Migration File | Dev Status | Dev Date | Staging Status | Staging Date | Notes |
|----------------|------------|----------|----------------|--------------|-------|
| 20260103_001_initial_schema.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Initial 11 tables, enums, indexes |
| 20260103_002_rls_policies.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Row Level Security policies |
| 20260103_003_functions_triggers.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Auto-update timestamps |
| 20260103_004_seed_data.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Seed fireworks + farmers_market |
| 20260104_001_allow_anonymous_vendors.sql | ✅ | 2026-01-04 | ✅ | 2026-01-04 | Remove vendor_owner_check constraint |
| 20260104_002_remove_permit_years.sql | ✅ | 2026-01-04 | ✅ | 2026-01-04 | Remove permit_years from fireworks config |
| 20260104_003_vendor_vertical_constraint.sql | ✅ | 2026-01-05 | ✅ | 2026-01-05 | Unique constraint on (user_id, vertical_id) |
| 20260105_152200_001_user_profile_trigger.sql | ⚠️ | 2026-01-05 | ❌ | - | Applied but BROKEN - wrong column name |
| 20260105_152230_002_user_profiles_rls.sql | ✅ | 2026-01-05 | ❌ | - | RLS policies for user_profiles |
| 20260105_180000_001_fix_user_profile_trigger.sql | ✅ | 2026-01-05 | ✅ | 2026-01-05 | FIX: use display_name not full_name |
| 20260106_093233_001_add_branding_to_verticals.sql | ❌ | - | ❌ | - | Add comments and GIN index for config |
| 20260106_093233_002_seed_vertical_branding.sql | ❌ | - | ❌ | - | Seed branding data for verticals |
| 20260109_204341_001_orders_and_payments.sql | ✅ | 2026-01-09 20:43 | ✅ | 2026-01-09 21:15 | Phase 3: Core commerce tables |
| 20260114_001_phase_k1_markets_tables.sql | ✅ | 2026-01-14 | ❌ | - | Phase K-1: Markets tables, schedules, vendor-market links |
| 20260114_002_phase_k1_listings_market_link.sql | ✅ | 2026-01-14 | ❌ | - | Phase K-1: listing_markets join table |
| 20260115_001_add_markets_active_column.sql | ✅ | 2026-01-15 | ❌ | - | Add active flag to markets |
| 20260115_002_add_markets_contact_email.sql | ✅ | 2026-01-15 | ❌ | - | Add contact_email to markets |
| 20260115_003_add_vendor_profile_image.sql | ✅ | 2026-01-15 | ❌ | - | Add profile_image_url to vendor_profiles |
| 20260115_004_add_vendor_profile_fields.sql | ✅ | 2026-01-15 | ❌ | - | Add tier, has_completed_setup to vendor_profiles |
| 20260116_001_add_user_verticals.sql | ✅ | 2026-01-16 | ❌ | - | Phase J: User verticals for multi-vertical support |
| 20260116_002_add_buyer_tier.sql | ✅ | 2026-01-16 | ❌ | - | Phase J: Buyer premium tier support |
| 20260116_003_buyer_pickup_confirmation.sql | ✅ | 2026-01-16 | ❌ | - | Phase J-1: buyer_confirmed_at, pickup_confirmed_at |
| 20260116_004_order_cancellation_support.sql | ✅ | 2026-01-16 | ❌ | - | Phase J-2: Cancellation tracking fields |
| 20260116_005_order_expiration.sql | ✅ | 2026-01-16 | ❌ | - | Phase J-3: Order expiration based on pickup date |

---

## Pending Migrations (Not Yet Applied)

| Migration File | Target Environments | Priority | Blocker |
|----------------|---------------------|----------|---------|
| 20260105_152200_001_user_profile_trigger.sql | Dev, Staging | CRITICAL | Blocks signup |
| 20260105_152230_002_user_profiles_rls.sql | Dev, Staging | CRITICAL | Blocks signup |

---

## Failed/Rolled Back Migrations

| Migration File | Environment | Date | Reason | Resolution |
|----------------|-------------|------|--------|------------|
| [None yet] | - | - | - | - |

---

## Notes
- **Dev project:** vawpviatqalicckkqchs (InPersonMarketplace)
- **Staging project:** vfknvsxfgcwqmlkuzhnq (InPersonMarketplace-Staging)
- **Process:** Always apply to Dev first, test, then apply to Staging
- **Update this log:** Immediately after applying each migration
- **Last verified sync:** 2026-01-16

---

## Environment Sync Status

### Current State: ✅ DEV UP TO DATE
- Dev: Updated through Phase J-3 (order expiration)
- Staging: Behind - needs Phase K and J migrations

### Recent Additions (2026-01-16)
- **Phase K (Markets):** Market tables, schedules, vendor-market relationships
- **Phase J (Pre-sales):**
  - J-1: Buyer pickup confirmation, vendor fulfillment handoff
  - J-2: Order cancellation support (buyer and vendor)
  - J-3: Order expiration based on pickup date (with Vercel cron)

### Action Required
1. ❌ Apply Phase K migrations (20260114_*, 20260115_*) to Staging
2. ❌ Apply Phase J migrations (20260116_*) to Staging
3. ❌ Configure CRON_SECRET env var in Vercel for expire-orders endpoint

---

## Migration Standards Reference
See `MIGRATION_STANDARDS.md` for:
- File naming conventions (with timestamps)
- Required header format
- Application workflow
- Versioning rules
- Tracking procedures
