# Error Resolution Strategy — Build Plan

Created: 2026-02-19 (Session 35)
Status: Planning → Incremental Implementation

## Overview

This document defines the strategy for evolving the existing error tracing system into a full error resolution pipeline. The goal is maximum debugging speed for a small team now, with a clear path to automated/partner-driven resolution as the platform scales.

---

## Current System (Already Built)

### Components
| Component | File | Purpose |
|---|---|---|
| `TracedError` | `src/lib/errors/traced-error.ts` | Structured error with code, traceId, breadcrumbs, context |
| `withErrorTracing()` | `src/lib/errors/with-error-tracing.ts` | API route wrapper (129 of 133 routes) |
| `ErrorFeedback` | `src/components/ErrorFeedback.tsx` | User-facing error report form |
| `ErrorDisplay` | `src/components/ErrorFeedback.tsx` | Inline error display with "Report" button |
| `logError()` | `src/lib/errors/logger.ts` | DB logging + admin email (high severity) |
| `error-catalog.ts` | `src/lib/errors/error-catalog.ts` | Error code → description mapping |
| `error_resolutions` | DB table | Tracks fix attempts, outcomes, and patterns |
| `/api/errors/report` | API route | Receives user-submitted error reports |
| Admin error log | `[vertical]/admin/errors` | View + manage logged errors |

### Data Flow (Current)
```
User action → API route (withErrorTracing)
                ↓
            TracedError created
            - error code (ERR_AUTH_003)
            - trace ID (unique per occurrence)
            - breadcrumb trail (execution path)
            - context (route, user, table, etc.)
                ↓
            logError() → DB (error_logs table)
                       → admin email (severity: high only)
                ↓
            API response → { error, traceId, code }
                ↓
            ErrorDisplay → user sees error code + traceId
                        → "Report this error" button
                        → /api/errors/report → DB
```

### Current Gap
The system captures errors well but doesn't close the loop:
- No connection between "error occurred" and "here's what we know about it"
- No self-service resolution for users (they just see the error)
- No aggregation or trending (each error is isolated in a DB row)
- Admin email only fires for `severity: 'high'` — `'critical'` is missed (bug)
- `error_resolutions` table exists but has no UI connection to live errors

---

## Layer 1: Self-Service Resolution (No External Tools)

### Concept
Extend the error catalog with `userGuidance` — a plain-language message telling the user what to do. When ErrorDisplay receives an error code, it checks the catalog and shows guidance BEFORE the "Report" button. This deflects most support volume.

### Changes Required

**1. Extend error catalog schema:**
```typescript
// In error-catalog.ts
interface ErrorCatalogEntry {
  code: string
  description: string       // existing — internal description
  category: string          // existing
  severity: ErrorSeverity   // existing
  userGuidance?: string     // NEW — shown to user in ErrorDisplay
  retryable?: boolean       // NEW — Layer 3: auto-retry hint
  selfResolvable?: boolean  // NEW — if true, guidance alone should fix it
}
```

**2. Populate userGuidance for common errors:**
```
ERR_AUTH_001 → "Your session has expired. Please log out and log back in."
ERR_AUTH_003 → "You don't have permission to access this. Contact support if you think this is wrong."
ERR_CHECKOUT_001 → "This item is no longer available. It may have sold out."
ERR_CHECKOUT_002 → "Your cart has changed. Please review and try again."
ERR_STRIPE_001 → "Payment processing is temporarily unavailable. Please try again in a few minutes."
ERR_RLS_001 → "Something went wrong loading your data. Try refreshing the page."
ERR_UNKNOWN_001 → "An unexpected error occurred. If this continues, please report it below."
```

**3. Update ErrorDisplay component:**
- Receive error code from API response
- Look up in catalog (client-side import or API call)
- Show `userGuidance` text prominently
- Show error code + traceId as small reference text
- Show "Report" button only for errors WITHOUT `selfResolvable: true`, or when guidance alone didn't help

**4. Split error code vs. implementation details in API responses:**
- Always return `code` in responses (user needs it for reporting)
- Never return `pgDetail` in production (SQL details are the security risk, not the code)
- Revert C5 change to `shouldShowErrorCodes()` → replace with `shouldShowErrorDetails()`

### Priority: HIGH — Build before launch
- Reduces user confusion on common errors
- Reduces support burden (users self-resolve)
- Error codes in responses enable faster admin diagnosis

---

## Layer 2: Sentry Integration (When Budget Allows)

### Concept
Add Sentry as the primary error monitoring tool. Existing system becomes a backup/complement.

### Integration Points

| Existing component | Sentry mapping |
|---|---|
| `traceId` | Sentry custom tag (correlate DB logs ↔ Sentry events) |
| Error codes (`ERR_*`) | Sentry fingerprint (controls how errors are grouped) |
| Breadcrumbs (`crumb.*`) | `Sentry.addBreadcrumb()` (1:1 mapping) |
| `logError()` | Add `Sentry.captureException()` call |
| `error_resolutions` | Link as Sentry issue runbook |
| Severity levels | Sentry alert levels |

### What Sentry Adds (That DB Logging Can't Do Efficiently)
- **Aggregation**: "ERR_CHECKOUT_001 happened 47 times today"
- **Trends**: "This error started after the last deploy"
- **Alerting**: New error types, frequency spikes, regression detection
- **Source maps**: Stack traces mapped to original TypeScript
- **Release tracking**: Errors tied to specific deployments
- **Performance monitoring**: Slow API routes, frontend vitals

