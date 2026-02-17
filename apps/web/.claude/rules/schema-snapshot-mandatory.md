# RULE: Schema Snapshot Must Be Updated After Every Migration

**Priority: HIGH — This rule applies whenever ANY migration file is created, applied, or moved.**

## The Rule

**After ANY migration is confirmed applied, you MUST update `supabase/SCHEMA_SNAPSHOT.md` BEFORE moving the migration file or committing the "applied" status.**

This is NOT optional. This is NOT just for column additions. This applies to ALL migration types:
- Column/table additions or alterations
- Trigger function logic changes (even "logic-only" rewrites)
- RLS policy changes
- Index additions
- Config/JSONB data updates (e.g., `verticals.config`)
- RPC function changes
- Any DDL statement

## What "Update Schema Snapshot" Means

1. **Changelog entry** — Add a row to the Change Log table (date, migration, what changed)
2. **Function/trigger descriptions** — Update the Functions table if any function or trigger behavior changed
3. **Structured table regeneration** — If columns/tables/FKs/indexes were added, ask user to run `REFRESH_SCHEMA.sql` and rebuild tables

## Why This Exists

Migration 026 changed trigger function logic and added JSONB config data to the `verticals` table. The schema snapshot was NOT updated because the migration didn't add columns — only changed trigger behavior and config values. This was caught by the user, not by Claude. The root cause: the rules only emphasized column/table changes, causing Claude to skip the snapshot for "logic-only" migrations.

## Checklist (run mentally before every migration-related commit)

- [ ] Does this commit include a new migration file? → Schema snapshot changelog needed
- [ ] Does the migration modify any function or trigger? → Update function descriptions in snapshot
- [ ] Does the migration add columns/tables/indexes? → Full structured table regeneration needed
- [ ] Has the user confirmed the migration was applied? → Update snapshot BEFORE moving to applied/
