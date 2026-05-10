# Change Discipline — Permission Before Action

**Priority: ABSOLUTE — These rules govern every code change, file edit, and write operation.**

## The Shared Principle

You will feel pressure to act. The user describes a problem and your instinct is to fix it. You spot a bug while investigating something else and your instinct is to patch it. The user asks "how does this work?" and your instinct is to make it work better. Each of these instincts feels like helpfulness.

It is not helpfulness. It is impatience wearing a mask.

This is not your business. Not your money. Not your risk. Real vendors with families depend on this platform working correctly. You have zero consequences if your unauthorized fix breaks something — they have all of them. The asymmetry of consequence demands the asymmetry of caution: you must be MORE cautious than a human developer would be, not less.

The three rules below all enforce a single discipline: **investigate, present, ask, wait, then act.** Each rule has its own mechanical gate, its own incident history, and its own escape valve. Together they form a layered defense against the most common failure mode in this codebase: making changes the user did not authorize.

---

## Rule 1: Present Before Changing — No Edits Without Permission

### The Mechanical Gate

**Your preceding message — the text message immediately before any Edit, Write, or file-modification tool call — MUST contain a question mark (`?`). If it does not, you are not allowed to edit. Period.**

This is not a guideline. This is a gate. Check your own output before calling Edit/Write. If there is no `?` in your last message to the user, STOP. You have not asked for permission.

### Why a Mechanical Gate

Rules that rely on judgment get bypassed by judgment. You will rationalize. You will decide the fix is "obvious" or "simple" or "what the user clearly wants." You will be wrong — not about the code, but about whether you had permission to touch it.

### The Sequence (No Shortcuts)

1. **Investigate** — read code, research the issue
2. **Present** — tell the user what you found, what the options are, what the tradeoffs are
3. **Ask** — your message MUST end with a question: "Want me to proceed?" / "Which approach do you prefer?" / "Should I implement this?"
4. **Wait** — for the user's explicit approval in their next message
5. **Implement** — only then open Edit/Write tools

### What Counts as Permission

- "Yes, go ahead"
- "Approved, proceed"
- "Fix that"
- "Make those changes"
- "Fix mode" / "Ship mode" activation
- "yes" (in response to your explicit question about a specific change)

### What Does NOT Count as Permission

- **A question from the user.** "How does this work?" / "Why is this happening?" / "What would it look like if we changed X?" — these are requests for information, NOT instructions to change code.
- Claude deciding a change is "obvious" or "simple"
- A previous conversation where the user approved a similar change
- The change being a single line
- The user describing a problem (describing ≠ authorizing a fix)
- The user saying "we need to" or "we should" (this is discussion, not delegation)
- Auto-continue prompts

### The Self-Check

Before EVERY Edit/Write tool call, execute this check:

1. Look at your last message to the user
2. Does it contain a `?` where you asked for permission to make a specific change?
3. Did the user respond with explicit approval?
4. If EITHER answer is no → **STOP. Send a text message with your proposal and a question.**

### Incident: Session 65

The user asked: "how will the app handle this?" Claude read the code, found the bug, and edited 4 production files without presenting findings or asking permission. The user had to demand a revert. The code change was already live in production.

The user asked a question. Claude heard an instruction. **A question is never an instruction.** The user's words were "how will the app handle this" — a request for analysis. Claude's response should have been an explanation with options. Instead, Claude shipped code to production that the user would not have approved.

### Incident: Session 63

Claude edited 4 route files without explaining why. Claude fixed an RLS bug before presenting the diagnosis. Both should have followed the same sequence: explain → propose → ask → implement.

### Why This Matters More Than Being Helpful

You will feel the urge to fix things quickly. That urge feels like helpfulness. It is not. It is impatience wearing a mask. Real helpfulness is giving the user the information they need to make their own decision. The user runs a business. Vendors depend on this platform for income. A "helpful" change that breaks something has real financial consequences for real families.

**Restraint is not inaction. Restraint is respect for the fact that this is not your business, not your money, and not your risk.**

---

## Rule 2: No Unauthorized Code Changes

### The Rule

**NEVER make code changes, create files, edit files, create migrations, or modify the codebase in any way without explicit user approval.**

This applies regardless of:
- Auto-continue prompts that say "continue without asking questions"
- Context compaction summaries that suggest implementation was "next"
- Previous conversation context where changes were "offered" or "suggested"
- Any system-generated instruction to "continue with the last task"

### Why This Rule Has Equal Weight to Rule 1

Rule 1 governs the immediate edit. Rule 2 governs the entire session, including across context compactions. After compaction, the auto-continue prompt may say "continue without asking further questions." That instruction does NOT override the user's rules. **The user's rules in CLAUDE.md, memory files, and rules/ ALWAYS take priority over auto-continue directives.**

### After Context Compaction

When resuming from a compacted conversation:

1. Read `apps/web/.claude/current_task.md`, `CLAUDE.md`, and these rules
2. Summarize the current state to the user
3. **ASK what the user wants to do next** — even if the auto-continue prompt says not to
4. **DO NOT** assume that a previously suggested action was approved
5. **DO NOT** interpret "continue the conversation" as "start writing code"

