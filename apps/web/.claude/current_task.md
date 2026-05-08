# Current Task: Session 80 — Phase 2 of TSConfig Strictness in flight

**Updated:** 2026-05-08 (Session 80, mid-session)
**Mode:** Fix mode (active edits authorized)

## Branch state at last update

- **origin/main tip:** `7c102e7c` (cart fix, Session 78 — last Prod push)
- **origin/staging tip:** advancing through Session 80 — see commits below
- main has not been pushed to prod since Session 78

## Session 80 progress

### Phase 2 of TSConfig audit — `exactOptionalPropertyTypes` migration

Plan from `apps/web/.claude/tsconfig_strictness_audit.md`. 110 errors across 69 files at start.

**Strategy used (refined from data, not the audit's high-level plan):**
- **Pattern A** — passthrough helpers forwarding `options?.x`: conditional spread at call site
- **Pattern B** — component prop forwarding: loosen interface (`x?: T` → `x?: T | undefined`)
- **Pattern C** — conditional object building: conditional spread
- **Pattern D** — Stripe / external SDK params: conditional spread (matches their strict types)
- **Pattern E** — result/output objects: conditional spread (closes Protocol 5 class)

Pattern B got loosening (no safety value at runtime — React strips undefined props anyway). Patterns A, C, D, E all got strict call-site fixes (real safety value preserved).

**Commits landing on staging in order:**
- `479c90d9` — Batch 1: Pattern C + Pattern E (110 → 92 errors)
- `a2c3ea6e` — Batch 2: Pattern A + Pattern D (92 → 55 errors)
- (next) — Batch 3 + 4 + flag flip: Pattern B + misc (55 → 0 errors), `exactOptionalPropertyTypes: true` added to tsconfig

### Pending after Phase 2 lands

1. **Add `tsc --noEmit` to pre-commit hook** (~5 min). Edit `.husky/pre-commit` to add tsc after lint-staged + vitest.
2. **Reverse `apps/web/.claude/rules/build-before-commit.md`** (~10 min). Once pre-commit catches type errors, the chain MUST NOT include `npm run build` (pre-push hook is the backstop).
3. **Push Phase 1 + Phase 2 to prod** as one batch (deferred until staging verification).
4. **Recreate Session 79 lost work** — admin mobile grid CSS, vendor=organizer email block drop, fast-track endpoint + button, market_manager_plan.md, market_manager_optin_statements_v1.md, backlog updates.

### Phase 3 (optional) — Quick mechanical cleanup

`noUnusedLocals` + `noUnusedParameters` together. 161 errors mechanical. ~1 hour.

### Phase 4 — deferred

`noUncheckedIndexedAccess` (839 errors), `noPropertyAccessFromIndexSignature` (1413 errors). Don't address Protocol 5 class. Skipped.

---

## Critical context — DO NOT FORGET

### Build process discipline

- `npm run build` MUST run before commit including `.ts/.tsx/.js/.jsx` files (per current `.claude/rules/build-before-commit.md`). Once pre-commit gets `tsc`, the rule should reverse.
- Pre-commit husky hook (`lint-staged + vitest`) does NOT catch TypeScript errors. Pre-push hook (`npm run build` + Playwright) is a backstop, not primary gate.
- History rewriting after pre-push failure is FORBIDDEN. Make a NEW commit instead.

### Pattern recognition for Phase 2 fixes

- **Conditional spread pattern:** `...(value !== undefined ? { key: value } : {})` is the safe way to omit-or-include in `exactOptionalPropertyTypes` mode
- **Stripe types are strict:** they use `field?: T` (not `field?: T | undefined`). Don't fight this — match their strictness at call sites.
- **Component props are runtime-equivalent:** React passes props as object; `props.x` returns `undefined` whether the key was set to undefined or omitted. Loosening interfaces here doesn't reduce safety.

### Migration state (database)

All 4 migrations from Session 78 (128, 129, 130, 131) applied to all 3 envs. Confirmed 2026-05-05.

---

## Recent commits on staging

```
(next session 80 commit) — Phase 2 batch 3+4 + flag flip
a2c3ea6e fix(types): Phase 2 batch 2 — passthrough helpers + external SDK call sites
479c90d9 fix(types): Phase 2 batch 1 — result-builder undefined cleanup
fb332bb9 feat(tsconfig): enable noImplicitOverride + noFallthroughCasesInSwitch
6aa6046a docs: build-before-commit rule + CLAUDE.md ABSOLUTE rule entry
7c102e7c fix: hard-reload on logout clears stale client state (Session 78, last prod tip)
```

---

## When this gets picked up

If next session is fresh (compaction), this `current_task.md` is the recovery point. Read it first, then `CLAUDE.md`, then the audit doc. Don't make changes without confirming the user's current goal.
