# Current Task: [No Active Task]
Last Updated: 2026-02-05

## Status
No multi-step task currently in progress.

---

## Template (copy this when starting a new task)

```markdown
# Current Task: [Brief Title]
Started: [Date]

## Goal
[What we're trying to accomplish]

## Key Decisions Made
- [Decision 1]: [WHY this decision was made]
- [Decision 2]: [WHY]

## Critical Context (DO NOT FORGET)
- [Important fact that must not be lost]
- [Business rule or constraint]
- [Technical detail that affects implementation]

## What's Been Completed
- [ ] Step 1
- [x] Step 2 (completed)

## What's Remaining
- [ ] Next step
- [ ] Final step

## Files Modified
- `path/to/file.ts` - [what was changed]

## Gotchas / Watch Out For
- [Thing that caused problems]
- [Edge case to remember]
```

---

## Recent Task History (for reference)

### 2026-02-05: Pickup Scheduling Implementation
- Added schedule_id and pickup_date to cart_items and order_items
- Created SQL functions: get_available_pickup_dates, validate_cart_item_schedule, build_pickup_snapshot
- Key decision: cutoff_hours comes from database (18 for traditional, 10 for private_pickup) - NOT hardcoded
- Fixed: "closing soon" threshold now uses market-specific cutoff_hours, not hardcoded 24

### Key Business Rules (persist across all tasks)
- Traditional markets: 18-hour cutoff before pickup
- Private pickup: 10-hour cutoff before pickup
- These values are stored in `markets.cutoff_hours` column
- Never hardcode cutoff values - always read from database
