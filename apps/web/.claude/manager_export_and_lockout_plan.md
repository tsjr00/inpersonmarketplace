# Plan: Market Manager Data Exports (Request-Based) + Dashboard Lockout

**Date:** 2026-06-03 · Session 88
**Mode:** Plan only — no implementation yet
**Source conversation:** Session 88 prod-readiness audit identified G2 (no manager export for grant applications). User chose request-based flow over self-serve; layered with dashboard lockout to handle manager turnover.

---

## Goals

1. **Manager can obtain export-ready reports** (PDF/CSV) for grant applications, season-end recaps, vendor outreach — but only via admin-approved request.
2. **Outgoing managers lose dashboard access immediately** on turnover. No window where a departed manager can self-serve compile a report.
3. **Audit trail** — every export request, decision, delivery is recorded. Every manager assignment change is recorded.
4. **Layered defense** — even if export-gating is bypassed somehow, dashboard lockout independently protects the underlying data view.

## Non-goals

- Scheduled auto-exports (user chose pure request-based; revisit later if request volume is too high)
- Granular per-section export permissions (all-or-nothing for v1)
- Self-serve export with cooldown (rejected for security reasons)

---

## Threat model

| Threat | Without this work | With this work |
|---|---|---|
| Outgoing manager exports data on their way out | Possible — dashboard self-serve | Blocked — dashboard locks immediately on reassign; export requires admin approval |
| Outgoing manager screenshots dashboard before turnover | Possible | Still possible (visual data exposure inherent to dashboard access). Mitigation: admin should remove access before announcing turnover internally. |
| Compromised manager email receives sensitive PDF | Possible if delivery uses email-on-file | Mitigated — email address is snapshot at delivery time, not at request time. If admin sees email change between request + approval, can deny. |
| Manager forges request as another manager | Blocked — requester_user_id always = `auth.uid()` of submitter |
| Admin maliciously denies legitimate requests | Possible but audit-logged. Vertical admin oversight, possibly multi-admin queue. |
| Stale admin (former employee) still has approval power | Out of scope for this plan — requires separate admin lifecycle work |

---

## Data model

### New table: `market_manager_history` (audit log for manager assignments)

Append-only history of who managed each market and when.

```sql
CREATE TABLE market_manager_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  manager_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_email_snapshot TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ended_at TIMESTAMPTZ NULL,
  ended_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  end_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_market_manager_history_market ON market_manager_history(market_id, assigned_at DESC);
-- Partial unique: at most one currently-active assignment per market
CREATE UNIQUE INDEX idx_market_manager_history_active
  ON market_manager_history(market_id) WHERE ended_at IS NULL;
```

**Rationale:** `markets.manager_user_id` stays as the current pointer (existing auth checks unchanged). History table is parallel append-only log. When admin reassigns: write `ended_at` on prior row, insert new row, update `markets.manager_user_id`. All three in one transaction.

### New column on `markets`: `manager_status`

```sql
ALTER TABLE markets
  ADD COLUMN manager_status TEXT NOT NULL DEFAULT 'active'
    CHECK (manager_status IN ('active', 'suspended'));
```

**Purpose:** Pause manager access without reassigning. Admin can suspend pending review, then restore. When `suspended`, manager auth check still finds them but the dashboard locks down.

### New table: `market_export_requests`

```sql
CREATE TABLE market_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  report_type TEXT NOT NULL
    CHECK (report_type IN ('grant_summary','vendor_attendance','survey_results','transaction_totals','custom')),
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  purpose TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied','delivered','expired')),
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes TEXT NULL,
  delivered_at TIMESTAMPTZ NULL,
  delivered_to_email TEXT NULL,
  storage_path TEXT NULL,
  signed_url_expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (date_range_end >= date_range_start)
);

CREATE INDEX idx_market_export_requests_market_status
  ON market_export_requests(market_id, status);
CREATE INDEX idx_market_export_requests_requester
  ON market_export_requests(requester_user_id, requested_at DESC);
CREATE INDEX idx_market_export_requests_status_age
  ON market_export_requests(status, requested_at)
  WHERE status IN ('pending','approved');
```

