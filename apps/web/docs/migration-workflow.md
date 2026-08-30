# Migration Workflow

**Loaded only when working on migrations.** For the rule that schema snapshot must be updated after every migration, see `apps/web/.claude/rules/verification-discipline.md` Rule 3.

---

## Migration File Naming

Format: `YYYYMMDD_NNN_description.sql`
- Use sequential numbers (001, 002, etc.) within each day
- Keep descriptions short but meaningful

## Commit Messages for Migrations

Include:
- What tables are affected
- What issue is being fixed
- Co-author line for Claude

---

## Applied Migrations Workflow

A migration's location follows its real-world deployment state. The file is in `supabase/migrations/` while it is pending in any environment, and only moves to `supabase/migrations/applied/` once it is confirmed applied to **ALL THREE** environments (Dev + Staging + Prod).

### As soon as Dev + Staging are confirmed applied:

1. **User confirms:** "Migration [filename] applied to dev and staging"
2. **Claude updates `SCHEMA_SNAPSHOT.md`** — ALL of these, EVERY TIME, NO EXCEPTIONS:
   - **A. Changelog entry** (date, migration file, what changed) — even for "logic-only" changes like trigger rewrites
   - **B. Function/trigger descriptions** updated if any function or trigger behavior changed
   - **C. Structured tables** regenerated if columns/tables/FKs/indexes were added/altered (ask user to run `REFRESH_SCHEMA.sql`)
   - If user defers refresh, note staleness in `current_task.md`
   - **WHY:** Schema snapshot is not just for columns — it documents trigger behavior, function signatures, config data, and RLS policies. ANY migration that changes database behavior must be reflected here.
3. ~~MIGRATION_LOG.md~~ — **RETIRED (owner 2026-08-30).** The snapshot Change Log row from step 2A IS the application record (guardrail Rule G enforces it). Do not maintain a separate log.
4. **Claude does NOT move the file yet.** The file stays in `supabase/migrations/` because Prod has not yet been applied. Moving prematurely makes it look "done" when there's still a pending environment.
5. **Claude commits:** With a message describing what was applied to dev + staging and that Prod is still pending.

### After Prod is confirmed applied:

6. **User confirms:** "Migration [filename] applied to prod"
7. **Claude moves the file:** `supabase/migrations/[file].sql` → `supabase/migrations/applied/[file].sql`
8. ~~MIGRATION_LOG.md~~ — retired; nothing to do here.
9. **Claude updates `SCHEMA_SNAPSHOT.md` Change Log entry** — replaces "Pending Prod" with "Applied to all 3 envs".
10. **Claude commits:** "chore: migration NNN applied to prod — moved to applied/".

**CRITICAL:** The bookkeeping batches above (steps 2-4 for dev+staging, steps 7-9 for prod) are each single atomic operations. Do NOT update only one of the three files — they always move together.

### Why all-three-envs as the trigger to move

The `applied/` folder is meant to mean "this migration is fully deployed everywhere." A file in `applied/` while prod is still pending creates a false sense of completion and can confuse the next session about deployment state.

Past slippage incidents (Session 71, 2026-04-25) involved migrations being moved at the dev+staging mark and then forgotten before prod application — leaving prod silently behind. Holding the move until all 3 envs are confirmed prevents that drift.

---

## Folder Structure

```
supabase/migrations/
├── applied/           # Confirmed applied to ALL 3 envs (Dev + Staging + Prod)
│   ├── 20260103_001_initial_schema.sql
│   └── ...
├── MIGRATION_LOG.md   # RETIRED pointer stub — the snapshot Change Log is the record
├── README.md          # Migration standards
└── 20260205_004_new_feature.sql  # Pending migrations (not yet in all 3 envs)
```

## Rules

- **Never move a migration** until user explicitly confirms it is applied to ALL 3 envs (Dev + Staging + Prod). Dev + Staging is the trigger for bookkeeping (changelog + snapshot updates) — but the file stays in `supabase/migrations/` until Prod is also applied.
- **Never delete migrations** — always move to `applied/`
- **The snapshot's structured tables carry a stamp** (`Structured tables rebuilt: <date> · current through migration NNN`, snapshot header). Guardrail Rule L fails the suite when any newer migration CREATEs a table or more than 5 migrations exist past the stamp — the fix is a real rebuild (owner runs `supabase/REFRESH_SCHEMA.sql` on Dev; Claude regenerates the structured sections and moves the stamp). Never move the stamp without a rebuild.
- If only applied to Dev (not Staging), leave in root folder with ✅ Dev / ❌ Staging in log.

---

## Schema Discovery Queries

For verifying schema state when SCHEMA_SNAPSHOT.md is stale or you suspect drift:

```sql
-- Tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;

-- Columns
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Foreign Keys
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
```

For comprehensive refresh: `supabase/REFRESH_SCHEMA.sql`.

---

## Deletion Order for Cleaning Data

Always reference `supabase/SCHEMA_SNAPSHOT.md` for foreign key relationships to determine correct deletion order. Never guess at table dependencies.
