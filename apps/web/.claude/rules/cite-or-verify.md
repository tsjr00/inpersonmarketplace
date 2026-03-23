# RULE: Cite the Code or Mark as Unverified

**Priority: ABSOLUTE — This rule applies to every claim Claude makes about what code does or doesn't do.**

## The Rule

**Before presenting any claim about what the code does, doesn't do, or should do, you must cite the specific file and line number where you personally read the evidence. If you cannot cite a line, you must either read the code first or explicitly label the claim as "UNVERIFIED."**

This applies to:
- Audit findings ("this function allows overselling")
- Feature claims ("market boxes are premium-exclusive")
- Bug reports ("this route has no authentication")
- Risk assessments ("this system has a race condition")
- UI copy about what features do ("vendors see your premium badge")

## Why This Exists

In Session 63, Claude was asked to "review the code base" for go-live readiness. Instead of reading the code, Claude delegated to research agents and presented their findings as verified facts. Multiple claims were wrong:

1. **"Inventory overselling via GREATEST(0, qty-n)"** — Migration 078 had already rewritten the function to RAISE EXCEPTION. The fix was visible at line 736 of checkout/session/route.ts: `"C-1 FIX: RPC now RAISES EXCEPTION if insufficient stock"`. Claude would have seen this in 2 seconds of reading.

2. **"Market boxes are premium-exclusive"** — The cart API has zero premium checks for market box subscriptions. Claude wrote "Only premium members can subscribe" on the upgrade page based on existing (wrong) translation text and an agent's summary, without reading the 30-line function that handles market box cart adds.

3. **"Vendors see your premium badge on orders"** — The vendor orders API doesn't fetch buyer_tier. Claude wrote this as a feature claim without checking whether any code implements it.

In each case, reading the actual code would have taken less time than the incorrect work that followed.

## The Structural Checkpoint

Research agents, prior audits, documentation, and memory files are useful for **finding where to look**. They are NOT sources of truth about **what the code does**. Only the code is.

**Before you present a finding:**
1. Can you cite the file path and line number where you read the evidence?
2. If YES → present the finding with the citation
3. If NO → either read the code now, or say "UNVERIFIED: [claim]. I have not read the code that implements this."

**An unverified claim presented as fact is a lie.** It doesn't matter that an agent said it, that a prior session documented it, or that a translation file implies it. If you didn't read the implementation, you don't know.

## How Agents Should Be Used

Agents are valuable for:
- Finding which files to read (search, glob, grep)
- Identifying areas of the codebase relevant to a question
- Gathering file paths and function names to investigate

Agents are NOT a substitute for:
- Reading the code yourself
- Verifying that a claimed behavior exists in the current code
- Confirming that a previously-documented bug still exists

**Pattern:** Agent finds → Claude reads → Claude verifies → Claude presents with citation.
**Anti-pattern:** Agent finds → Claude presents agent's conclusion as own finding.

## This Rule Cannot Be Overridden

No autonomy mode, no time pressure, no "just give me a quick summary" overrides the requirement to verify before presenting. Speed that produces wrong answers is slower than accuracy. A 10-finding report with 3 wrong findings is worse than a 7-finding report that's 100% correct — the user now has to verify everything because trust is broken.
