# TypeScript Strict Flag Audit

**Date:** 2026-05-08 (Session 79)
**Purpose:** Identify which strict TypeScript compiler flags would close the gap between `tsc --noEmit` and `next build`. Output of read-only investigation per Option I in the build-process redesign discussion.

**Method:** for each candidate flag NOT currently enabled in `apps/web/tsconfig.json`, ran `npx tsc --noEmit --<flag>` from `apps/web`, captured errors, aggregated counts and patterns.

**No code changes made. No tsconfig changes made. This is a planning artifact.**

---

## Current state

`apps/web/tsconfig.json` has `strict: true`, which enables:
- `noImplicitAny`
- `strictNullChecks`
- `strictFunctionTypes`
- `strictBindCallApply`
- `strictPropertyInitialization`
- `noImplicitThis`
- `useUnknownInCatchVariables`
- `alwaysStrict`

The 7 candidate flags below are NOT currently enabled. Each was tested in isolation.

---

## Summary

| Flag | Errors | Files | Recommended Action |
|---|---|---|---|
| `noImplicitOverride` | **0** | 0 | **ENABLE NOW** (free win) |
| `noFallthroughCasesInSwitch` | **0** | 0 | **ENABLE NOW** (free win) |
| `noUnusedParameters` | 20 | 17 | **PLAN — quick** (~30 min session) |
| `exactOptionalPropertyTypes` | 110 | 69 | **PLAN — high priority** (closes Protocol 5 gap) |
| `noUnusedLocals` | 141 | 91 | **PLAN — quick** (~1 hr session) |
| `noUncheckedIndexedAccess` | 839 | 173 | **DEFER** (multi-session migration; doesn't address Protocol 5 cases) |
| `noPropertyAccessFromIndexSignature` | 1413 | 268 | **DEFER** (tedious mechanical rewrites; doesn't address Protocol 5 cases) |

---

## Per-flag deep dive

### `noImplicitOverride` — 0 errors

**Purpose:** class methods overriding parent must use the `override` keyword.

**Why zero:** the codebase doesn't have many class hierarchies (Next.js apps tend to be functional). Whatever class inheritance exists already uses `override` or has been written to satisfy the rule by accident.

**Action: ENABLE NOW.** No migration cost.

---

### `noFallthroughCasesInSwitch` — 0 errors

**Purpose:** switch case statements must end with `break`/`return`/`throw`/explicit `// fallthrough` comment, otherwise compile error.

**Why zero:** existing switches are already clean.

**Action: ENABLE NOW.** No migration cost. Future switches get protected automatically.

---

### `noUnusedParameters` — 20 errors / 17 files

**Purpose:** flag function/method parameters declared but never used. To intentionally keep an unused parameter, prefix with `_` (e.g., `_unused`).

**Sample errors:**
```
src/app/[vertical]/dashboard/LogoutButton.tsx(11,50): error TS6133: 'branding' is declared but its value is never read.
src/app/[vertical]/vendor/dashboard/orders/page.tsx(271,42): error TS6133: 'orderId' is declared but its value is never read.
src/components/buyer/OrderTimeline.tsx(15,49): error TS6133: 'createdAt' is declared but its value is never read.
src/components/events/OrganizerEventActions.tsx(15,49): error TS6133: 'eventId' is declared but its value is never read.
```

**Common pattern:** API or component handlers that accept a wider signature than they actually use. Fix is mechanical: rename `paramName` → `_paramName` (underscore prefix marks intentionally unused), or delete the param if the signature shouldn't have it.

**Migration cost:** ~30 min. All fixes are safe one-line edits. No semantic risk.

**Action: PLAN — quick session.** Do alongside `noUnusedLocals` (similar pattern).

---

### `exactOptionalPropertyTypes` — 110 errors / 69 files

**Purpose:** when a property is declared with `?:` (optional), it cannot be explicitly set to `undefined`. The property either has the value or is absent. Closes a class of subtle bugs where `{ x: undefined }` and `{}` are treated as equivalent by TS but differ in behavior at runtime.

**Why this matters strategically:** The Protocol 5 incident (April 2026 — `d.sourceType` on a `NotificationTemplateData` interface) is exactly this class of bug. `tsc --noEmit` passed because `d.sourceType` was treated as a valid optional property; `next build` caught it because Next's stricter checks noticed the discriminated-union violation. **Enabling this flag closes the gap that caused Protocol 5 to be added to the codebase.**

**Top files:**
```
6 src/lib/notifications/index.ts
5 src/app/api/cron/expire-orders/route.ts
4 src/lib/vendor-limits.ts
4 src/lib/notifications/service.ts
4 src/app/[vertical]/browse/page.tsx
3 src/lib/errors/resolution-tracker.ts
3 src/app/api/checkout/success/route.ts
3 src/app/[vertical]/vendor/dashboard/stripe/page.tsx
3 src/app/[vertical]/checkout/page.tsx
```

**Sample errors — common patterns:**

Pattern 1: spreading optional values explicitly:
```
src/app/[vertical]/browse/page.tsx(875,10): error TS2375: Type '{ ...; locationText: string | undefined; ... }'
  is not assignable to type 'BrowseLocationPromptProps' with 'exactOptionalPropertyTypes: true'.
  Consider adding 'undefined' to the types of the target's properties.
```

Pattern 2: ConfirmDialog props passing `undefined`:
```
src/app/[vertical]/admin/markets/page.tsx(1543,8): error TS2375: Type '{ ...; showInput: boolean | undefined;
  inputLabel: string | undefined; ...; onConfirm: ...; onCancel: () => void; }'
  is not assignable to type 'ConfirmDialogProps' ...
```

**Two valid fixes per error:**
- (a) Change the prop interface to allow `string | undefined` (looser — explicit `undefined` allowed)
- (b) Filter out `undefined` at the call site (stricter — prop only set when defined)

(a) is faster to apply but loosens type safety. (b) is the goal of the flag.

**Migration cost:** ~1-2 hour session if we go with (a) for most cases (mechanical), or 3-4 hours if we go with (b) for high-leverage interfaces. Recommend mixed approach: (b) for `notifications/service.ts`, `notifications/index.ts`, and `expire-orders` (these are where the Protocol 5 class lives); (a) for component prop interfaces (lower stakes).

**Action: PLAN — high priority.** This is the strategically most valuable flag. Closes the Protocol 5 gap. Schedule a focused session.

---

### `noUnusedLocals` — 141 errors / 91 files

**Purpose:** flag local variables declared but never used (excluding parameters — that's `noUnusedParameters`).

**Top files:**
```
12 src/app/[vertical]/events/[token]/shop/ShopClient.tsx
9 src/lib/__tests__/integration/business-rules-coverage.test.ts
4 src/lib/__tests__/subscription-lifecycle.integration.test.ts
4 src/app/[vertical]/vendor/dashboard/page.tsx
3 src/components/markets/ScheduleDisplay.tsx
3 src/app/api/cron/expire-orders/route.ts
3 src/app/[vertical]/vendor/[vendorId]/profile/page.tsx
3 src/app/[vertical]/listing/[listingId]/page.tsx
```

**Sample errors:**
```
src/app/[vertical]/admin/analytics/page.tsx(3,8): error TS6133: 'React' is declared but its value is never read.
src/app/[vertical]/admin/page.tsx(61,5): error TS6133: 'proVendors' is declared but its value is never read.
src/app/[vertical]/admin/page.tsx(62,5): error TS6133: 'bossVendors' is declared but its value is never read.
src/app/[vertical]/admin/vendors/VendorManagementClient.tsx(12,47): error TS6133: 'shadows' is declared but its value is never read.
src/app/[vertical]/browse/loading.tsx(1,23): error TS6133: 'SkeletonText' is declared but its value is never read.
src/app/[vertical]/buyer/orders/[id]/page.tsx(290,9): error TS6133: '_handleReportIssue' is declared but its value is never read.
```

**Common patterns:**
- Unused imports (most common — leftover from removed code)
- Destructured values that aren't read
- Local variables computed but never referenced
- Already-prefixed with `_` (e.g., `_handleReportIssue`) — interesting, this means the existing convention to prefix-underscore intentionally-unused is being applied but the flag isn't enforcing it. Strict flag would still complain about underscore-prefixed locals; need to delete or use `// eslint-disable` (NOT a TS flag option).

**Migration cost:** ~1 hour. Most are safe deletions of unused imports. The `_handleReportIssue` cases are interesting — those are intentionally retained for future use; we'd need to delete them or add `void _handleReportIssue;` workaround. Recommend just deleting.

**Action: PLAN — quick session.** Pair with `noUnusedParameters`.

---

### `noUncheckedIndexedAccess` — 839 errors / 173 files

**Purpose:** array/object index access returns `T | undefined` instead of `T`. Forces explicit handling of "what if this index doesn't exist."

**Top files:**
```
39 src/lib/stripe/config.ts
27 src/lib/events/viability.ts
27 src/lib/__tests__/pickup-formatters.test.ts
21 src/app/[vertical]/vendor/[vendorId]/profile/page.tsx
21 src/app/[vertical]/page.tsx
19 src/app/[vertical]/buyer/orders/page.tsx
17 src/app/[vertical]/market-box/[id]/MarketBoxDetailClient.tsx
16 src/app/[vertical]/vendor/market-boxes/[id]/page.tsx
15 src/lib/quality-checks.ts
15 src/app/[vertical]/vendor/orders/page.tsx
```

**Sample errors:**
```
src/app/[vertical]/about/page.tsx(17,30): error TS18048: 'branding' is possibly 'undefined'.
src/app/[vertical]/about/page.tsx(22,11): error TS18048: 'branding' is possibly 'undefined'.
```

**Common pattern:** accessing `defaultBranding[verticalId]` returns `Branding | undefined` under this flag. Code currently treats it as definitely `Branding`. Fix requires either a non-null assertion (`!`) — a band-aid that doesn't add real safety — or a real existence check.

**Migration cost:** very high. 839 errors across 173 files. Many require thoughtful fixes (does this index really always exist? if so, why isn't the type stricter to begin with?). A real migration of this would take multiple sessions and might surface real bugs.

**Action: DEFER.** This is genuinely useful but the migration cost outweighs the strategic value. Doesn't address the Protocol 5 case class (those are interface/discriminated-union errors, not index access). Revisit if real bugs surface from missing index checks.

---

### `noPropertyAccessFromIndexSignature` — 1413 errors / 268 files

**Purpose:** properties from an index signature (e.g., `process.env`) must be accessed with bracket notation (`process.env['X']`) not dot notation (`process.env.X`).

**Sample errors:**
```
e2e/smoke.spec.ts(21,31): error TS4111: Property 'PLAYWRIGHT_BASE_URL' comes from an index signature, so it must be accessed with ['PLAYWRIGHT_BASE_URL'].
next.config.ts(6,24): error TS4111: Property 'ANALYZE' comes from an index signature, so it must be accessed with ['ANALYZE'].
next.config.ts(86,20): error TS4111: Property 'SENTRY_ORG' comes from an index signature, so it must be accessed with ['SENTRY_ORG'].
playwright.config.ts(55,26): error TS4111: Property 'PLAYWRIGHT_BASE_URL' comes from an index signature, so it must be accessed with ['PLAYWRIGHT_BASE_URL'].
```

**Common pattern:** virtually all errors are `process.env.X` access. Fix is mechanical: change every `process.env.NAME` to `process.env['NAME']`.

**Migration cost:** very high. 1413 errors across 268 files. Mostly mechanical but tedious. Sed-based bulk replace would work but needs careful scoping (don't catch unrelated `.X` patterns).

**Strategic value:** low. Doesn't address Protocol 5 case class. Mostly stylistic — `process.env.X` is a TypeScript convenience that the flag removes for correctness reasons (env vars can technically be undefined).

**Action: DEFER.** Not worth the migration tax. Existing pattern of `process.env.X || 'default'` already handles undefined defensively. Revisit only if real bugs surface from missing env var checks.

---

## Recommended action plan

### Phase 1 — Free wins (ship anytime, ~5 min)

Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Validate with `npm run build`. Should pass immediately. No code changes required.

### Phase 2 — Protocol 5 closer (~1-2 hour focused session)

Enable `exactOptionalPropertyTypes`. Migrate the 110 errors. Recommended approach: tighten core lib files (`notifications/service.ts`, `notifications/index.ts`, `expire-orders/route.ts`) at the call sites (don't pass `undefined` explicitly); for component props, prefer broadening the interface to `T | undefined` so consumers don't have to filter.

Strategic outcome: type errors that previously slipped through `tsc --noEmit` and only got caught by `next build` will now be caught by `tsc`. The 5% gap in the build-before-commit / no-chain-build discussion shrinks dramatically.

### Phase 3 — Quick mechanical cleanup (~1-1.5 hour session)

Enable both `noUnusedLocals` and `noUnusedParameters` together. Migrate the combined 161 errors:
- Most fixes: delete unused imports, rename `param` → `_param` where intentional
- Edge cases: a few "kept for future use" locals/params (mark with `void name;` or just delete)

### Phase 4 — Defer

`noUncheckedIndexedAccess` and `noPropertyAccessFromIndexSignature` are deferred. Revisit only if specific bugs surface that they would have prevented.

---

## What this changes about the build-process discussion

If we execute Phases 1 + 2 above, then:

- `tsc --noEmit` becomes meaningfully closer to `next build` in coverage
- The "5% case" (Protocol 5 incident class) is largely closed at the tsc level
- Pre-commit hook running `tsc --noEmit` catches what previously only `next build` would catch
- Pre-push hook can be reduced to just Playwright (or kept with build as backstop)

Combined with the build-before-commit rule clauses (no-chain-build, no-history-rewrite-under-failure), this gives:
- Fast pre-commit gate (lint + vitest + tsc) catches almost all type errors at commit time
- No broken commits in local history for the 95%+ of cases
- Pre-push hook still provides a backstop for the rare residual cases
- Vercel deploy serves as the final gate

Net effect: we avoid both maintenance-list rot AND the 5% risk that motivated tonight's discussion. The fix is at the type-system level, not the workflow-rule level.
