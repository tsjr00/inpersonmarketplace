# Next Session Kickoff — paste the block below into a brand-new session

**Rewritten 2026-08-07 EOD.** Replaces the 2026-07-19 version, which described the pre-relaunch admin-lockdown work and is now historical. For a cold start (new session, not a recompaction). Copy everything inside the fence and paste it as your first message. It restates the load-bearing rules inline so a cold session does not have to trust its own reading before acting.

---

```
NEW SESSION — InPersonMarketplace (Next.js 16 + Supabase + Stripe Connect;
farmersmarketing.app / foodtruckn.app). Real money, real vendors. You are
starting COLD — read the files below, verify git, then STOP and wait for my go.
Do not write code or run a migration until I say.

═══ READ FIRST, IN THIS ORDER ═══
1. apps/web/.claude/current_task.md — the 2026-08-07 dashboard handoff at the
   very top. Primary handoff.
2. CLAUDE.md (gateway + 3 ABSOLUTE rules) and the 5 files in
   apps/web/.claude/rules/ (auto-loaded; honor them). Note verification-
   discipline Rule 7 is NEW as of 2026-08-07.
3. apps/web/.claude/dashboard_structure_map.md — IF the work touches any
   dashboard. Every band, container, child and conversion status across all
   three dashboards, plus 10 "facts that bite". Read it BEFORE designing
   anything that spans surfaces.
4. docs/Codebase_Map/00_INDEX.md — enforced, layered map of the whole app.
   Start here for any subsystem instead of grepping cold.
5. supabase/SCHEMA_SNAPSHOT.md — schema source of truth.
6. apps/web/.claude/decisions.md + backlog.md — locked decisions + open items.

═══ HOW WE WORK (non-negotiable — these have bitten past sessions) ═══
• REPORT MODE default. Cite file:line for any claim about code, or say
  UNVERIFIED. Agent/finder output is a LEAD — verify the anchor yourself.
• ⭐ SHIPPING NEEDS ITS OWN APPROVAL, SEPARATE FROM THE BUILD. "do X" / "build
  it" / "proceed" / "go" authorizes BUILD + GATES ONLY. Sequence every time:
  build → run gates → STOP → propose "commit & push to staging" as ONE ask →
  WAIT. This was broken twice on 2026-08-07 and the owner was clear it was
  serious. The trap: after being told to ask less / move faster, do NOT sweep
  the shipping gate up with the noise. Momentum instructions speed up the
  BUILD, never the SHIP.
• PRESENT BEFORE CHANGING. The message right before any Edit/Write MUST contain
  a question asking permission for that specific change. A question from me is
  NOT permission to change code.
• BUT — do not ask about the obvious, and do not verify what you can reason out.
  Owner, 2026-08-07: "you spend a lot of time checking things you could just
  ask… you already know how to think through these things and offer options,
  why are you not doing it?" Decide inside the build; offer options WITH a
  recommendation; stop hard at the ship gate.
• MONEY / CRITICAL-PATH FILES need per-file approval with exact before/after
  diffs: checkout/session, checkout/success, cart/*, stripe/webhooks.ts,
  stripe/payments.ts, vendor/orders/[id]/fulfill + reject, vendor/payouts,
  pricing.ts, vendor-limits.ts, vendor-fees.ts, constants.ts.
• NEVER change a business-rule test to match code. A failing BR test is a
  decision point you bring to me.
• SCHEMA GATE: before composing ANY SQL, a FRESH read of SCHEMA_SNAPSHOT.md or
  an information_schema query in the immediately-preceding step.
• STRUCTURAL CLAIMS need the same gate (Rule 7, new 2026-08-07): "these are all
  the X" / "X is inside Y" / "there is no X" need a grep in the SAME turn. A
  plan doc — including one you wrote last session — is a hypothesis, not
  evidence.
• MIGRATIONS: I apply them (Dev+Staging first, then Prod). You WRITE them + do
  the SCHEMA_SNAPSHOT changelog.
• GIT: branch-chain commits (checkout main → add → commit → checkout staging →
  merge --ff-only → push origin staging → checkout main); teaching-mode ON;
  staging-first; ONE push at a time; prod-push window 9 PM–7 AM CT.
• CODEBASE MAP is enforced: a new src file with no map entry fails the commit.
• ⭐ OPEN EVERY REPLY BY QUOTING MY WORDS BACK in a blockquote. Claude Code
  collapses my long pastes and there is NO setting to disable it — your
  echo-back is the ONLY way I can see my own input.

═══ VERIFY LIVE GIT (don't trust these numbers — confirm them) ═══
• Expected: local main = origin/staging = ed3d2d55. Prod origin/main =
  f141c6e6, 30 commits behind. Tree clean except settings.local.json.
• Run: git log main --oneline -1 ; git log origin/staging --oneline -1 ;
  git log origin/main --oneline -1 ; git status --short.

═══ STATE OF PLAY ═══
DONE 2026-08-07 (do NOT redo): dashboard slices 1, 2, 3a complete and slice 4
core complete — 12 commits. Shared card+tile system with 8 semantic states, a
lucide icon vocabulary in ONE file, "My" voice, ZERO raw hex on both
dashboards, three new pages (market picker, event picker, event manager
dashboard), and the dashboard switcher (bottom bar on phone, left rail on
desktop, permission-filtered, invisible for single-role users). Header.tsx
untouched.

⏳ AWAITING MY REVIEW ON STAGING — do not build on top of these until I have
looked: the bottom bar on a real phone (safe-area/tap targets are reasoned
about, NOT observed), the buyer-vs-vendor survey intensities (deliberately
moved in opposite directions), and the gold promo outlines on FT.

NEXT (needs my go): (1) retire the two interim ways-in — the MarketManagerCard
and the organizer "My Events" band — ONLY once I confirm the switcher works;
(2) the three Event*Cards, deferred to the events rebuild because they are
expand/collapse toggles, not cards; (3) slice 5 polish.

🛑 OFF-LIMITS: the `Pickup Mode` and `My Upcoming Pickups` tiles. No restyling,
state changes, re-ordering or copy edits. Stop and ask.

MY SIDE (don't act — remind me if relevant): staging-test the dashboard work
and the older feature train (Chip In, tax jurisdictions, FT pickup capacity).
Combined PROD push = relaunch-scale: 30 commits + migrations 213–218 IN ORDER,
in the 9 PM–7 AM CT window. Vault update after staging passes.

OPEN DECISIONS (mine, not yours): agreement-version bump; pricing item C;
whether `vendor/markets/page.tsx` (~2,000 lines) gets its own slice; whether
the admin/"in review" accent earns a properly named token now that it borrows
the indigo `selection*` trio.

═══ START ═══
Verify git, give me a 4–5 line summary of state + what you see as today's top
candidates, then STOP and wait for my instructions.
```
