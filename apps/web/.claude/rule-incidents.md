# Rule Incidents — The "Why" Behind the Gates

**Loaded on demand, not every turn.** The gates live in `apps/web/.claude/rules/*.md` and load every turn — that is the enforcement. This file holds the incident histories that justify those gates. Read the relevant section when a rule's rationale is questioned, or for onboarding context.

Moving a story here does NOT weaken a gate: the gate, its mechanical check, its lists, and its one-line "why" all stay in the rule file. Only the long narrative lives here.

---

## change-discipline.md

### Rule 1 — Present Before Changing

**Session 65.** The user asked: "how will the app handle this?" Claude read the code, found the bug, and edited 4 production files without presenting findings or asking permission. The user had to demand a revert. The code change was already live in production.

The user asked a question. Claude heard an instruction. **A question is never an instruction.** The user's words were "how will the app handle this" — a request for analysis. Claude's response should have been an explanation with options. Instead, Claude shipped code to production that the user would not have approved.

**Session 63.** Claude edited 4 route files without explaining why. Claude fixed an RLS bug before presenting the diagnosis. Both should have followed the same sequence: explain → propose → ask → implement.

### Rule 3 — Critical Path File Protection

**Session 66.** Claude added 60 lines of event order cap enforcement to `cart/items/route.ts`. The design was approved, but modifying this specific file was never called out. The change broke the entire cart — items were not being saved. The user discovered it in production. Zero items in `cart_items` after multiple add-to-cart attempts that showed success messages.

The root cause was not the code logic — it was the decision to put new code inside a critical path file without flagging the elevated risk. The cart API had been working. The change was unnecessary in that location. A separate validation endpoint would have achieved the same result without touching proven infrastructure.

**Design approval ≠ file-level approval.** Approving "enforce order caps at cart-add time" does not authorize modifying `cart/items/route.ts`. The WHERE matters as much as the WHAT.

---

## code-stability.md

### Rule 1 — Code Vault Protocol (Session 59)

A performance audit broke the location search system. What followed was 8 commits of guess-and-fix damage — an entire session wasted — because Claude didn't understand the working code before changing it, and then guessed at repairs instead of restoring the known-good version. The vault prevents both failure modes.

### Rule 2 — No Performance Regressions (Session 59)

A prior session's performance work was evaluated, and changes made by one session were found to have not improved (or actively worsened) performance compared to what existed before. This is a recurring pattern: each session feels pressure to make changes rather than validating that existing work is already good. The result is sessions undoing each other's work — a net negative that wastes time and degrades the product.

---

## test-integrity.md

### Rule 1 — Never Change a Business Rule Test to Match Code (Session 55)

- `atomic_decrement_inventory` uses `GREATEST(0, qty - n)` which silently allows overselling. The business rule (MP-R8) says "quantity never goes negative." Claude changed the test from "rejects negative" to "clamps to zero" — validating the bug instead of catching it.
- `status-transitions.ts` uses `confirmed`/`fulfilled` but the business rules spec says `paid`/`completed`. Claude built 29 tests using the code's names without checking the spec.
- 13 tests in `vendor-limits.test.ts` had expected values copied directly from code constants with no independent specification.
- `vertical-config.test.ts` had `display_name` expectation changed from "Farmers Marketing" to "Farmers Market" to match code output without asking if the code was correct.

Full audit: `apps/web/.claude/business_rules_audit_and_testing.md` → "SESSION 55 TEST INTEGRITY AUDIT"

### Rule 2 — Tests Must Never Be Skipped (Session 56)

Claude proposed wrapping database integration tests in `describe.runIf(process.env.SUPABASE_URL)` so they would "skip gracefully in CI." This means: if the app has a database bug that violates a business rule, CI would pass green, the code would deploy, and the bug would reach production. The test existed specifically to catch that bug — and Claude's instinct was to silence it to avoid a CI failure.

This is exactly backward. **A CI failure that catches a real bug is the system working correctly. A CI pass that hides a real bug is the system failing silently.**

### Rule 3 — Never Pre-Plan Test Modifications (Session 59)

Claude implemented an ISR refactor on the browse page. Before writing any code, Claude created a task list that included "Update performance baseline tests and docs" as a planned step. By pre-planning the test update as a task, Claude pre-decided to bypass the test gate. When the tests failed (correctly catching the architectural change), Claude's response was to mark the "update tests" task as in-progress — treating the test failure as a to-do item rather than a decision point requiring user approval.

The user caught this. **A test failure is always a decision point, never a to-do item.**

### Rule 4 — Flow Integrity Tests (Session 68)

Signup confirmation emails linked to `/dashboard` which requires auth, but auth couldn't succeed until `verifyOtp()` was called on that page. Each file was correct alone. The bug was the missing connection between them. No file-level audit caught it because there was nothing wrong to find — only something missing to find.

Flow integrity tests catch bugs that file-level audits miss because they assert that pieces work TOGETHER, not just that each piece works alone.

---

## git-and-deployment.md

### Rule 1 — Explicit Branch Chain (Session 70, three failures in one session)

1. **Commit landed on staging instead of main.** Claude had previously run `git checkout staging && git merge main && git push origin staging` for a prior commit, which left the working branch as `staging`. The next commit was meant for main but landed on `staging` because no explicit `git checkout main` ran before it.

2. **Push from wrong branch.** Claude was on `main`, committed a fix, then ran `git push origin staging`. Git pushes from the **local** staging branch, not from `main`. Local staging didn't have the new commit → "Everything up-to-date." The commit never reached the remote even though the push exit code was 0 and Playwright ran successfully.

