# Current Task: Session 86 — mid-stream on X3 (vendor-documents privacy)

**Updated:** 2026-06-01 (mid-session checkpoint, X3 in flight)
**Mode:** Fix (security cleanup)

---

## 🔴 IMMEDIATE NEXT STEP (when picking this up)

**Resolved in-flight:** Mig 151 was applied to Prod on 2026-06-01 without the X3 code being deployed to Prod. Result: every vendor-document view on Prod broke because the OLD code opened public URLs and the bucket was newly private. **The fix shipped to staging** in commit `b87bd437` (VendorDocLink accepts `url` as a legacy fallback for COI rows without `path`). **Mig 151 was rolled back on Prod** the same day to restore doc viewing.

**State:**
- Mig 151 applied: Dev + Staging only.
- X3 code shipped to staging: `522de706` (initial X3) + `b87bd437` (legacy URL fallback for COI). 51 commits ahead of `origin/main`.
- Prod is at `c7d0b3ec` (pre-X3, pre-X2 application code), with mig 149 + mig 150 applied (X1a + X2 DB changes done) but mig 151 rolled back.

**What's next:** the Prod push (Priority 1 below). Mig 151 ships to Prod ONLY as part of that push — applied AFTER the code deploys, in the same session as migs 138-148. Trying to apply 151 first again will just break Prod doc views again.

**Grandfathered COI placeholder rows (separate UX issue, NOT a security bug):**
On staging, ~19 of 20 `vendor_verifications.coi_documents` entries had both `url` and `path` empty/null with filenames like `grandfathered_coi`, `test_coi`, `coi_2026.pdf`. These are placeholder marker rows for vendors approved without uploading an actual COI. OLD code rendered them as `<a href="">` which silently reloaded the current page when clicked. NEW VendorDocLink renders "Document unavailable" (italic grey) instead — correct behavior, no broken link. Vendors on those rows can't see an Upload button either (separate pre-existing UX gap). Backlog item: decide whether to hide placeholder rows, show a "Grandfathered" badge + upload-replacement option, or leave with "Document unavailable" label.

---

## Session 86 chronology (so a future session understands the path)

### Carried forward from Session 85
- Local `main` was 44 commits ahead of `origin/main` (prod). 11 pending Prod migrations (138-148). User had identified several P0 items during testing.

### What we shipped this session — to STAGING + PROD
| Commit | What | Migrations applied to all 3 envs |
|---|---|---|
| `e33cd3f2` | USER-4: hide markets without fully-onboarded vendors on `/farmers_market/markets` (app-layer filter, mig 131 pattern mirror) | — |
| `a58ef87e` | 5 P0/P1 audit fixes: USER-1/3 FM schedule conflict gate, P1-A survey cron dedup, P1-B new manager_vendor_invitation_responded notif type, P1-C private_pickup form drop, P1-D webhook filter tighten | — |
| `fddbc75b` | Mig 149: REVOKE anon EXECUTE on 18 financial/write SECURITY DEFINER functions (X1a) | **149 ✅ Dev/Staging/Prod 2026-05-31** |
| `57b0c2e0` | X2: storage writes routed through service client across 9 routes + mig 150 | **150 ✅ Dev/Staging/Prod 2026-06-01** |
| `36031815` | Bookkeeping: mig 150 → applied/ + changelog | — |
| `522de706` | X3: signed-URL endpoint + VendorDocLink component + 11 consumer file refactors + mig 151 drafted | **151 ✅ Dev/Staging 2026-06-01, ⏸ Prod pending** |

### What we ALSO shipped to staging this session (also pending Prod with the 44+ commits)
All the above. Local `main` is now 50 commits ahead of `origin/main`.

