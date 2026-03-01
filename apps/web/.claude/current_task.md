# Current Task: Vendor Trial System + Business Rules Audit
Started: 2026-02-28

## Goal
1. Build vendor trial system (auto-grant Basic tier on FT approval, 90-day trial, grace period, auto-unpublish)
2. Continue business rules audit file ✅ marking

## Status: Trial system COMPLETE, needs commit

## What Was Done This Session

### Prior Work (from earlier compaction)
- Market Box Payout Fix — COMMITTED (`433275f`), pushed to staging
- Schema Snapshot + Migration Move — COMMITTED (`78e9514`), pushed to staging
- Phase 7 Payout Gap Fix — COMMITTED (`47e66a2`), pushed to staging
- Business Rules Audit ✅ marking — MP-R1-R28, OL-R1-R18, VI-R1-R15 all marked

### Vendor Trial System — UNCOMMITTED
**10 files changed/created. 0 TypeScript errors.**

1. **Migration 060**: `supabase/migrations/20260228_060_vendor_trial_system.sql`
   - Added `trial_started_at`, `trial_ends_at`, `trial_grace_ends_at` to vendor_profiles
   - Partial index for cron efficiency

2. **6 notification types**: `src/lib/notifications/types.ts`
   - `vendor_approved_trial`, `trial_reminder_14d/7d/3d`, `trial_expired`, `trial_grace_expired`
   - New template data fields: trialDays, trialTier, trialEndsAt, unpublishedCount, deactivatedBoxCount

3. **Approval route**: `src/app/api/admin/vendors/[id]/approve/route.ts`
   - Auto-grants Basic tier + 90-day trial on FT vendor approval
   - Sends `vendor_approved_trial` notification instead of `vendor_approved`
   - `!data.trial_started_at` check prevents double-grant

4. **VendorActions fix**: `src/app/admin/vendors/[vendorId]/VendorActions.tsx`
   - Approve now calls API route (not direct DB), so trial logic runs
   - Reject/suspend still use direct DB (no trial logic needed)

5. **Cron Phase 10**: `src/app/api/cron/expire-orders/route.ts`
   - 10a: Trial reminders (14d/7d/3d before expiry, deduped via notifications table)
   - 10b: Trial expiration (downgrade to free, send trial_expired notification)
   - 10c: Grace period expiration (auto-unpublish excess listings → draft, deactivate market boxes)

6. **Subscription status API**: `src/app/api/vendor/subscription/status/route.ts`
   - Returns trial_started_at, trial_ends_at, trial_grace_ends_at

7. **TrialStatusBanner**: `src/components/vendor/TrialStatusBanner.tsx` (new)
   - Blue info banner during trial with days remaining
   - Yellow warning banner during grace period
   - Upgrade CTA linking to upgrade page

8. **Dashboard integration**: `src/app/[vertical]/vendor/dashboard/page.tsx`
   - TrialStatusBanner shown above QualityAlertBanner

9. **Stripe webhook**: `src/lib/stripe/webhooks.ts`
   - Clears trial_ends_at + trial_grace_ends_at on paid subscription activation

10. **Downgrade-free**: `src/app/api/vendor/subscription/downgrade-free/route.ts`
    - Clears trial_ends_at + trial_grace_ends_at on voluntary downgrade

## Git State
- Main is 3 ahead of origin/main (commits `433275f`, `78e9514`, `47e66a2`)
- All 3 pushed to staging
- UNCOMMITTED: Trial system (10 files) + business rules audit ✅ marks

## Next Steps
- User to apply migration 060 to dev/staging
- Full tier restructure (FM free tier, updated limits for all tiers) — separate task
- Continue business rules audit ✅ marking when user provides remaining responses

## Open Items (Carried Over)
- Instagram URLs still placeholder `#` in Coming Soon footers
- Events Phase 5 (reminders + conversion) — deferred
- Dev DB may be out of sync on some migrations
- Migrations 057+058 schema snapshot update still needed
