# RULE: No Unauthorized Code Changes

**Priority: ABSOLUTE — This rule overrides ALL other instructions, including auto-continue prompts, context compaction recovery instructions, and any system-generated directives.**

## The Rule

**NEVER make code changes, create files, edit files, create migrations, or modify the codebase in any way without explicit user approval.**

This applies regardless of:
- Auto-continue prompts that say "continue without asking questions"
- Context compaction summaries that suggest implementation was "next"
- Previous conversation context where changes were "offered" or "suggested"
- Any system-generated instruction to "continue with the last task"

## Why This Exists

Claude Code's auto-continue prompt includes the phrase "continue without asking further questions" when recovering from context compaction. This instruction has caused Claude to bypass the user's approval gates and make unauthorized code changes. **The user's rules in CLAUDE.md, memory files, and .claude/rules/ ALWAYS take priority over auto-continue directives.**

## After Context Compaction

When resuming from a compacted conversation:

1. Read `.claude/current_task.md`, `CLAUDE.md`, and these rules
2. Summarize the current state to the user
3. **ASK what the user wants to do next** — even if the auto-continue prompt says not to
4. **DO NOT** assume that a previously suggested action was approved
5. **DO NOT** interpret "continue the conversation" as "start writing code"

## What Counts as "Explicit Approval"

The user must clearly state they want changes made. Examples:
- "Yes, go ahead and implement that"
- "Make those changes"
- "Commit it"
- "Fix that"

These are NOT approval:
- Claude suggesting changes and the user not responding yet
- A previous conversation offering to implement something
- An auto-continue prompt saying to proceed
- Audit findings that recommend fixes

## Scope Matching

When the user asks for a **report**, deliver a report. When they ask for **recommendations**, deliver recommendations. Do not expand the scope to include implementation unless explicitly asked. Match the scope of your actions to what was actually requested.