**RLS:** Enabled with NO POLICIES (matches existing pattern). All access via service-client API routes; routes enforce per-request auth.

### New storage bucket: `market-exports`

Private bucket (per migration 151 pattern for vendor-documents). Files: `<market_id>/<request_id>-<report_type>.pdf`. Files removed N days post-delivery via cron (e.g., 30 days).

---

## State transitions

### Export request

```
pending ──(admin approve)──> approved ──(generation succeeds)──> delivered
   │                            │
   │                            └──(generation fails — retry or fail)──> pending (with admin note)
   │
   ├──(admin deny)──> denied
   │
   └──(30 days pass)──> expired
```

`approved` is transient — system immediately generates + delivers, moving to `delivered`. If generation fails, falls back to `pending` with note for admin to retry.

### Manager status

```
active ──(admin suspend)──> suspended ──(admin restore)──> active
  │                              │
  │                              └──(admin reassign)──> [user removed, new user set]
  │
  └──(admin reassign)──> [user removed, new user set]
```

Reassignment is atomic: end prior history row, insert new row, update `markets.manager_user_id`.

---

## API routes

### Manager-facing

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/market-manager/[marketId]/export-requests` | POST | Manager of market | Create new export request |
| `/api/market-manager/[marketId]/export-requests` | GET | Manager of market | List own requests + statuses |
| `/api/market-manager/[marketId]/export-requests/[id]/download` | GET | Manager of market (requester only) | Download approved PDF via signed URL |

### Admin-facing

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/admin/export-requests` | GET | Platform OR vertical admin | Queue with filters (pending, by vertical, by date) |
| `/api/admin/export-requests/[id]` | GET | Admin | Full request details + market context + requester status |
| `/api/admin/export-requests/[id]/approve` | POST | Admin | Approve → triggers generation + email delivery |
| `/api/admin/export-requests/[id]/deny` | POST | Admin | Deny with reason → sends rejection email |
| `/api/admin/markets/[id]/manager` | PATCH | Admin | Reassign / remove / suspend / restore manager |

### Cron

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/expire-export-requests` | Daily | Mark `pending` requests older than 30 days as `expired`; notify requester |
| `/api/cron/cleanup-export-storage` | Daily | Delete delivered PDFs older than 30 days from `market-exports` bucket |

---

## UX

### Manager dashboard — new "Reports" card

```
┌─ Reports ─────────────────────────────────────┐
│                                                │
│ Pending requests (0)                           │
│   No requests pending review.                  │
│                                                │
│ Available reports                              │
│   No reports available yet.                    │
│                                                │
│ [Request a custom report]                      │
│                                                │
│ ⓘ Reports require admin review. Typical       │
│   turnaround is 1-3 business days.            │
└────────────────────────────────────────────────┘
```

After submission, "Pending requests" populates with the request showing status. When approved + delivered, moves to "Available reports" with a download button.

### Manager request form

Modal or page:
- **Report type** (dropdown):
  - Grant application summary (default)
  - Vendor attendance
  - Survey results
  - Transaction totals
  - Custom — free text in purpose field
- **Date range** (two date pickers, default: season-to-date based on market type)
- **Purpose** (textarea, 140 char limit) — required for `custom`, optional otherwise
- **Submit** button
- Confirmation: "Request submitted. You'll receive an email within 1-3 business days."

### Admin queue — new page

`/admin/export-requests` (also surfaced at vertical-admin level for vertical-scoped admins).

```
┌─ Export Requests ──────────────────────────────────────────┐
│ Filters: [Pending ▼] [All verticals ▼] [Last 30 days ▼]    │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Pending · 3 hours ago                                  │ │
│ │ Market: Westgate Farmers Market (FM)                   │ │
│ │ Requester: alice@example.com — STILL ACTIVE MANAGER ✓  │ │
│ │ Type: Grant application summary                        │ │
│ │ Range: 2026-01-01 to 2026-06-03                        │ │
│ │ Purpose: "Applying for CITA grant by 6/15"             │ │
│ │   [Review]                                              │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Pending · 1 day ago                                    │ │
│ │ Market: Sunset Truck Court (FT)                        │ │
│ │ Requester: bob@example.com — ⚠️ NO LONGER MANAGER       │ │
│ │ ...                                                     │ │
│ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Critical UX element:** the queue row shows whether the requester is **still the current manager** of that market. If they're not (turnover occurred between request + review), admin sees a clear warning and almost certainly denies.

