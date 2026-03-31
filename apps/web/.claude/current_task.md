# Current Task: Audit Remediation — Batched Implementation
Started: 2026-03-31 (Session 66 continued)

## Status: Batch 1 COMPLETE — Batches 2-5 remaining

### Batch Progress

| Batch | Status | Items | Focus |
|-------|--------|-------|-------|
| **1** | COMPLETE (committed, on staging) | C-1, C-2, C-3, C-4, M-2, M-3, M-4, L-1, L-2, L-3 | Data fixes, dedup, atomic threshold, children safety |
| **2** | NOT STARTED | C-5+H-1, H-2 | Root cause refactor (approval duplication) + timezone |
| **3** | NOT STARTED | H-4, H-5, H-6 | Language + privacy (FT→vertical-aware nouns, privacy model) |
| **4** | NOT STARTED | H-7, H-8, M-13 | Query optimization (N+1), price filtering, vendor status check |
| **5** | NOT STARTED | M-1, M-5, M-6, M-7, M-8, M-10, M-11, M-14, H-3, L-4, L-5, L-6 | UX + safety remaining items |

### Key Documents
- **Audit report:** `.claude/session66_code_audit.md` — 34 findings (original audit)
- **Audit response:** `.claude/audit_response_session66.md` — user-approved fixes with proposals for each item
- **Day-of sales analysis:** `.claude/day_of_event_sales_analysis.md` — research on same-day event ordering (no code changes)

### Batch 2 Plan (C-5+H-1 + H-2)

**C-5+H-1: Root cause refactor**
Three files duplicate event approval logic (token gen + market creation + schedule creation):
1. `event-actions.ts:approveEventRequest()` (lines 65-129) — shared function
2. `admin/events/[id]/route.ts` (lines 112-173) — DUPLICATES shared function
3. `admin/events/route.ts` (lines 289-331) — ALSO DUPLICATES

Fix:
1. Add error handling to schedule insert in `event-actions.ts`
2. Replace 62-line block in `admin/events/[id]/route.ts` with call to `approveEventRequest()`
3. Replace 42-line block in `admin/events/route.ts` with same call
4. Result: bug fixed once, applies everywhere

**H-2: Timezone standardization**
4 files use inconsistent timezone patterns:
- `event-requests/route.ts:99` — local time
- `cancel/route.ts:101` — mixed local/UTC (L-3 null check done in Batch 1)
- `admin/events/[id]/route.ts:161` — local parse, UTC day
- `expire-orders/route.ts` Phases 14-15 — UTC
Fix: use UTC consistently or market timezone where available

### Batch 3 Plan (H-4, H-5, H-6)
8 locations with FT-specific language in FM events. Pattern: add `vendorNoun`/`vendorNounPlural` per `isFM`. Privacy model: default to 'Private Event' for all vendor-facing notifications.

### Batch 4 Plan (H-7, H-8, M-13)
H-7: Rewrite event info page to use batch queries (copy shop API pattern). Save vault state first for rollback.
H-8: Server-side price filtering in shop API based on auth check.
M-13: Add `.eq('status', 'approved').is('deleted_at', null)` to shop API vendor query.

### Batch 5 Plan (remaining medium/low)
M-1: useRef guard on add-to-cart (same pattern as checkout). M-5: FK constraint migration. M-6: Vertical config for item caps. M-7: Use event name in notification. M-8: Atomic update on select submission. M-10: listing_markets cleanup on cancelled/declined. M-11: Verify cron update succeeded. M-14: Future date validation on repeat. H-3: Clarifying label on settlement. L-4: Simplify message body parsing. L-5: Token format check. L-6: Differentiated error messages.

### Session 66 Commits (so far)
1. `8a4aa6c` — feat: event cart fix + vendor order capacity caps
2. `240bc72` — revert: remove event cap enforcement from cart API
3. `0fe2ff7` — refactor: move event pages under [vertical]
4. `ac3117e` — fix: lint errors in moved event pages
5. `438c6be` — fix: hide "Continue Shopping" for events
6. `8e0577a` — feat: auto-transition event lifecycle
7. `1fe5ea6` — docs: session 66 progress
8. `36f1597` — docs: session 66 summary
9. `e83a4ed` — fix: audit batch 1 (12 items)

### Migrations Applied (Session 66)
- `20260330_105_event_date_range_in_pickup_dates.sql` — all 3 envs
- `20260330_106_event_vendor_order_caps.sql` — all 3 envs

### Critical Reminders for Next Session
- **Cart API (`cart/items/route.ts`) is a PROTECTED FILE** — see `.claude/rules/critical-path-files.md`
- Event order cap enforcement was REVERTED from cart API — needs reimplementation via separate endpoint
- Batch 1 is on staging but NOT pushed to prod yet — needs user verification first
- Dev environment missing event columns (migration 039 never applied to dev)
- The `vendor_quality_findings` table is used in Batch 1 (M-4) — verify it exists on all envs