### Where mig 151 stands
- Dev + Staging applied 2026-06-01.
- Prod NOT yet applied — waiting on staging verification of X3 code.
- Code commit `522de706` is on `origin/staging`. Vercel finished rebuilding 2026-06-01 afternoon.
- User tested after rebuild:
  - ✅ Cert upload + view via VendorDocLink — works (previously failed because code hadn't deployed)
  - ❌ Existing COI view → "Invalid document path" (THE OPEN BUG)
  - ✅ Manager-side vendor-docs view — still works
- When the open bug is fixed → push → user re-tests staging → user applies mig 151 to Prod → bookkeeping commit (mig 151 → applied/ + changelog "Applied to all 3 envs")

---

## All open items (queue for next steps, ordered by priority)

### P0 — Active in-flight
- **Fix the "Invalid document path" COI view bug.** See top of this file.

### P1 — Prod deploy work waiting on user authorization
- **Push 50 local main commits to `origin/main`** during the 9 PM–7 AM CT window. Code includes all of Session 84 + Session 85 + Session 86 work. Most relevant for Prod functionality:
  - Phase E (post-market surveys) end-to-end
  - Phase C booth rentals (need migs 138-147 applied to Prod first)
  - Vendor invitation backend + UI (NEW-8)
  - Manager verification doc upload + viewer (NEW-7, mig 148)
  - Vertical admin pending-intake surfacing
  - All Session 86 security fixes + the 5 P0/P1 audit fixes + USER-4 market visibility filter
- **Apply migrations 138-148 to Prod** in order: 138 → 139 → 140 → 141 → 142 → 143 → 144 → 145 → 146 → 147 → 148. **CRITICAL:** after 142 + 143 apply (which CREATE `book_weekly_booth_atomic` + `replace_market_optin_selections` with default-grant-to-public), **re-run mig 149** in the same session to revoke anon EXECUTE on those two functions. Reminder notes are embedded at the top of mig 142 + 143 SQL files for the next session to see.
- **Apply mig 151 to Prod** after the open bug is fixed + staging re-verified.

### P1 — Backlog audit items (from `apps/web/.claude/post_session84_audit.md`)
Audit doc lists 4 P1 items already addressed in commit `a58ef87e` (P1-A through P1-D). 11 P2 items remain unverified — most need user testing on staging before triage:
- P2-A: buyer survey path doesn't verify row.kind === 'buyer' (defense-in-depth)
- P2-B: race-lost survey submit returns success
- P2-C: intake spam vector (no email-verify/captcha)
- P2-D: market_documents storage orphan on cascade
- P2-E + P2-H + P2-J: N+1 admin email lookups (3 places — close in one shared helper)
- P2-F: edit form requires lat/lng on pending markets
- P2-G: booth-paid manager notif silently skipped when manager_user_id null
- P2-I: schedule fanout server-local time instead of market tz
- P2-K: vendor-docs viewer signed-URL gap (probably resolved by X3 — verify on staging)
- 7 × P3 cleanup items also catalogued

### P1 — Other backlog items
- USER-1 + USER-3 (FM schedule conflict): shipped, needs staging verification
- USER-4 (markets list filter): shipped, user confirmed working on staging
- Several others in `backlog.md` — not touched this session

---

## Critical context for next session

### How to pick up the open bug

1. Read this file + `apps/web/.claude/post_session84_audit.md` (the audit findings)
2. Verify staging has commit `522de706` deployed (Vercel preview URL: `https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app/`)
3. Verify mig 151 applied to staging — query: `SELECT public FROM storage.buckets WHERE id = 'vendor-documents';` should return `false`
4. The bug is in `src/components/shared/VendorDocLink.tsx` consumers OR in the component itself. Choose the fix shape:
   - **Option A (cleaner, recommended):** add an optional `url?` prop to VendorDocLink. If `path` is undefined/empty, fall back to `extractVendorDocPathFromPublicUrl(url)`. Update consumers that have both `url` and `path` available (which is most of them) to pass both.
   - **Option B (more LOC but no API change to VendorDocLink):** Each consumer computes `effectivePath = doc.path || extractVendorDocPathFromPublicUrl(doc.url)`. More verbose, more places to maintain.
5. Stage SQL to find legacy COI rows (paranoia check):
```sql
SELECT vendor_profile_id, jsonb_array_length(coi_documents) AS n_docs
FROM vendor_verifications
WHERE coi_documents @> '[{"path": null}]' OR (
  coi_documents IS NOT NULL
  AND NOT (coi_documents @> '[{}]'::jsonb)
);
```
6. Test: upload a fresh COI (verify new uploads have path), view an OLD COI (verify legacy works via URL fallback).

### What mig 151 changed in the DB
- `storage.buckets WHERE id = 'vendor-documents'`: `public = false`
- Dropped policy `vendor_documents_select` on `storage.objects`
- Net effect: only `service_role` can read storage.objects for this bucket. Signed URLs (minted by service_role via the API endpoint) work. Direct public URLs return 400 "Bucket not found." Anon `.list()` returns nothing.

### The signed-URL endpoint
- Path: `/api/vendor-documents/signed-url`
- Query: `?path={path}&marketId={optional}`
- Auth chain: vendor-owns → admin → manager-with-consent (first match wins)
- TTL: 1 hour
- Code: `apps/web/src/app/api/vendor-documents/signed-url/route.ts`

### The VendorDocLink component
- Path: `apps/web/src/components/shared/VendorDocLink.tsx`
- Props: `path: string`, `marketId?: string`, `children`, `className`, `style`
- Helper exported: `extractVendorDocPathFromPublicUrl(url)` — parses the path out of a stored public-URL format
- Behavior: click → fetch signed URL → window.open in new tab. Error state inline.

### Consumer files refactored in X3 (where the bug fix touches)
1. `src/components/admin/VendorVerificationPanel.tsx` (3 sites)
2. `src/components/vendor/DocumentsCertificationsSection.tsx` (2 sites)
3. `src/components/vendor/COIUpload.tsx` (1 site) ← **THE LIKELY BUG SOURCE** for the open COI view bug
4. `src/components/vendor/CertificationsForm.tsx` (1 site, uses URL→path fallback already)
5. `src/components/vendor/FoodTruckPermitUpload.tsx` (1 site)
6. `src/components/vendor/CategoryDocumentUpload.tsx` (1 site)
7. `src/app/[vertical]/market-manager/[marketId]/vendor-docs/[vendorProfileId]/page.tsx` (2 sites)
8. `src/app/admin/vendors/[vendorId]/page.tsx` (1 site, uses URL→path fallback)

### Rule reminders that apply to next session
- **No prod push without explicit user authorization** AND staging verified.
- **Production push window:** 9 PM – 7 AM CT only.
- **Migration apply order for the Prod push:** apply migs 138-148 in numeric order, THEN re-run mig 149 (reminder notes embedded in mig 142/143 headers), THEN apply mig 151. After all done: bookkeeping commit (move applied mig files to `supabase/migrations/applied/` + changelog updates).
- **Critical-path files** that require per-file explicit approval before edits: see `apps/web/.claude/rules/change-discipline.md`. Most likely relevant if any P2 item fix involves Stripe webhook code.
- **The 13 critical-path file list:** cart/items, cart/items/[id], cart/validate, checkout/session, checkout/success, checkout/external, lib/stripe/payments, lib/stripe/webhooks, vendor/orders/[id]/reject, vendor/orders/[id]/fulfill, vendor/payouts, lib/pricing, lib/vendor-limits.

---

## Migrations status (as of 2026-06-01)

| # | File | Dev | Staging | Prod | Notes |
|---|---|---|---|---|---|
| 138 | vendor_market_agreement_acceptances | ✅ | ✅ | ❌ | Phase C |
| 139 | weekly_booth_rentals | ✅ | ✅ | ❌ | Phase C; FK to 138 |
| 140 | market_branding | ✅ | ✅ | ❌ | logo_url |
| 141 | markets_stripe_connect | ✅ | ✅ | ❌ | |
| 142 | book_weekly_booth_atomic | ✅ | ✅ | ❌ | **REMINDER: re-run mig 149 after Prod apply** |
| 143 | replace_market_optin_selections | ✅ | ✅ | ❌ | **REMINDER: re-run mig 149 after Prod apply** |
| 144 | booth_auto_assignment | ✅ | ✅ | ❌ | Updates 142 |
| 145 | market_vendor_tier_and_onboarding_acks | ✅ | ✅ | ❌ | |
| 146 | booth_number_uniqueness | ✅ | ✅ | ❌ | Updates 144 |
| 147 | market_surveys | ✅ | ✅ | ❌ | Phase E |
| 148 | market_documents | ✅ | ✅ | ❌ | NEW-7 |
| 149 | revoke_anon_from_financial_rpcs | ✅ | ✅ | ✅ | X1a — applied 2026-05-31, file in `applied/` |
| 150 | drop_storage_wide_open_policies | ✅ | ✅ | ✅ | X2 — applied 2026-06-01, file in `applied/` |
| 151 | vendor_documents_private | ✅ | ✅ | ⏸ (rolled back) | X3 — applied to Prod 2026-06-01 then rolled back same day because X3 code wasn't deployed to Prod. Re-apply ONLY as part of the larger Prod push (after migs 138-148 + code deploy + mig 149 re-run). File in `supabase/migrations/`. |

---

## Files modified this session but NOT yet committed (working tree)

Only the following untracked/modified files matter beyond what's in commits:
- `apps/web/.claude/post_session84_audit.md` (untracked) — the audit doc with all P1/P2/P3 findings
- `apps/web/.claude/current_task.md` (this file — being updated now)
- Several other `.claude/*.md` planning files untracked (carried from prior sessions)
- `apps/web/.claude/settings.local.json` (modified — likely permission deltas, ignore)
- `CLAUDE_CONTEXT.md` (modified — should be updated at session end, not now)

The fix for the open COI bug (about to start) will add modifications to whichever consumer file or VendorDocLink itself.

---

## When this checkpoint was written

Right after `522de706` was pushed to staging and Vercel finished rebuilding. User tested and reported:
- ✅ New cert upload + view works
- ❌ Existing COI view → "Invalid document path"
- ✅ Manager-side vendor-docs view works

User then asked for this documentation update before proceeding with the COI bug fix to safeguard against context overflow.