Review modal:
- Full request details
- Market context (status, manager history snippet)
- "Last manager change" timestamp + person who made the change
- Two actions:
  - **Approve** → triggers generation
  - **Deny** with reason textarea — required

### Lockout pages

**Page A: `/[vertical]/market-manager/access-removed?market=<id>`**

Shown when user navigates to a manager dashboard URL but is no longer the active manager.

```
You no longer have manager access to [Market Name].

If you believe this is in error, contact admin@farmersmarketing.app.

Last manager change: [date] by [admin name].
```

Server-side route guard: `if (market.manager_user_id !== user.id && !isAdmin) redirect to access-removed`.

**Page B: `/[vertical]/market-manager/access-suspended?market=<id>`**

Shown when `market.manager_status === 'suspended'`.

```
Your manager access for [Market Name] has been temporarily suspended pending review.

Contact admin@farmersmarketing.app to discuss.
```

### Admin tools — manager management

On `/admin/markets/[id]` (existing page), add a "Manager" section:

```
┌─ Manager ──────────────────────────────────────┐
│ Current: alice@example.com (active)            │
│ Assigned: 2026-03-15 by Tracy                  │
│                                                 │
│ Actions:                                        │
│   [Reassign to another user]                   │
│   [Suspend access]                              │
│   [Remove manager (no replacement)]            │
│                                                 │
│ History:                                        │
│   2026-03-15 → 2026-06-01 — bob@example.com    │
│     Reason: "Resigned"                          │
│   2026-01-01 → 2026-03-15 — carol@example.com  │
│     Reason: "Position eliminated"               │
└─────────────────────────────────────────────────┘
```

Each action opens a modal: reason required, confirmation step, outcome email sent to outgoing manager.

---

## Notification templates (7 new)

| Template | When | To |
|---|---|---|
| `manager_access_removed` | Admin removes manager | Outgoing manager |
| `manager_access_suspended` | Admin suspends | Manager |
| `manager_access_restored` | Admin un-suspends | Manager |
| `export_request_received` | Manager submits | Admin (configurable: vertical admin only, or platform admin too) |
| `export_request_approved` | Admin approves + delivery succeeds | Manager (with PDF link) |
| `export_request_denied` | Admin denies | Manager (with reason) |
| `export_request_expired` | Cron expires unprocessed request | Manager (and admin for awareness) |

All follow existing notification template registry pattern. Email + in-app delivery channels.

---

## Business rules

1. **Requester must be the current manager at submission time.** API route checks `markets.manager_user_id == auth.uid()`. Former managers can't submit (their dashboard access is already locked).
2. **Approval check must verify requester is STILL the current manager.** Admin queue surfaces this; backend re-checks at approval. If requester is no longer manager, system warns admin loudly + recommends deny.
3. **Delivery email is the email of the current `markets.manager_user_id` at delivery time**, not the email at submission time. Closes the "request, change email, quit" attack.
4. **Suspended managers cannot submit requests.** API route rejects with 403.
5. **Export PDFs are not stored indefinitely.** Cron removes from storage 30 days after delivery. After that, manager must request again (audit trail preserves what was requested + when).
6. **Pending requests expire after 30 days** with no admin action. Notifies requester. Doesn't notify admin (would be noise).

---

## What goes in each report type

### `grant_summary` (default, most-requested)

