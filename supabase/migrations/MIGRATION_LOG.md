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
- **Last verified sync:** 2026-01-05 (pending 2 new migrations)

---

## Environment Sync Status

### Current State: ✅ SIGNUP WORKING
- Dev: Fully up to date with all migrations
- Staging: Needs trigger fix migration
- Phase 5 branding migrations pending on both environments

### Action Required
1. ✅ Signup working on Dev
2. ❌ Apply branding migrations (20260106_*) to Dev
3. ❌ Apply branding migrations (20260106_*) to Staging
4. ❌ Apply user profile trigger to Staging (20260105_152200_001)
5. ❌ Update this log with timestamps

---

## Migration Standards Reference
See `MIGRATION_STANDARDS.md` for:
- File naming conventions (with timestamps)
- Required header format
- Application workflow
- Versioning rules
- Tracking procedures
