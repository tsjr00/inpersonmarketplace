# Current Task: Session 63 (continued after compaction)
Started: 2026-03-22, still active as of 2026-03-26

## What's Happening RIGHT NOW

Working on vendor onboarding improvements:

### Completed This Continuation:
- **Vercel Pro upgrade** — upgraded, added `maxDuration` to 12 API routes (60s cron, 30s Stripe routes, 15s verify)
- **Present-before-changing rule** — new absolute rule added to CLAUDE.md, global rules, rule file, memory
- **Vendor reject route RLS fix** — payment query used vendor's client (RLS blocked), refunds silently failed. Fixed to use serviceClient.
- **Prohibited items moved to signup** — vertical-specific lists (FT vs FM), starred items for conditional/regulatory, acknowledgment checkbox on signup form, DB flag set at signup
- **Payment options note on checkout** — shows available methods below Pay Now button
- **Vendor outreach emails** — FT and FM templates with Session 63 feature updates
- **Fireworks vertical master plan** — research from prior FastWrks project documented
- **Flash sales + VIP system plan** — cross-vertical feature plan documented
- **Legal docs updated** — marketplace facilitator compliance, retention language, external payments removed from legal text
- **Migration 099 applied** — sales tax help article rewrite (all 3 DBs)
- **Migrations 094-099 moved to applied/** — migration log updated

### In Progress: Vendor Tutorial Rewrite
Two tutorials replacing the current single one:

**Tutorial 1: "Getting Approved" (post-preliminary approval, pre-gates)**
Content revised through user feedback. 6 slides:
1. Welcome — preliminary approval, steps ahead
2. Verify Your Business — legal business docs (DBA, LLC, sales tax permit)
3. Registrations & Certifications — category-matched doc requirements
4. Certificate of Insurance — soft gate, encouraged not required
5. Connect Your Bank Account — Stripe funnels all payment methods to one bank
6. What Happens Next — wrap up, review steps

Key changes from original:
- Prohibited items moved OUT of tutorial (now at signup)
- Differentiates "preliminary approval" from "full approval"
- Slide 2 is about business verification docs, not category docs
- COI is soft gate (not mandatory to start selling, required for events)
- Catering reference removed (FT-only, not appropriate for tutorial)

**Tutorial 2: "Your Dashboard" (post-gates, fully onboarded)**
Not yet revised with user feedback. Original draft:
1. You're Ready to Sell
2. Create Your Listings
3. Set Your Markets & Schedule
4. Make Your Profile Stand Out
5. How Orders Work
6. Track & Grow

### In Progress: Unified Documents & Certifications Plan
Plan written and saved at `.claude/unified_documents_plan.md`. Key concept:
- Merge onboarding gate docs (category_verifications) with profile certifications into one UI
- One upload serves both compliance gates AND profile badges
- Example: Cottage Food Registration → unlocks Baked Goods category AND shows 🏠 badge
- Option C architecture: no new tables, extend existing, unified component
- 6-8 hours, 1.5-2 sessions estimated
- NOT started yet

## Key Decisions Made This Continuation
- Vercel Pro for 60s function timeouts ($20/month)
- Present-before-changing rule (absolute — no edits without explicit permission)
- Prohibited items are vertical-specific (FT has 6, FM has 10)
- Starred (*) items for conditional/regulatory prohibitions
- Raw milk is FM only, not FT
- Pre-packaged food (FT) allowed in combos, not standalone
- Documents serve dual purpose: compliance + marketing badges

## Files Changed This Continuation
- 12 API routes: added maxDuration
- `category-requirements.ts`: vertical-specific prohibited items
- `vendor-signup/page.tsx`: prohibited items acknowledgment checkbox
- `api/submit/route.ts`: set prohibited_items_acknowledged_at at signup
- `vendor/prohibited-items/page.tsx`: vertical-aware with starred items
- `vendor/orders/[id]/reject/route.ts`: RLS fix for payment query
- `checkout/page.tsx`: payment options note
- Legal docs: retention language, external payment removal
- New rule file: `rules/present-before-changing.md`
- New plan files: `fireworks_vertical_plan.md`, `flash_sales_vip_plan.md`, `unified_documents_plan.md`

## Next Steps
1. Finalize Tutorial 1 content and get user approval on Tutorial 2
2. Build both tutorials (new component structure with two tutorial phases)
3. Build unified documents/certifications section (plan ready)
4. Stripe Tax implementation (blocked on TX Comptroller registration)
5. Catering pre-order system (min 10 items, tiered advance notice)
