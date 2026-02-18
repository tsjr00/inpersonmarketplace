# Current Task: Session 31 — FT Same-Day Ordering + Codebase Audit

Started: 2026-02-18

## Session Summary

### Commits Made This Session (all pushed to staging, NOT production)
1. `a3f986c` — Fix 3 bugs: quantity units filter, cart pickup time, FT subscription renewal
2. `6cbec96` — Add food truck same-day ordering flow with location+time picker

### Migration 030 Status
- File: `20260218_030_ft_same_day_ordering.sql`
- **Applied to ALL 3 environments** (user confirmed)
- **Schema snapshot updated** (changelog + function description)
- **Migration log updated**
- **FILE NOT YET MOVED to applied/** — user rejected the mv command, needs to be done
- Run: `mv supabase/migrations/20260218_030_ft_same_day_ordering.sql supabase/migrations/applied/`

### What Migration 030 Does
- `get_available_pickup_dates()` recreated with vertical awareness
- FT: today only (not 7 days), accepts until market end_time, cutoff_hours=0
- FM: unchanged (7 days, advance cutoff 18/10 hours)
- `cutoff_hours` restored to RETURNS TABLE (was dropped in migration 010)
- Existing FT markets with NULL cutoff_hours updated to 0

### Uncommitted Changes
- `supabase/SCHEMA_SNAPSHOT.md` — changelog + function description for migration 030
- `supabase/migrations/MIGRATION_LOG.md` — added migration 030 entry
- `apps/web/.claude/current_task.md` — this file
- Various doc file deletions/modifications from previous sessions (not ours)
- The migration file itself needs moving to applied/

### NEEDS COMMIT + PUSH
After moving migration to applied:
```
git add supabase/SCHEMA_SNAPSHOT.md supabase/migrations/MIGRATION_LOG.md apps/web/.claude/current_task.md
# Also stage the migration move (delete from migrations/, add to applied/)
git commit -m "Move migration 030 to applied, update schema snapshot and migration log"
```

### What's NOT Done Yet
- User has NOT tested the staging deployment yet
- Production push pending (main is 6 commits ahead of origin/main)
- Audit findings written to `.claude/session31_audit.md` — see that file for full list

## Testing Instructions for User (for the 2 commits)

### Commit 1 (a3f986c) — 3 Bug Fixes
1. **Quantity units**: FT vendor → Create listing → unit dropdown should show FT units only (no bag/bunch/bouquet)
2. **Cart pickup time**: Add FT item to cart → pickup time visible in cart
3. **FT renewal webhook**: Can't test manually — fires on Stripe subscription renewal

### Commit 2 (6cbec96) — FT Same-Day Ordering
1. **FT location picker**: FT listing detail → "Select a Pickup Location:" with location cards + hours
2. **Time slots**: Click location → 30-min time slots appear below
3. **FT market visible while operating**: Listing available while truck is open (not just before start)
4. **FM unchanged**: FM listing detail → still shows "Select a Pickup Date below:" with dates

## Key Context for Next Session
- `isFoodTruck` variable added to AddToCartButton.tsx
- FT flow: location cards → time slots (no date picker)
- FM flow: completely unchanged
- `vertical_id` added to MarketWithSchedules interface and all Supabase market queries
- cutoff defaults changed from `|| 18` to `?? 18` (so 0 is respected, not treated as falsy)
- CutoffStatusBanner: added `cutoffThreshold === 0` early returns (FT has no advance cutoff concept)
