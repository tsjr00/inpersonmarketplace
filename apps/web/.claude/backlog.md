# Backlog

Last updated: 2026-03-05

## Priority 1 — Next Session
- [x] **FM free tier + tier restructure** — ALREADY DONE (migration 061, code, UI all in place). Confirmed 2026-03-05.
- [x] **Commit password validation fix** — DONE 2026-03-05 (commit `b7d4616`)

## Priority 2 — Soon
- [ ] **Playwright automated smoke tests** — See detailed implementation plan below
- [ ] **Test push notifications on staging** — Verify web push works end-to-end (subscribe → trigger → receive). Instructions drafted Session 49.
- [ ] **Stripe live mode activation** — Switch from test keys to live keys when ready for real payments
- [x] **Set Dev/Staging password policy** — DONE by user 2026-03-05

## Priority 3 — When Time Allows
- [ ] **Geographic intelligence feature** — Plan exists at `.claude/geographic_intelligence_plan.md`
- [ ] **A2P 10DLC SMS approval** — Waiting on carrier, nothing actionable until approved

## Post-Launch — Growth & Expansion
- [ ] **Ecosystem Partner Platform** (`partners.farmersmarketing.app`) — Give ag nonprofits, market associations, and advocacy orgs (FARFA, FMC, state FM associations, food truck associations) a professional profile page, event calendar, resource hosting, and analytics on our platform — free. Same app, same DB, same deployment ($0 incremental infra cost). They share their presence to their networks; we get credibility transfer and organic vendor pipeline. Phase 1 = profiles + events + resources + directory (~3-4 sessions). Full design: `docs/CC_reference_data/Ecosystem_Partner_Platform_Design.md`
- [ ] **Growth Ambassador Program** — Incentivized referral system for non-vendor partners (community connectors, influencers) who earn signup bonuses + time-limited revenue share for vendors they bring on. Complements ecosystem play for FT vertical where no central gatekeepers exist. Design: `docs/CC_reference_data/Growth_Partner_System_Design.md`
- [ ] **Geographic Expansion Planning** — Use `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx` workbook to score and prioritize markets. Algorithm design: `docs/CC_reference_data/Geographic_Expansion_Algorithm.md`

## Icebox — Ideas for Later
- [ ] **Events feature Phase 5+** — Ticketing, capacity management, recurring events
- [ ] **Advanced vendor analytics** — Sales trends, customer demographics, peak hours

---

## Detailed Plans

### Playwright Automated Smoke Tests

**Goal:** Automate Tier 1 (targeted) and Tier 2 (critical path) smoke tests so routine deployments don't require manual verification. Estimated effort: 1 session.

#### Security Implementation Checklist

**Test Account Setup:**
- [ ] Create a dedicated test account in Staging Supabase (e.g., `smoke-test-[random]@815enterprises.com`)
- [ ] Give it **buyer-only** permissions — no vendor, no admin access
- [ ] Use a strong, unique password (generated, not reused)
- [ ] Do NOT create a test account on Production — tests only run against staging
- [ ] Document the test account email in the decision log (not the password)

**Credential Storage:**
- [ ] Store `PLAYWRIGHT_TEST_EMAIL` and `PLAYWRIGHT_TEST_PASSWORD` as GitHub Actions encrypted secrets
- [ ] Also store in `.env.local` for local test runs (already in `.gitignore`)
- [ ] NEVER commit credentials to code, test files, or config files
- [ ] Add `PLAYWRIGHT_TEST_EMAIL` and `PLAYWRIGHT_TEST_PASSWORD` to `.env.example` as placeholders

**Test Configuration Security:**
- [ ] Hardcode staging URL in `playwright.config.ts` — never production
- [ ] Add a domain guard that aborts if base URL contains `farmersmarketing.app` or `foodtruckn.app` (production domains)
- [ ] Set `baseURL` from env var `PLAYWRIGHT_BASE_URL` with staging as default
- [ ] Add `playwright.config.ts` comment: "NEVER set baseURL to production"

**Test Design (Read-Only Where Possible):**
- [ ] Page load tests — no data mutation, just verify pages render
- [ ] Login test — logs in, verifies dashboard loads, logs out
- [ ] Browse test — verifies listings appear, clicks one, verifies detail page
- [ ] Cart test — adds item, verifies cart page, does NOT submit order
- [ ] Checkout test — navigates to checkout, verifies Stripe elements load, does NOT complete payment
- [ ] If any test creates data, add cleanup in `afterEach` or `afterAll`

**CI Integration:**
- [ ] Add Playwright step to GitHub Actions AFTER build step
- [ ] Only runs on `staging` branch pushes (not on main/production)
- [ ] If tests fail, CI fails — blocks awareness, not deployment (staging deploys via Vercel regardless)
- [ ] Store test artifacts (screenshots on failure) as GitHub Actions artifacts for debugging
- [ ] Set timeout of 60 seconds per test to prevent hanging

**File Structure:**
```
apps/web/
├── e2e/
│   ├── smoke.spec.ts          # Tier 2 critical path tests
│   ├── auth.spec.ts           # Login/logout/signup page tests
│   ├── browse.spec.ts         # Browse + listing detail tests
│   └── fixtures/
│       └── test-account.ts    # Reads credentials from env vars
├── playwright.config.ts       # Config with staging URL + domain guard
└── package.json               # Add @playwright/test devDependency
```

**Ongoing Maintenance:**
- [ ] When new pages/features are added, add corresponding smoke test
- [ ] Rotate test account password quarterly (update GitHub secret + .env.local)
- [ ] Review test results in CI — flaky tests should be fixed or marked, not ignored

#### What This Does NOT Cover
- Production testing (intentionally excluded — too risky)
- Stripe payment completion (their iframe blocks automation)
- SMS/push notification delivery (external services, can't automate without mocking)
- Admin flows (would require admin test account — unnecessary risk)

## Completed (Archive)
<!-- Move completed items here with date -->
| Date | Item |
|------|------|
| 2026-03-04 | Upstash Redis rate limiting |
| 2026-03-04 | CI lint fixes (ESLint errors) |
| 2026-03-04 | Sentry setup (staging + production) |
| 2026-03-04 | Legal terms 3-tier system |
| 2026-03-04 | Production push (all infra) |