Single PDF containing:
- Market name, address, season range
- Vendor count + names (with categories)
- Vendor attendance metrics (% of market days each vendor was present)
- Transaction totals: 30-day, 90-day, season-to-date (gross sales — note: NOT manager revenue, see Part 1 of audit doc)
- Schedule (operating days + hours)
- Booth occupancy snapshot (most recent week)
- Survey response stats: count + response rate + aggregate ratings per category
- Recent buyer comments (anonymized)
- Recent vendor comments

### `vendor_attendance`

Table format: vendor name, market days attended, total revenue (vendor's gross), booth #, status.

### `survey_results`

Vendor + buyer survey aggregates, per-category averages, individual responses (vendor identified, buyer anonymized).

### `transaction_totals`

Time-series breakdown by day/week/month. Total orders, total gross, average order value.

### `custom`

Free-text purpose; admin manually compiles or denies.

---

## Build phasing

### Phase 1 — Data model + lockout (foundation) · ~3 hr

1. Migration: `market_manager_history` table, `markets.manager_status` column
2. Backfill: existing `markets.manager_user_id` populates first history row per market
3. Admin manager management UI (reassign / suspend / restore)
4. Lockout pages (`/access-removed`, `/access-suspended`)
5. Server-side route guards on all `/[vertical]/market-manager/[marketId]/*` pages
6. Notification templates: `manager_access_removed`, `_suspended`, `_restored`

### Phase 2 — Export request flow (functional) · ~5 hr

7. Migration: `market_export_requests` table + `market-exports` storage bucket
8. Manager request UI: form + history list on dashboard
9. Admin queue UI: list, filters, review modal
10. API routes: create, list, approve, deny, download
11. Notification templates: `export_request_received`, `_approved`, `_denied`, `_expired`

### Phase 3 — PDF generation (the meaty part) · ~4 hr

12. PDF library choice: `@react-pdf/renderer` (server-side, React-based) or HTML→Puppeteer
13. Report generators per type (`grant_summary` first, others later if needed)
14. Storage upload + signed-URL minting (matches mig 151 pattern for vendor-documents)
15. Email delivery with PDF attachment + signed-URL fallback

### Phase 4 — Cron + cleanup · ~1 hr

16. `/api/cron/expire-export-requests` — daily expiry
17. `/api/cron/cleanup-export-storage` — daily 30-day cleanup
18. `vercel.json` entries

### Phase 5 — Polish + edge cases · ~2 hr

19. Admin daily digest of pending queue (optional)
20. Handle deletion: if market is deleted, what happens to in-flight requests? (CASCADE → cleanup)
21. Handle manager change mid-flight: clear UI flag for admin reviewer
22. Tests for the gates (former manager can't submit, suspended can't submit, requester check at approval)

### Total estimate: **~15-18 hours** across 3-4 sessions

---

## Open questions for user

1. **Who approves: platform admin only, or also vertical admins?** Vertical admins are closer to the markets in their vertical; faster turnaround. Platform admin only is tighter security but slower.
2. **Should former managers see a "request data" path too?** E.g., "I managed Westgate in 2026, I need my season data for tax purposes." If yes, that's a separate flow. If no, former managers must contact admin manually.
3. **Daily digest of pending queue to admins?** Optional. Prevents requests from sitting too long. Could be email-only at 8am CT.
4. **Auto-expire window — 30 days too long?** Could be 14 days or 21. Trade-off: too short = legitimate requests die during admin vacation; too long = stale state.
5. **Suspension expiry — should suspended markets auto-restore after N days, or stay suspended until admin action?** Auto-restore is cleaner UX but might miss genuine concerns.
6. **Vertical-specific report templates?** FM grant_summary and FT grant_summary may emphasize different metrics (FM has consistent weekly schedule; FT has more ad-hoc events). Could fork the template later.
7. **Should the `Reports` card on manager dashboard show even when no requests/reports exist?** Educational visibility ("hey, you can request reports") vs. dashboard clutter for managers who don't use it.

---

## Rollout strategy

1. Build Phase 1 (lockout) first — even without exports, this is a meaningful security win. Ship standalone.
2. Build Phase 2-3 (exports + PDF gen) as one bundle, ship together. Test heavily on staging.
3. Phase 4-5 cleanup and polish in a follow-up session.

Pre-rollout to managers:
- Email existing managers: "Reports feature is launching. Request grant-application data here." Single short paragraph.
- No "training" needed — request form is self-explanatory.

---

## Migration safety notes

- `market_manager_history` backfill: insert one row per existing `markets` row where `manager_user_id IS NOT NULL`. Assigned_at = `manager_invited_at` if available, else `markets.created_at`. Assigned_by_user_id = NULL or a "system" placeholder.
- `markets.manager_status` default 'active': existing rows get safe default. No behavior change until admin sets one to 'suspended'.
- Storage bucket creation idempotent (`ON CONFLICT DO NOTHING` on `storage.buckets`).
- RLS: default-deny matches mig 137/147/148 pattern. No anon, no authenticated direct access. Service-client-only via routes.

---

## Files this would touch

### New
- `supabase/migrations/<date>_<n>_market_manager_history.sql`
- `supabase/migrations/<date>_<n+1>_market_export_requests.sql`
- `apps/web/src/app/api/market-manager/[marketId]/export-requests/route.ts` (POST + GET)
- `apps/web/src/app/api/market-manager/[marketId]/export-requests/[id]/download/route.ts`
- `apps/web/src/app/api/admin/export-requests/route.ts`
- `apps/web/src/app/api/admin/export-requests/[id]/route.ts` (GET)
- `apps/web/src/app/api/admin/export-requests/[id]/approve/route.ts`
- `apps/web/src/app/api/admin/export-requests/[id]/deny/route.ts`
- `apps/web/src/app/api/admin/markets/[id]/manager/route.ts` (PATCH)
- `apps/web/src/app/api/cron/expire-export-requests/route.ts`
- `apps/web/src/app/api/cron/cleanup-export-storage/route.ts`
- `apps/web/src/app/[vertical]/market-manager/access-removed/page.tsx`
- `apps/web/src/app/[vertical]/market-manager/access-suspended/page.tsx`
- `apps/web/src/app/admin/export-requests/page.tsx`
- `apps/web/src/components/market-manager/ReportsCard.tsx`
- `apps/web/src/components/market-manager/ExportRequestForm.tsx`
- `apps/web/src/components/admin/ExportRequestReviewModal.tsx`
- `apps/web/src/components/admin/ManagerHistoryPanel.tsx`
- `apps/web/src/lib/exports/pdf-generators.ts` (one function per report type)
- `apps/web/src/lib/exports/report-data-loaders.ts`
- `apps/web/src/lib/notifications/templates/manager_access_*.ts` (3 templates)
- `apps/web/src/lib/notifications/templates/export_request_*.ts` (4 templates)

### Modified
- `apps/web/src/app/[vertical]/market-manager/[marketId]/dashboard/page.tsx` — add ReportsCard
- `apps/web/src/app/[vertical]/market-manager/[marketId]/**/page.tsx` — add lockout guards (multiple files)
- `apps/web/src/app/admin/markets/[id]/page.tsx` — add ManagerHistoryPanel
- `apps/web/vercel.json` — register new crons
- `supabase/SCHEMA_SNAPSHOT.md` — changelog entries
- `apps/web/.claude/current_task.md` — track build progress
- `apps/web/.claude/backlog.md` — mark grant export item as in-progress when started

---

## Cross-references

- Session 88 audit: `apps/web/.claude/session88_prod_readiness_audit.md` (Part 1, G2 keystone gap)
- Market manager planning: `apps/web/.claude/market_manager_v2_plan.md`
- Mig 151 (signed-URL pattern): reference for `market-exports` bucket privacy
- Mig 147 (surveys): reference for default-deny RLS + JSONB snapshot pattern
- Mig 148 (market_documents): reference for storage bucket creation idempotency
