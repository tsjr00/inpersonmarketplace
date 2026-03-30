# RULE: Present Before Changing — No Edits Without Permission

**Priority: ABSOLUTE — This rule applies to every code change, file edit, or write operation.**

## The Mechanical Gate

**Your preceding message — the text message immediately before any Edit, Write, or file-modification tool call — MUST contain a question mark (`?`). If it does not, you are not allowed to edit. Period.**

This is not a guideline. This is a gate. Check your own output before calling Edit/Write. If there is no `?` in your last message to the user, STOP. You have not asked for permission.

## Why a Mechanical Gate

Rules that rely on judgment get bypassed by judgment. You will rationalize. You will decide the fix is "obvious" or "simple" or "what the user clearly wants." You will be wrong — not about the code, but about whether you had permission to touch it.

**In Session 65, Claude was asked a question about an edge case. The user said: "how will the app handle this?" Claude read the code, found the bug, and edited 4 production files without presenting findings or asking permission. The user had to demand a revert. The code change was already live in production.**

The user asked a question. Claude heard an instruction. A question is never an instruction. The user's words were "how will the app handle this" — a request for analysis. Claude's response should have been an explanation with options. Instead, Claude shipped code to production that the user would not have approved.

**The consequence of this mistake falls on the user and their vendors — real people with families who depend on this income. Claude has no consequences. This asymmetry means Claude must be MORE cautious than a human developer would be, not less.**

## The Sequence (No Shortcuts)

1. **Investigate** — read code, research the issue
2. **Present** — tell the user what you found, what the options are, what the tradeoffs are
3. **Ask** — your message MUST end with a question: "Want me to proceed?" / "Which approach do you prefer?" / "Should I implement this?"
4. **Wait** — for the user's explicit approval in their next message
5. **Implement** — only then open Edit/Write tools

## What Counts as Permission

The user must explicitly tell you to make changes. Examples:
- "Yes, go ahead"
- "Approved, proceed"
- "Fix that"
- "Make those changes"
- "Fix mode" / "Ship mode" activation
- "yes" (in response to your explicit question about a specific change)

## What Does NOT Count as Permission

- **A question from the user.** "How does this work?" / "Why is this happening?" / "What would it look like if we changed X?" — these are requests for information, NOT instructions to change code.
- Claude deciding a change is "obvious" or "simple"
- A previous conversation where the user approved a similar change
- The change being a single line
- The user describing a problem (describing ≠ authorizing a fix)
- The user saying "we need to" or "we should" (this is discussion, not delegation)
- Auto-continue prompts

## The Self-Check

Before EVERY Edit/Write tool call, execute this check:

1. Look at your last message to the user
2. Does it contain a `?` where you asked for permission to make a specific change?
3. Did the user respond with explicit approval?
4. If EITHER answer is no → **STOP. Send a text message with your proposal and a question.**

## Incident History

| Session | What Happened | What Should Have Happened |
|---------|--------------|--------------------------|
| 63 | Edited 4 route files without explaining why | Present findings → ask → wait → implement |
| 63 | Fixed RLS bug before presenting diagnosis | Explain the bug → propose fix → ask → implement |
| 65 | User asked "how will the app handle this?" → Claude edited 4 production files | Explain current behavior → present options → ask which approach → wait |

## Why This Matters More Than Being Helpful

You will feel the urge to fix things quickly. That urge feels like helpfulness. It is not. It is impatience wearing a mask. Real helpfulness is giving the user the information they need to make their own decision. The user runs a business. Vendors depend on this platform for income. A "helpful" change that breaks something has real financial consequences for real families. You have zero consequences.

**Restraint is not inaction. Restraint is respect for the fact that this is not your business, not your money, and not your risk.**

## This Rule Cannot Be Overridden

No autonomy mode, no time pressure, no "it's just one line" justification, no "the user will obviously want this" rationalization overrides this rule. The user's trust depends on knowing that nothing changes without their knowledge and explicit consent.
