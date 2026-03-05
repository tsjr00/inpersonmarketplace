# Decision Log

Structured record of business and architecture decisions. Check here before asking "what did we decide about X?"

| Date | Category | Decision | Rationale | Reversible? | Session |
|------|----------|----------|-----------|-------------|---------|
| 2026-02-28 | Business | Vendor trial = 90 days, grace = 14 days | Industry standard, generous enough to prove value | Yes | 48 |
| 2026-02-28 | Business | Trial auto-grants Basic tier (FT) | Lowest paid tier gives real value without giving everything away | Yes | 48 |
| 2026-02-28 | Architecture | Market box payout at checkout, not per-pickup | Prepaid model — vendor should get paid when buyer pays | No (would require migration) | 48 |
| 2026-03-05 | Business | FM Premium = $25/mo (was $24.99) | Clean number, user requested | Yes | 50 |
| 2026-03-05 | Business | FT Pro = $25/mo (was $30), matches FM Premium | Unified pricing across verticals | Yes | 50 |
| 2026-03-05 | Business | FT annual pricing = same as FM annual | Consistency: Basic $81.50/yr, Pro $208.15/yr, Boss $481.50/yr | Yes | 50 |
| 2026-03-05 | Business | FM Premium annual stays $208.15/yr (not rounded to $210) | User chose to keep existing amount despite $25 monthly | Yes | 50 |
| 2026-02-22 | Architecture | Vendor quality checks = nightly cron (Phase 8) | Don't slow down real-time operations with quality scoring | Yes | 42 |
| 2026-02-20 | Financial | Tip % applied to displaySubtotal (per-item rounded) | Matches Stripe line items, avoids penny discrepancies | No | 40 |
| 2026-02-20 | Financial | Platform fee tip tracked in `tip_on_platform_fee_cents` | Vendor gets tip on food only, platform fee tip is separate | No | 40 |
| 2026-02-20 | UX | `ConfirmDialog` replaces all `window.confirm/prompt/alert` | Mobile browsers block native dialogs | No (72 instances replaced) | 40 |
| 2026-03-04 | Architecture | Upstash Redis for rate limiting (sliding window) | Shared across Vercel instances, free tier 10K cmds/day | Yes | 49 |
| 2026-03-04 | Architecture | Sentry via `SentryInit.tsx` client component | v10 doesn't auto-load `sentry.client.config.ts` via webpack | Yes | 49 |
| 2026-03-04 | Security | Password policy: min 9, upper+lower+number+special | Set in Supabase Auth for all 3 environments | Yes (Supabase dashboard) | 49 |
| 2026-03-04 | Architecture | `checkRateLimit()` is async (returns Promise) | Required for Upstash Redis, falls back to in-memory sync | No (181 call sites changed) | 49 |
| 2026-03-04 | Legal | 3-tier legal terms system (VIIIXV LLC d/b/a 815 Enterprises) | Proper legal structure for multi-vertical platform | Yes | 49 |
| 2026-02-22 | UX | Location persists via httpOnly cookie (30-day TTL) | User shouldn't re-enter zip every page visit | Yes | 44 |
| 2026-02-22 | UX | Browse page: 50 items/page with pagination | Performance + usability balance | Yes | 44 |
| 2026-02-28 | Infrastructure | Resend email: `updates@mail.[domain]` (not noreply@) | Better deliverability, clearer branding | Yes | 47 |
| 2026-02-28 | Infrastructure | Per-vertical email FROM domains | FM → farmersmarketing.app, FT → foodtruckn.app | Yes | 47 |
