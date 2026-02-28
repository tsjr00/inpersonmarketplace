# Current Task: Resend Webhooks + API Key Separation + Support Page
Started: 2026-02-28

## Goal
Three infrastructure improvements:
1. Resend webhook endpoint to track bounces/complaints/deliveries
2. Separate Resend API keys for prod vs dev/staging (config only)
3. Public support page with contact form at `/{vertical}/support`

## Status: PLAN APPROVED — Implementation Not Started

## Plan File
`C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md` — full implementation plan

## What's Been Completed This Session (Pre-Task)

### Email FROM Address Change — COMMITTED + PUSHED TO BOTH
- Changed `noreply@mail.` → `updates@mail.` across all 6 source files
- Added "do not reply" footer to `formatEmailHtml()` in `service.ts`
- Updated `.env.local` and `.env.example`
- **User needs to update** `RESEND_FROM_EMAIL` in Vercel prod env vars to `updates@mail.farmersmarketing.app`
- Commit: `d760973`

### Favicon Fix — COMMITTED + PUSHED TO BOTH
- Deleted `src/app/favicon.ico` and `src/app/icon.svg` (root-level files were overriding per-vertical metadata icons)
- Per-vertical favicons now working via `generateMetadata()` in `[vertical]/layout.tsx`
- Commit: `18bc0ff`

### PWA Manifest Fix — COMMITTED + PUSHED TO BOTH
- Added `Vary: Host` header to manifest + apple-touch-icon routes
- Added `www.` domain variants to hostname lookup (Vercel redirects bare → www)
- FT "Save as webapp" now shows correct FT logo
- Commits: `ed1bf77`, `7e4cf47`

### Vendor Leads Admin Email — COMMITTED + PUSHED TO BOTH
- Made admin email vertical-aware (sender name, FROM address, label, color, footer)
- Commit: `d760973`

### Resend DNS — COMPLETE
- `mail.foodtruckn.app` verified in Resend (DKIM + SPF + MX all verified)
- `mail.farmersmarketing.app` was already verified

### Coming Soon Pages — COMPLETE (prior session, already in prod)
### DNS + getAppUrl() + Metadata — COMPLETE (prior session, already in prod)

## What's Remaining (Approved Plan)

### Part 1: Resend Webhook Endpoint
- [ ] Install `svix` npm package
- [ ] Create migration `20260228_057_email_events.sql` — email_events table
- [ ] Create `src/app/api/webhooks/resend/route.ts` — webhook handler
- [ ] Add `RESEND_WEBHOOK_SECRET` to `.env.local`

### Part 2: Separate API Keys (Config Only — No Code)
- [ ] User creates new API key in Resend dashboard (Production)
- [ ] User updates Vercel prod `RESEND_API_KEY` with new key
- [ ] .env.local keeps existing key for dev/staging

### Part 3: Support Page + Form
- [ ] Create migration `20260228_058_support_tickets.sql` — support_tickets table
- [ ] Create `src/app/[vertical]/support/page.tsx` — support page
- [ ] Create `src/components/support/SupportForm.tsx` — contact form
- [ ] Create `src/app/api/support/route.ts` — POST handler
- [ ] Edit `src/lib/notifications/service.ts` — update email footer link to include vertical
- [ ] Edit `src/app/[vertical]/help/page.tsx` — add link to support page

### Verification
- [ ] Run tsc --noEmit
- [ ] Apply migrations to dev
- [ ] Test webhook (after Resend dashboard config)
- [ ] Test support form submission
- [ ] Commit + push to staging

## Key Files Modified This Session
- `src/lib/notifications/service.ts` — noreply→updates, added do-not-reply footer
- `src/app/api/vendor-leads/route.ts` — noreply→updates, vertical-aware admin email
- `src/lib/errors/logger.ts` — noreply→updates
- `src/app/api/errors/report/route.ts` — noreply→updates
- `src/app/api/cron/expire-orders/route.ts` — noreply→updates
- `src/app/api/manifest/route.ts` — Vary:Host + www domain variants
- `src/app/api/apple-touch-icon/route.ts` — Vary:Host + www domain variants
- `.env.example` — noreply→updates
- `.env.local` — noreply→updates
- Deleted: `src/app/favicon.ico`, `src/app/icon.svg`

## Git State
- Main and staging are in sync at origin
- All changes from this session have been committed and pushed to both

## Architecture Decisions
- Support page is NOT an overlay (unlike Coming Soon) — renders in normal vertical layout with header
- Support form is public (no auth required) — uses service client pattern from vendor-leads
- Email events table stores only bounces/complaints/delays (not deliveries — too much volume)
- Webhook signature verification uses `svix` package (Resend's recommended approach)
- Support tickets in new table (not reusing error_reports or feedback tables)

## Open Items
- User needs to update `RESEND_FROM_EMAIL` in Vercel prod to `updates@mail.farmersmarketing.app`
- Instagram URLs still placeholder `#` in both Coming Soon footers
- Business rules audit questions pending user review (see `.claude/business_rules_audit_and_testing.md`)
