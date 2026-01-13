# Session Summary: Phase-M-1-Seed-Data-Script

**Date:** 2026-01-13
**Duration:** ~1 hour
**Branch:** feature/seed-data-script
**Status:** Complete

---

## Completed This Session

- ✓ Created comprehensive seed-data.ts script at `/apps/web/scripts/seed-data.ts`
- ✓ Script creates test users (auth + profiles), vendors, listings, orders
- ✓ Configurable via environment variables (NUM_VENDORS, NUM_LISTINGS, etc.)
- ✓ Clears existing test data before seeding (safe cleanup)
- ✓ Installed tsx and dotenv dependencies
- ✓ Added `npm run seed` command to package.json
- ✓ Created comprehensive README with usage instructions
- ✓ Successfully tested - created 33 users, 10 vendors, 18 listings, 15 orders

---

## NOT Completed (if applicable)

- ⏸ Markets seeding (markets tables not yet created - waiting for Phase-K-1)

---

## Issues Encountered & Resolutions

**Issue 1:** Script couldn't find environment variables
**Solution:** Added dotenv dependency and `import { config as loadEnv } from 'dotenv'; loadEnv({ path: '.env.local' });` at top of script

**Issue 2:** "Invalid API key" errors
**Solution:** Tracy configured correct SUPABASE_SERVICE_ROLE_KEY in .env.local

**Issue 3:** "duplicate key value violates unique constraint user_profiles_user_id_key"
**Solution:** Database trigger auto-creates user_profiles on auth user creation. Changed script to query for existing profile instead of inserting, then update with additional fields. Added retry logic to handle timing.

**Issue 4:** "vendor_profiles_user_id_fkey" foreign key constraint violation
**Solution:** FK was changed in migration 20260106_155657 to reference `user_profiles(user_id)` instead of `user_profiles(id)`. Changed script to use `authId` (auth.users.id) instead of `profileId` for vendor_profiles.user_id.

---

## Migrations Created

None - no database changes in this phase.

---

## Testing Performed

**Script execution:**
```
npm run seed
```

**Results:**
- ✅ 33 users created (10 vendors, 23 buyers)
- ✅ 10 vendor profiles (5 fireworks, 5 farmers_market verticals)
- ✅ 18 listings with various statuses
- ✅ 15 orders with order items

**Test credentials:**
- Email: any `@test.com` email (e.g., `lisa.miller0@test.com`)
- Password: `TestPassword123!`

---

## Commits

**Total commits:** 6
**Branch:** feature/seed-data-script
**Pushed to GitHub:** Yes

1. `feat(scripts): Add seed data script` - Initial script creation
2. `docs(scripts): Add seed data README` - Usage documentation
3. `fix(scripts): Load .env.local in seed script` - Added dotenv
4. `fix(scripts): Update user profile instead of insert` - Handle trigger
5. `fix(scripts): Use authId for vendor_profiles FK` - Correct FK reference

---

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `/apps/web/scripts/seed-data.ts` | Created | Main seed script |
| `/apps/web/scripts/README.md` | Created | Usage documentation |
| `/apps/web/package.json` | Modified | Added seed script, dotenv dependency |

---

## Next Session Should Start With

Phase complete. Script is working and tested. Ready to merge to main.

---

## Notes for Tracy

**To run the seed script again:**
```bash
cd apps/web
npm run seed
```

**Custom amounts:**
```bash
NUM_VENDORS=20 NUM_LISTINGS=50 npm run seed
```

**Key learnings for future scripts:**
1. Database has trigger that auto-creates user_profiles - don't try to insert manually
2. vendor_profiles.user_id references user_profiles.user_id (auth user id), not user_profiles.id
3. Use dotenv to load .env.local for scripts that need environment variables

**Data created:**
- 50% fireworks vertical, 50% farmers_market vertical
- Vendors have fake Stripe account IDs for testing
- Orders have order_items linked to listings and vendors
- All test data uses @test.com emails for easy identification/cleanup
