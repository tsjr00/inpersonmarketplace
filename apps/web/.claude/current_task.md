# Current Task: Supabase Linter Issues Remediation

Started: 2026-02-21

## Goal
Address all warnings/suggestions from the Supabase database linter (staging environment) in a single migration.

## Status
- [x] Read entire linter report file
- [x] Categorized all issues
- [x] Explored codebase — found all policy definitions + duplicate index pairs
- [x] Written remediation plan
- [x] Got user approval
- [x] Created migration: `supabase/migrations/20260221_046_supabase_linter_fixes.sql`
- [x] Updated SCHEMA_SNAPSHOT.md changelog
- [ ] User applies migration to staging
- [ ] Re-run Supabase linter to verify warnings resolved
- [ ] Test key flows on staging
- [ ] Move migration to applied/ after confirmation

## Migration Contents (046)

### Part 1: Merged 9 Overlapping Permissive Policies
1. **knowledge_articles**: Replaced FOR ALL + FOR SELECT with single SELECT (public + admin) + 3 per-op admin policies (INSERT, UPDATE, DELETE)
2. **payments**: Merged buyer_select + admin_select into single SELECT
3. **shopper_feedback**: Merged user + platform admin + vertical admin into single SELECT
4. **vendor_fee_balance**: Merged vendor + admin into single SELECT
5. **vendor_fee_ledger**: Merged vendor + admin into single SELECT
6. **vendor_feedback**: Merged vendor + platform admin + vertical admin into single SELECT
7. **vendor_profiles**: Dropped redundant `vendor_profiles_admin_select` (main policy already comprehensive)
8. **vendor_verifications**: Merged vendor + admin UPDATE into single UPDATE with USING + WITH CHECK
9. **zip_codes**: Replaced FOR ALL + FOR SELECT with single SELECT (public) + 3 per-op admin policies

### Part 2: Dropped 4 Duplicate Indexes
- idx_market_box_subscriptions_offering_active (kept idx_market_box_subs_active)
- idx_order_items_order_id (kept idx_order_items_order)
- idx_orders_buyer_user_id (kept idx_orders_buyer)
- idx_orders_parent_id (kept idx_orders_parent)

### Part 3: Added 18 FK Indexes
admin_activity_log(vertical_id), error_reports(4 columns), knowledge_articles(vertical_id),
market_box_subscriptions(order_id), markets(reviewed_by), orders(external_payment_confirmed_by),
shopper_feedback(resolved_by), vendor_activity_flags(resolved_by), vendor_activity_settings(updated_by),
vendor_feedback(resolved_by), vendor_location_cache(source_market_id), vendor_referral_credits(voided_by),
vendor_verifications(coi_verified_by, reviewed_by), vertical_admins(granted_by)

### Part 4: Dropped 4 Legacy Indexes
- idx_transactions_listing, idx_transactions_vendor (legacy transactions table)
- idx_fulfillments_transaction, idx_fulfillments_status (legacy fulfillments table)

## Key Decisions Made
- **FOR ALL → per-operation split**: knowledge_articles and zip_codes had FOR ALL admin policies overlapping with FOR SELECT public policies. Simply dropping the SELECT wouldn't help — FOR ALL still generates a permissive SELECT. Had to break FOR ALL into INSERT + UPDATE + DELETE separately.
- **payments policy name**: Original was `payments_buyer_select` (from migration 001). Dropped both possible names with IF EXISTS for safety.
- **Used `(SELECT is_platform_admin())`**: Standard helper function, consistent with rest of codebase.
- **Used `user_vendor_profile_ids()`**: SECURITY DEFINER helper that bypasses RLS for vendor profile lookups (avoids recursion).
- **Conservative on unused indexes**: Only dropped 4 legacy indexes on transactions/fulfillments. Kept all other "unused" indexes — staging has low data, they'll be needed at scale.

## Files Modified
- `supabase/migrations/20260221_046_supabase_linter_fixes.sql` — NEW migration
- `supabase/SCHEMA_SNAPSHOT.md` — changelog entry added

## Gotchas / Watch Out For
- FOR ALL policies in PostgreSQL create implicit permissive policies for ALL operations including SELECT — can't just merge the SELECT overlay
- `payments_buyer_select` vs `payments_select` — unclear which name is in DB, dropped both with IF EXISTS
- After applying, must run `NOTIFY pgrst, 'reload schema'` (included in migration)