### Implementation Steps
1. `npm install @sentry/nextjs`
2. Configure `sentry.client.config.ts` and `sentry.server.config.ts`
3. Add `Sentry.captureException(tracedError, { tags: { code, traceId }, contexts: { breadcrumbs } })` to `logError()`
4. Add `Sentry.addBreadcrumb()` calls alongside existing `crumb.*` calls (or replace)
5. Upload source maps in Vercel build step
6. Configure Sentry alerts for: new error types, payment errors, auth errors, frequency spikes

### Cost Consideration
- Sentry free tier: 5K errors/month (likely sufficient for early launch)
- Team plan: $26/month for 50K errors (when needed)
- Can start on free tier and upgrade based on actual volume

### Priority: MEDIUM — Add after launch, before scaling
- Free tier is enough to start
- Existing DB logging handles pre-launch needs
- Add when first real users are generating error volume

---

## Layer 3: Automated & Partner-Driven Resolution

### Auto-Retry for Transient Errors

Add `retryable: true` to error catalog entries for transient failures:
```
ERR_STRIPE_001 (Stripe timeout) → retryable: true, maxRetries: 1
ERR_DB_001 (connection pool) → retryable: true, maxRetries: 2
ERR_WEBHOOK_* (webhook processing) → retryable: true, maxRetries: 1
```

In `withErrorTracing()`:
```typescript
catch (error) {
  if (error instanceof TracedError) {
    const catalog = error.getCatalogEntry()
    if (catalog?.retryable && retryCount < (catalog.maxRetries || 1)) {
      crumb.api(`Auto-retrying ${error.code} (attempt ${retryCount + 1})`)
      return await handler() // retry once
    }
  }
  // ... existing error handling
}
```

### Auto-Escalation Rules

Based on error code + frequency, automatically escalate:

| Condition | Action |
|---|---|
| Same error code 5+ times in 1 hour | Auto-escalate to critical severity |
| Any payment-related error (`ERR_STRIPE_*`, `ERR_CHECKOUT_*`) | Immediate SMS/push alert to admin |
| Same user hitting same error 3+ times in 10 minutes | Flag for manual review |
| New error code never seen before | Alert admin (potential new bug) |

Implementation: Add a frequency check in `logError()` — query recent errors with same code, escalate if threshold met. Or handle in Sentry alerts (preferred once integrated).

### Admin Error Dashboard Enhancements

Connect `error_resolutions` to the admin error log:
- When viewing an error, show resolution history for that error code
- "Last time ERR_RLS_007 happened, we fixed it by adding a policy. Fix verified."
- One-click "Apply known fix" for errors with verified resolutions (future)
- Resolution suggestions ranked by success rate

### Partner/Contractor Enablement

The trace ID + breadcrumb + resolution history system enables any support person to:
1. Look up trace ID from user report
2. See full execution path (breadcrumbs)
3. Check resolution history for the error code
4. Either apply known fix or escalate with full context
5. No tribal knowledge required — the system IS the knowledge base

### Priority: LOW → MEDIUM — Build incrementally after Sentry
- Auto-retry: quick win, add to Layer 1 work
- Auto-escalation: add when Sentry alerts are configured
- Dashboard enhancements: add when support volume justifies it
- Partner enablement: add when team grows

---

## Implementation Roadmap

### Now (Session 35 — Pre-Launch)
- [ ] Revert C5: show error codes in responses, hide only pgDetail
- [ ] Add `userGuidance` field to error catalog schema
- [ ] Populate userGuidance for existing error codes
- [ ] Update ErrorDisplay to show guidance text
- [ ] Fix critical severity not triggering admin alerts (logger.ts bug)
- [ ] Add `retryable` field to catalog (prep for auto-retry)

### Launch Week
- [ ] Monitor error_logs table for patterns
- [ ] Add userGuidance entries for any new error codes discovered in testing
- [ ] Verify admin email alerts are working for high + critical

### Post-Launch (Month 1-2)
- [ ] Add Sentry (free tier)
- [ ] Connect traceId + error codes as Sentry tags
- [ ] Configure Sentry alerts for payment and auth errors
- [ ] Implement auto-retry for transient errors in withErrorTracing

### Scaling Phase (Month 3+)
- [ ] Auto-escalation rules (frequency-based)
- [ ] Admin dashboard ↔ error_resolutions connection
- [ ] Partner/contractor documentation and access
- [ ] Sentry upgrade if volume exceeds free tier

---

## Key Architecture Decisions

1. **Error codes stay visible to users** — they're reference IDs, not security risks. SQL details (`pgDetail`) are the sensitive data and stay hidden in production.

2. **DB logging stays even after Sentry** — it's your backup, your audit trail, and where `error_resolutions` lives. Sentry is for monitoring/alerting, DB is for resolution tracking.

3. **Error catalog is the single source of truth** for error metadata — descriptions, guidance, severity, retryability. Everything else references it.

4. **`withErrorTracing()` is the single integration point** — any new capability (retry, Sentry, escalation) plugs in here. No changes needed in individual route handlers.

5. **User-facing guidance deflects support before it starts** — the best error resolution is the one the user handles themselves.
