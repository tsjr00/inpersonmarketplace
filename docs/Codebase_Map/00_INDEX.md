# Codebase Map — Index

**What this is:** the single, maintained map of the InPersonMarketplace application code. It exists so that a new engineer, a technical due-diligence reviewer, or an incoming CTO can understand the shape of the system and know where to read — without rediscovering it by grep.

**Scope:** application code under `apps/web/src` (846 source files as of the stamp below). Database structure is deliberately NOT duplicated here — `supabase/SCHEMA_SNAPSHOT.md` is the source of truth for schema, and this map points at it.

**Maintenance model:** this map is enforced, not aspirational. A machine test (`apps/web/src/lib/__tests__/codebase-map-coverage.test.ts`) runs in the pre-commit hook and fails the commit if any source file is unmapped, if any file named here no longer exists, or if any API route or cron is missing. See [§ How this map is maintained](#how-this-map-is-maintained).

---

## Reading order for a new engineer

| # | Read | Why |
|---|---|---|
| 1 | [01_System_Overview.md](01_System_Overview.md) | Stack, environments, the two verticals, roles, integrations, env vars. Nothing else makes sense first. |
| 2 | [02_Money_Flow.md](02_Money_Flow.md) | This is a payments business. The money path is the spine of the app. |
| 3 | [16_Auth_RLS_Verticals.md](16_Auth_RLS_Verticals.md) | The three Supabase client factories and vertical scoping — the two things new devs get wrong first. |
| 4 | The domain file for whatever you're working on | See the map below. |
| 5 | [23_Test_Suites.md](23_Test_Suites.md) | What the test suite already guarantees — and which suites you must never edit to make a change pass. |
| 6 | `../../CLAUDE.md` + `apps/web/.claude/rules/` | The engineering rules this codebase is developed under (change discipline, verification, test integrity, git/deploy, code stability). |

**Also worth knowing:** `apps/web/.claude/decisions.md` is the decision log (why things are the way they are), and `apps/web/.claude/review/FINDINGS_LEDGER.md` records the July 2026 pre-relaunch review — every finding and its resolution.

---

## The map

### System-level

| File | Covers |
|---|---|
| [01_System_Overview.md](01_System_Overview.md) | Stack, environments, verticals, roles, integrations, env vars, architectural facts |
| [02_Money_Flow.md](02_Money_Flow.md) | Cross-file money flows: cart → checkout → Stripe → payout; refunds; the fee model |

### Domains

| File | Covers |
|---|---|
| [10_Checkout_Payments.md](10_Checkout_Payments.md) | Cart, checkout, Stripe integration, pricing, inventory ⚠ money |
| [11_Vendor_Orders.md](11_Vendor_Orders.md) | Vendor dashboard + order lifecycle (confirm/ready/fulfill/reject/cancel), payouts ⚠ money |
| [12_Market_Manager.md](12_Market_Manager.md) | Farmers-market manager: booths, seasons, opt-in/agreements, settlement ⚠ money |
| [13_FT_Park.md](13_FT_Park.md) | Food-truck park operator: spots, standing reservations, occurrences, credits ⚠ money |
| [14_Events.md](14_Events.md) | Private/catering events: organizer tokens, waves, viability, attendee ordering |
| [15_MarketBoxes_Subs.md](15_MarketBoxes_Subs.md) | Market boxes (CSA/chef boxes) and Stripe subscriptions ⚠ money |
| [16_Auth_RLS_Verticals.md](16_Auth_RLS_Verticals.md) | Auth, Supabase client factories, RLS posture, multi-vertical isolation, onboarding |
| [17_Crons.md](17_Crons.md) | The 5 scheduled jobs — including `expire-orders`, the heaviest money-moving job |
| [18_Notifications.md](18_Notifications.md) | The single notification pipe, channels by urgency, email suppression |
| [19_Admin.md](19_Admin.md) | Platform + per-vertical admin surface, reports, moderation |
| [20_Buyer_Public.md](20_Buyer_Public.md) | Buyer surfaces, browse/location system, public market & truck pages |

### Reference

| File | Covers |
|---|---|
| [21_Lib_Reference.md](21_Lib_Reference.md) | Shared lib modules not owned by a single domain |
| [22_Components_UI.md](22_Components_UI.md) | Component tree by directory, page-route inventory |
| [23_Test_Suites.md](23_Test_Suites.md) | Every test suite and what it protects |

---

## How this map is maintained

The failure mode this design guards against is the one every codebase map dies of: it is written once, drifts within weeks, and then actively misleads. Two mechanisms, one mechanical and one procedural, because only one half of the problem is machine-checkable.

### Mechanical — coverage (enforced by the pre-commit test)

Each domain file declares which source paths it covers, in a claim block:

```
<!-- map-claims
src/app/api/cart/**
src/lib/pricing.ts
-->
```

`codebase-map-coverage.test.ts` parses every claim block and enforces five rules:

1. **No unmapped files** — every `.ts`/`.tsx` under `apps/web/src` (tests excluded) is claimed by at least one domain file. *A new file cannot be committed without a map entry.*
2. **No dangling references** — every explicit file path named in a claim block still exists. *A deleted or renamed file forces the map to be cleaned up.*
3. **Every cron in `vercel.json` appears in `17_Crons.md`** — a scheduled job nobody documented is a job nobody audits, and crons run on production only.
4. **Every protected-path file carries the ⚠ marker** in the file that documents it (source list: `apps/web/.claude/protected-paths.txt`). Money files must *read* as money files.
5. **Stamps exist and are indexed** — every domain file declares a `map-stamp`, and every map file has a row in the table below.

Tests are deliberately excluded from Rule 1: they are inventoried narratively in [23_Test_Suites.md](23_Test_Suites.md), and a claim per test file would be churn without signal.

**What is deliberately NOT enforced:** individual API routes are not required to appear by name. Rule 1 guarantees every route file is *covered*, but the domain files group some routes (`analytics/overview · trends · top-products`) for readability. Naming all 256 verbatim would make the map a worse document to read and would not catch anything Rule 1 misses.

### Procedural — accuracy (a rule, because no test can check it)

A test can verify that a file is *mentioned*. No test can verify that its one-line description is still *true* after someone changes what it does. So:

> **When a commit changes what a file does — its purpose, its flow, or its money behavior — update that file's line in the map and bump the domain's stamp in the table below, in the same commit.**

This is the code-side twin of the schema rule ("migration applied → changelog entry before anything else", `verification-discipline.md` Rule 3). Semantic drift is made *visible* by stamps going stale rather than silent.

### Stamps — last verified

Each domain file was verified against the code at the commit shown. A stamp far behind `main` is a signal to re-verify that domain before trusting its descriptions.

| Domain file | Last verified | At commit |
|---|---|---|
| 01_System_Overview.md | 2026-07-18 | b9f82116 |
| 02_Money_Flow.md | 2026-08-09 | 106fed3c |
| 10_Checkout_Payments.md | 2026-08-09 | 106fed3c |
| 11_Vendor_Orders.md | 2026-07-18 | b9f82116 |
| 12_Market_Manager.md | 2026-07-18 | b9f82116 |
| 13_FT_Park.md | 2026-07-18 | b9f82116 |
| 14_Events.md | 2026-07-18 | b9f82116 |
| 15_MarketBoxes_Subs.md | 2026-07-18 | b9f82116 |
| 16_Auth_RLS_Verticals.md | 2026-07-18 | b9f82116 |
| 17_Crons.md | 2026-07-18 | b9f82116 |
| 18_Notifications.md | 2026-07-18 | b9f82116 |
| 19_Admin.md | 2026-07-18 | b9f82116 |
| 20_Buyer_Public.md | 2026-07-24 | f30a0cac |
| 21_Lib_Reference.md | 2026-08-09 | 106fed3c |
| 22_Components_UI.md | 2026-07-18 | b9f82116 |
| 23_Test_Suites.md | 2026-07-18 | b9f82116 |

**Bootstrap note:** this map was created 2026-07-18 against a frozen, fully-reviewed tree (the seven-day pre-relaunch review had just closed), so every domain starts from a verified baseline rather than an accumulated guess.
