# Findings Contract + Ledger (how to report)

One shape for every finding, across every slice and every pass. Consistent + deduped +
verifiable = actionable, and successive passes don't re-report each other.

## Rules
- **Report only. Do NOT fix.** Findings go in the ledger; the user triages; a separate fix pass follows.
- **Every finding must be verified** — a `path:line` you personally read. No memory, no "probably." If you can't verify, either verify it or drop it. A 7-finding report that's 100% correct beats a 12-finding report with 3 wrong.
- **Confidence marker required:** `Confirmed` (read the code + traced it) / `High` / `Medium` / `Low`. Never say "the root cause" for anything below Confirmed.
- **Check `KNOWN_AND_OUT_OF_SCOPE.md` first.** If it's listed there, don't file it (unless you have new evidence a locked decision is being violated).
- **De-dupe on `<file>:<line> + category`.** Before adding, scan the ledger for the same anchor. If a later pass refines an existing finding, edit that row — don't add a duplicate.

## Severity
| Level | Meaning |
|---|---|
| **P0** | Money loss, data loss/corruption, security breach (authz/RLS/IDOR), or checkout/payout broken. Real financial harm to real vendors/buyers. |
| **P1** | Correctness bug with user-visible wrong behavior; a cross-file contract break; a security gap not yet exploitable. |
| **P2** | Efficiency/cost (extra API calls, N+1, uncached external call, needless token/LLM spend), or a real-but-contained bug. |
| **P3** | Minor correctness/UX, missing guard on an unlikely path, cleanup that prevents a future bug. |

## Required fields (one row per finding in the ledger)
`ID` · `Slice` · `Severity` · `Category` · `Confidence` · `Anchor (file:line)` · `Claim (1 sentence)` · `Failure scenario (inputs → wrong result)` · `Proposed fix` · `Effort (S/M/L)` · `Cost note`

- **Category** (kebab): `correctness` · `security` · `money-path` · `data-integrity` · `contract-break` · `efficiency` · `token-cost` · `dead-code` · `ux`
- **Failure scenario** is mandatory for P0–P2: concrete inputs/state → the wrong output/crash. "Might be fragile" is not a finding.
- **Cost note** (for `efficiency`/`token-cost`): what it costs now (e.g. "N geocode calls per manager signup, uncached") and the saving (e.g. "cache by address → ~1 call"). Blank for non-cost findings.
- **Effort:** S ≤30 min · M ≤half day · L larger/needs design.

## Ledger
Accumulate all findings in **`.claude/review/FINDINGS_LEDGER.md`** (create on first pass) as a single Markdown table with the columns above, grouped by Severity (P0 first). One ledger for the whole series so passes stay deduped and triage is one place. Suggested ID scheme: `<slice-abbrev>-<n>` (e.g. `CHK-1`, `EVT-3`).

## Per-finding template (paste into the ledger row, or emit as your structured output)
*(Illustrative format only — this specific market-box bug was found in a past audit and already fixed; it is NOT a live finding. Shown to demonstrate the shape.)*
```
ID:         CHK-1
Slice:      Checkout & payments
Severity:   P0
Category:   money-path
Confidence: Confirmed
Anchor:     src/app/api/checkout/success/route.ts:531
Claim:      Market-box payout uses offering price when Stripe metadata basePriceCents is missing, overpaying the vendor.
Scenario:   Checkout path that omits basePriceCents metadata → processMarketBoxPayout falls back to full offering price → vendor transfer exceeds platform's held base.
Fix:        Thread basePriceCents through both checkout paths; hard-fail (don't fall back) if absent.
Effort:     M
Cost note:  —
```

## When a pass finds nothing new in its slice
Say so explicitly ("slice X: 0 new findings, N existing confirmed still valid") — a clean, evidenced "this is solid" is a valid, valuable result. Do not invent findings to look productive.
