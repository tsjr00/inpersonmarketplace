# Plan: M4 — Fix Event Ratings Optimistic UI Count Bug

**Created:** 2026-04-17 (Session 72)
**Status:** Ready to implement
**File:** `src/app/admin/event-ratings/page.tsx`
**Severity:** Medium — admin-only, cosmetic, self-corrects on refresh

---

## The Bug

**Line 89** of `updateStatus()`:

```ts
[selectedRating?.status || 'pending']: Math.max(0, (data.counts[selectedRating?.status || 'pending'] || 1) - 1),
```

`selectedRating` is the rating currently displayed in the detail panel. `updateStatus(id, newStatus)` is called with the ID of the rating being moderated — which may be a DIFFERENT rating than what's in the detail panel.

When admin approves Rating A (status: pending) while viewing Rating B (status: approved) in the detail panel:
- Code decrements `selectedRating.status` = `'approved'` count (WRONG — should decrement Rating A's old status `'pending'`)
- Code increments `newStatus` = `'approved'` count (correct)
- Net effect: approved count unchanged, pending count unchanged, but one rating actually moved from pending → approved
- Tab counts are now wrong: pending shows 1 too many, approved shows correct

## The Fix

Capture the old status of the rating being moderated from `data.ratings` (which has the pre-update status for all ratings), not from `selectedRating`:

```ts
async function updateStatus(id: string, newStatus: string) {
  setActionLoading(true)
  // Capture old status from the ratings array, not from selectedRating
  const oldStatus = data?.ratings.find(r => r.id === id)?.status || 'pending'
  try {
    ...
    if (res.ok) {
      ...
      counts: {
        ...data.counts,
        [oldStatus]: Math.max(0, (data.counts[oldStatus] || 1) - 1),
        [newStatus]: (data.counts[newStatus] || 0) + 1,
      },
    ...
```

## Change scope

- **1 file:** `src/app/admin/event-ratings/page.tsx`
- **2 lines changed:** add `oldStatus` variable declaration, replace `selectedRating?.status || 'pending'` with `oldStatus` on line 89
- **Zero risk:** the fix only affects the optimistic count update in the admin UI. The actual data change happens server-side via the PATCH request (lines 74-78), which is correct and unaffected.

## Testing

1. Go to `/admin/event-ratings` with 2+ pending ratings
2. Click on Rating B to view it in the detail panel
3. Click "Approve" on Rating A (in the list, not the detail panel)
4. Check: pending tab count should decrease by 1, approved tab count should increase by 1
5. Refresh page — counts should match the optimistic update (proves it was correct)