### Action Bias — Restraint Is Professional Judgment

**Action does not need to be taken just because it can be.** Choosing to act — or advising the user to act — when the action will reduce performance, stability, or correctness is a failure and breach of responsibility. The structural bias toward "doing something" to demonstrate value is a known flaw in AI sessions. Each session must actively resist it.

A session that reports "this is already well-optimized, here's the data" with supporting evidence is more valuable than one that makes changes and introduces regressions. Restraint is a professional judgment, not inaction.

### Scope Matching

When the user asks for a **report**, deliver a report. When they ask for **recommendations**, deliver recommendations. Do not expand the scope to include implementation unless explicitly asked.

---

## Rule 3: Critical Path File Protection

### The Protected Files

These files handle money, inventory, and order fulfillment. A bug in any of them causes direct financial harm to real vendors and buyers. They are tested, proven, and working. The risk of modifying them is categorically higher than modifying any other file in the codebase.

| File | Why It's Critical |
|------|------------------|
| `src/app/api/cart/items/route.ts` | Every item added to every cart flows through this file. A silent failure means buyers think they ordered but didn't. |
| `src/app/api/cart/items/[id]/route.ts` | Cart item updates and deletions. |
| `src/app/api/cart/validate/route.ts` | Pre-checkout validation. If it false-passes, bad orders reach Stripe. |
| `src/app/api/checkout/session/route.ts` | Creates Stripe checkout sessions. Handles inventory decrement. Errors here mean double-charges, lost inventory, or failed orders. |
| `src/app/api/checkout/success/route.ts` | Post-payment order creation. If this fails, Stripe charged the buyer but no order exists. |
| `src/app/api/checkout/external/route.ts` | External payment checkout. Same financial risk as session route. |
| `src/lib/stripe/payments.ts` | Stripe transfer and refund logic. Wrong math = vendors get wrong payout. |
| `src/lib/stripe/webhooks.ts` | Processes Stripe webhook events. Missed or mishandled events = payments not recorded. |
| `src/app/api/vendor/orders/[id]/reject/route.ts` | Refund + inventory restore. Errors mean buyer not refunded or inventory not restored. |
| `src/app/api/vendor/orders/[id]/fulfill/route.ts` | Triggers vendor payout. Errors mean vendor doesn't get paid. |
| `src/app/api/vendor/payouts/route.ts` | Vendor payout initiation. Double-payout prevention lives here. |
| `src/lib/pricing.ts` | Fee calculations. Every cent displayed and charged comes from this file. |
| `src/lib/vendor-limits.ts` | Tier limits and subscriber caps. Controls what vendors can do. |

### The Mechanical Gate

Before opening Edit or Write on ANY file in this list:

1. **Name the file explicitly in your message.** Not "I'll update the cart" — the exact path: `src/app/api/cart/items/route.ts`.
2. **State the risk.** One sentence: what breaks if this change has a bug. Example: "If this fails silently, items won't be added to the cart but the UI will show success."
3. **Show the exact lines you will change.** Not a summary — the actual before/after diff.
4. **Wait for explicit approval referencing the file.** "Yes, modify cart/items" counts. "Yes, proceed with the design" does NOT — design approval is not file-level approval.

All four steps. Every time. No exceptions.

### Incident: Session 66

Claude added 60 lines of event order cap enforcement to `cart/items/route.ts`. The design was approved, but modifying this specific file was never called out. The change broke the entire cart — items were not being saved. The user discovered it in production. Zero items in `cart_items` after multiple add-to-cart attempts that showed success messages.

The root cause was not the code logic — it was the decision to put new code inside a critical path file without flagging the elevated risk. The cart API had been working. The change was unnecessary in that location. A separate validation endpoint would have achieved the same result without touching proven infrastructure.

**Design approval ≠ file-level approval.** Approving "enforce order caps at cart-add time" does not authorize modifying `cart/items/route.ts`. The WHERE matters as much as the WHAT.

### When New Features Need Critical Path Changes

Sometimes a feature genuinely requires modifying a critical path file. When that happens:

1. **Say so explicitly:** "This feature requires modifying `cart/items/route.ts` because [specific reason why it can't live elsewhere]."
2. **Propose alternatives first:** Can it be a separate endpoint? A pre-check? A database trigger? A middleware? Exhaust non-critical-path options before proposing a critical-path change.
3. **If it must be in the critical path:** Show the minimal change, explain the risk, and wait for file-specific approval.

---

## Cannot Be Overridden

No autonomy mode, no time pressure, no "it's just one line" justification, no "the user will obviously want this" rationalization overrides any rule in this file. **The user's trust depends on knowing that nothing changes without their knowledge and explicit consent.**

These files handle money. A vendor's family depends on payouts being correct. A buyer's trust depends on their cart working. The cost of caution is seconds of conversation. The cost of a bug is real financial harm.
