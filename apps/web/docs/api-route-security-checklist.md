# API Route Security Checklist

**Loaded only when building or auditing API routes.** Every new API route MUST have these elements. Check before committing.

---

## 1. Authentication

```typescript
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

## 2. Authorization

- Verify user owns the resource OR has appropriate role
- Use `src/lib/auth/admin.ts` for admin checks (centralized)
- NEVER use query params to bypass authorization (e.g., `?admin=true`)

## 3. Input Validation

- Validate all request body fields
- Check types, ranges, and formats
- Use Zod schemas for complex validation

## 4. Rate Limiting

Apply appropriate limits for sensitive operations:

| Operation | Limit |
|-----------|-------|
| Account deletion | 3 / hour |
| Admin operations | 30 / minute |
| Auth endpoints | 5 / minute |
| Standard API | 60 / minute |
| Webhooks | 100 / minute |
| Submit/POST | 10 / minute |

## 5. Service Client Rules

- NEVER use `createServiceClient()` without verified admin role
- Admin role must be verified from database, not query params
- Document why service client is needed
- For market manager routes: service client is required because tables are default-deny RLS; auth is verified upstream by `isMarketManager()`

## 6. Error Tracing

- Wrap handlers in `withErrorTracing()`
- Use `traced.auth()`, `traced.validation()` for structured errors
- Include error codes following `ERR_XXX_NNN` pattern

---

## Pre-Merge Checklist for Any Feature

Before merging ANY feature, verify all of these:

### Security Review
- [ ] No debug endpoints in code (`/api/debug/*` must be deleted)
- [ ] Service role only used with verified admin role
- [ ] All new routes have authentication
- [ ] Input validation on all endpoints

### Performance Review
- [ ] Images use `next/image` for display (not raw `<img>`)
- [ ] Upload images use `image-resize.ts` for compression (see `docs/image-optimization.md`)
- [ ] Database queries are batched (no N+1)
- [ ] Cache headers on public data endpoints

### Error Tracking Review
- [ ] New routes wrapped in `withErrorTracing()`
- [ ] Error codes added to `ERR_XXX` pattern
- [ ] Sensitive operations have rate limiting

### RLS Review (if touching database)
- [ ] Query `error_resolutions` for similar issues (see `docs/error-resolution-workflow.md`)
- [ ] Check existing policies before creating new ones (see `docs/rls-policy-workflow.md`)
- [ ] Use `(SELECT auth.uid())` not `auth.uid()`
- [ ] Test policies don't cause recursion

### Schema Snapshot Review (if ANY migration was created or applied)
- [ ] Changelog entry added to `supabase/SCHEMA_SNAPSHOT.md`
- [ ] Function descriptions updated (if trigger/function logic changed)
- [ ] Structured tables regenerated or staleness noted in `current_task.md`
- This applies to ALL migration types — not just column/table additions. Trigger logic changes, config data updates, function modifications, RLS policy changes, and index additions ALL require schema snapshot updates.

For full migration workflow: `docs/migration-workflow.md`.
