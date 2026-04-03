# Current Task: Session 66 Complete — Pending Testing + Next Session Items
Updated: 2026-04-02

## Status: Multiple features on staging awaiting verification before prod push

### On Staging (NOT yet on prod — need user verification):
- Audit Batches 1-5 (30 audit items fixed)
- Day-of event sales (migrations 108-109, form fields, SQL function)
- FM time slots at events
- Cancel event button (admin)
- Multi-vertical vendor schedule fix
- My Events organizer dashboard card + actions (copy link, cancel request)

### Already on Prod:
- Migration 105 (event date range fix)
- Migration 106 (vendor order caps)
- Migration 107 (FK constraint)
- Migrations 108-109 (day-of sales columns + SQL function)
- Event pages under [vertical] layout
- Cart useCart() rewrite
- Event lifecycle automation (Phases 14-15)
- Cross-sell suppression + Continue Shopping hide for events
- Schedule fix for multi-vertical vendors (Chef Prep bug)

### Deferred to Next Session

**Organizer cancel API:**
- Current cancel button shows "contact support" message
- Need a new API route: `POST /api/events/[token]/cancel`
- Authenticates via organizer_user_id (not admin role)
- Triggers same cleanup as admin cancel (listing_markets, notifications)

**Pre-order detail on organizer card:**
- Expandable section showing order breakdown per vendor
- Needs API call to fetch order_items by market_id grouped by vendor
- Show: vendor name, item count, total amount

**Event order cap enforcement:**
- Migration 106 columns exist (event_max_orders_total, event_max_orders_per_wave)
- Enforcement was REVERTED from cart/items/route.ts (Session 66 incident)
- Must be reimplemented via SEPARATE validation endpoint
- NEVER in cart/items/route.ts — see .claude/rules/critical-path-files.md

**Remaining audit items:**
- M-6: Vertical config for item caps (needs config system changes)
- M-9: Cart validate mixed market types (needs manual testing)

**Vendor guidance text:**
- Event acceptance UI: capacity planning message
- Prep reminder: include pre-order count
- Vendor dashboard event card: show pre-order count

**Event request form enhancements:**
- Organization type field (company, church, school, community group, government)
- H-6 decided: use "event organizer" instead of "company" for generic name

### Key Rules Established This Session
1. **Critical-path files** — `.claude/rules/critical-path-files.md` (13 protected files)
2. **One push at a time** — never bundle staging + prod, each requires independent approval
3. **Data-first** — always read the code before guessing (tutorial reset incident)

### Session 66 Commits (total)
1. `8a4aa6c` — event cart fix + vendor order capacity caps
2. `240bc72` — revert: remove event cap enforcement from cart API
3. `0fe2ff7` — refactor: move event pages under [vertical]
4. `ac3117e` — fix: lint errors in moved event pages
5. `438c6be` — fix: hide "Continue Shopping" for events
6. `8e0577a` — feat: auto-transition event lifecycle
7. `1fe5ea6` — docs: session 66 progress
8. `36f1597` — docs: session 66 summary
9. `e83a4ed` — audit batch 1 (12 items)
10. `40aca21` — audit batch 2 (root cause refactor + timezone)
11. `92c28e9` — audit batch 3 (language + privacy)
12. `d388eda` — audit batch 4 (N+1 queries, price filter, vendor status)
13. `754f820` — audit batch 5 (UX guards, cleanup, validation, FK)
14. `d90ea2b` — migration 107 applied
15. `cc1f446` — multi-vertical vendor schedule fix
16. `0ff3109` — day-of sales: migration + wiring + vendor stay policy
17. `da6c5fd` — day-of sales: SQL function (migration 109)
18. `390d0b9` — migrations 108-109 applied
19. `8fa4eb9` — FM time slots + cart pickup time validation
20. `6f5028a` — event form + admin UI (cutoff, day-of, stay policy)
21. `e55b149` — cancel event button on admin
22. `ecde941` — My Events organizer dashboard
23. `79cfd6e` — organizer event actions (copy link, cancel request)

### Migrations Applied (Session 66)
| Migration | All 3 Envs |
|-----------|-----------|
| 105 — event date range | Yes |
| 106 — vendor order caps | Yes |
| 107 — replaced_vendor FK | Yes |
| 108 — day-of sales columns | Yes |
| 109 — day-of cutoff function | Yes |
