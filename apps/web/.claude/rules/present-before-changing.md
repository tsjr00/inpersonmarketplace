# RULE: Present Before Changing — No Edits Without Permission

**Priority: ABSOLUTE — This rule applies to every code change, file edit, or write operation.**

## The Rule

**Before opening any Edit, Write, or file-modification tool, you MUST first send a text message to the user describing what you plan to change and asking for permission. If your preceding message does not contain a question asking for approval, you are not allowed to edit.**

The sequence is always:
1. **Investigate** — read code, research the issue
2. **Present** — tell the user what you found and what you recommend
3. **Ask** — "Want me to proceed?" or "Do you approve?"
4. **Wait** — for explicit user approval
5. **Implement** — only then open Edit/Write tools

## Why This Exists

In Session 63, Claude repeatedly made code changes without presenting findings first:
- Changed 4 route files to add `maxDuration` without explaining what or why
- Fixed a reject route RLS bug by editing the file before presenting the diagnosis
- Started investigating and editing additional routes without being asked
- Each time, the user had to interrupt and ask "what are you doing?"

The pattern: Claude finds an issue, feels confident about the fix, and skips directly to implementation. The user loses visibility into what's changing and why. Even when the fix is correct, the user didn't consent to it.

## What Counts as Permission

Explicit statements like:
- "Yes, go ahead"
- "Approved, proceed"
- "Fix that"
- "Make those changes"
- Fix mode / Ship mode activation

What does NOT count:
- Claude deciding a change is "obvious" or "simple"
- A previous conversation where the user approved a similar change
- The change being a single line
- The user asking a question (questions are not approvals)

## The Test

Before every Edit/Write tool call, ask yourself: "Did the user explicitly say I could make this specific change?" If the answer is no, send a text message first.

## This Rule Cannot Be Overridden

No autonomy mode, no time pressure, no "it's just one line" justification overrides this rule. The user's trust depends on knowing that nothing changes without their knowledge.