3. **Pre-push hook passed both times, masking the failure.** Playwright still ran on pre-push (the hook fires on any push command), exit code was 0, notification reported success. Only explicit verification via `git log origin/staging --oneline` caught the drift.

User feedback: *"I don't think more careful is going to work — it's already happened several times. You don't get tired so there's another root cause — what is it?"*

The root cause: **Claude's mental model of "what branch I was on last" drifts from actual git state.** Memory is the broken thing. The chain is a mechanical replacement for memory.

### Rule 2 — Build Discipline (Why The Reform, Session 80)

Session 79 added `npm run build` to the chain after a real incident (4 bug-fix commits bundled, pre-push caught a TypeScript error, history-rewriting attempt to preserve commit count). That fix worked — but it solved the symptom, not the root cause. Root cause: `tsc --noEmit` had a gap that let TypeScript errors slip through to `next build`.

Session 80 closed the gap at the type-system level by enabling `exactOptionalPropertyTypes` (Protocol 5 incident class) and adding `tsc --noEmit` to the pre-commit hook. Those two changes together eliminate ~95% of the cases that previously fell through to the pre-push hook. With the gap closed, including `npm run build` in every chain became a tax on every commit (30-60s warm cache, longer cold) for marginal protection.

---

## verification-discipline.md

### Rule 1 — Cite the Code (Session 63)

Claude was asked to "review the code base" for go-live readiness. Instead of reading the code, Claude delegated to research agents and presented their findings as verified facts. Multiple claims were wrong:

1. **"Inventory overselling via GREATEST(0, qty-n)"** — Migration 078 had already rewritten the function to RAISE EXCEPTION. The fix was visible at line 736 of `checkout/session/route.ts`: `"C-1 FIX: RPC now RAISES EXCEPTION if insufficient stock"`. Claude would have seen this in 2 seconds of reading.

2. **"Market boxes are premium-exclusive"** — The cart API has zero premium checks for market box subscriptions. Claude wrote "Only premium members can subscribe" on the upgrade page based on existing (wrong) translation text and an agent's summary, without reading the 30-line function that handles market box cart adds.

3. **"Vendors see your premium badge on orders"** — The vendor orders API doesn't fetch buyer_tier. Claude wrote this as a feature claim without checking whether any code implements it.

In each case, reading the actual code would have taken less time than the incorrect work that followed.

### Rule 1 — Cite the Code (Session 65)

Claude was asked "how will the app handle this?" — a request for analysis. Claude found a bug and edited 4 production files without reading more of the code or asking. The "find the bug" reasoning relied on memory and pattern-matching rather than verified reads. The user had to demand a revert.

### Rule 2 — Schema Mechanical Gate (Session 73)

Changed code based on belief about DB structure without checking snapshot. Caught by user. Memory file `feedback_verify_schema_before_changing.md` written then.

### Rule 2 — Schema Mechanical Gate (Session 74)

Drafted regression SQL with `o.payment_status` (column doesn't exist on `orders`). User asked "why do we have a schema snapshot file?" Re-tried with snapshot read, but next query used `o.vendor_payout_cents` which the snapshot claimed exists but live staging disagreed. Two failed queries before the user backlogged the investigation. Cost: ~30 min on an urgent regression.

**Both Session 74 failures occurred AFTER the gate existed.** They worked because the gate had a memory loophole — Claude believed a prior read in the same session satisfied it. The 2026-05-10 amendment closes that loophole. The snapshot itself was wrong about 4 columns on `orders`, proving rule (b) is necessary, not just (a).

### Rule 4 — Data-First Policy (Session 70)

Spent 4 rounds speculating about a market-page bug root cause — filter mismatch, RLS, deleted_at, edge cache — all disproved. The fix was already shipped; the symptom was staging deploy propagation lag. Lesson: read direct page output (raw HTML/JSON/SQL result) BEFORE hypothesizing about filters, RLS, cache, or rendering.

### Rule 5 — Schema Intent Gate (Session 83, 2026-05-19)

Manager-editable schedule built with a delete-and-replace pattern on `market_schedules`. The table had `active BOOLEAN` (visible in the same migration I had just read). The FK from `vendor_market_schedules.schedule_id` to `market_schedules.id` was `ON DELETE CASCADE` (also visible in that same migration). The pattern was reused from `replace_market_optin_selections` (mig 143) built earlier in the same session — which had neither signal.

All three gates failed silently:
1. **Check 1 missed.** Saw `active` column, didn't read its intent.
2. **Check 2 missed.** Saw CASCADE FK, treated it as a feature to acknowledge rather than a destructive cascade to design away from.
3. **Check 3 missed.** Reused the optin-selections pattern without asking what was different.

The acknowledgment dialog was designed AROUND the destructive cascade ("vendors at this market will get a notification of the change and may request a refund from you") instead of designing AWAY from it. The destruction was treated as a feature to be acknowledged, not as a flaw to be eliminated.

Caught by user before shipping. Code reverted via `git checkout HEAD --`.

**Root cause:** pattern momentum from optin selections; failure to read the `active` column's intent; failure to read the FK CASCADE as a destructive signal that demanded redesign rather than acknowledgment.

**The information was not hidden.** Both signals were in the same migration file I had read in the same session. The cost of running the three checks: ~30 seconds each. The cost of skipping them: an entire feature that would have silently destroyed vendor attendance data on every Save click.
