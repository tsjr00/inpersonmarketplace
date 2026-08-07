# Dashboard Standardization & Redesign — Plan

**Status:** ✅ **RESEARCH COMPLETE — ready to implement** (2026-08-05). Build order is the 5 slices below; start at Slice 1.
**Governing constraint:** **MOBILE-FIRST.** Most users are on a phone. Design the phone case first; desktop is the roomier variant.
**Owner intent:** *"The UI of the dashboards is where we get to make the first impression for users who do more than browse. It needs to be clean, easy to understand, easy to navigate, and look something like dashboards people have navigated before."*
**Working agreement:** this file is **additive** — it grows until the plan is comprehensive, then gets implemented across one or more dedicated sessions. Do NOT start building from a partial version.

---

## Scope (owner, 2026-08-05)

1. **Cards and menus standardized throughout the dashboards.**
2. **Card contents redesigned as needed** — not just re-skinned.
3. Familiar patterns. Users should recognize the shape from dashboards they've used before.
4. Delivered as a plan first; implementation is a separate session (or several).

---

## 🔑 The central finding — this is an EXTENSION, not an invention

**A standardized card system already exists and is in production.** Session 92's design pass built it for the market-manager dashboard:

| Component | What it already gives us |
|---|---|
| `components/market-manager/ManagerCard.tsx` | The card wrapper: fixed padding (`spacing.sm`), fixed inter-card gap, header at `lg`/semibold, description at `sm`/muted, optional `headerAccessory`, and `id` + `scrollMarginTop` so anchors land below the sticky nav |
| `MANAGER_NAV_OFFSET` (exported from same file) | Single source for sticky-nav height so jump targets never hide under the bar |
| `ManagerJumpNav.tsx` | Sticky section chips. **Plain `<a href="#id">` on purpose** — native scroll, works without JS, re-scrolls on repeat clicks |
| `CollapsibleSection.tsx` | Expand/collapse section container |
| `TabbedCard.tsx` | Tabs within a card |
| `GroupHeading` (in the dashboard bodies) | Groups several cards under one banner |

`ManagerCard`'s doc comment already states the **typography discipline** the rest of the app should adopt:

> 4 sizes page-wide — title `xl`, headers `lg`, body `sm`, meta `xs`. Metric values `lg` bold. Cards should NOT reintroduce `2xl`/`xl` body text (that was the wrapping problem).

**Implication for the plan:** the design system question is largely settled. The work is (a) promoting these components out of `market-manager/` into a shared home, (b) applying them to the shopper and vendor dashboards, and (c) redesigning card *contents* where they don't fit the standard. That is a much smaller and much safer piece of work than "design a dashboard system."

**Do not redesign the manager dashboard's chrome.** It is the reference. Changing it would mean re-doing verified work and would leave nothing to standardize *toward*.

---

## Surfaces inventory (first pass)

| Surface | Route | Lines | Standardized? |
|---|---|---|---|
| **Shopper / default** | `/[vertical]/dashboard` | **1446** | ❌ monolith, inline styles |
| **Vendor** | `/[vertical]/vendor/dashboard` | **1379** | ❌ monolith, inline styles |
| **Market manager** (FM + FT park) | `/[vertical]/market-manager/[marketId]/dashboard` | 232 (+ body components) | ✅ **reference implementation** |
| **Vertical admin** | `/[vertical]/admin` | 738 | ⬜ not yet assessed |
| **Platform admin** | `/admin` | 485 | ⬜ not yet assessed |
| Root redirect | `/dashboard` | 12 | n/a |

The two biggest files are the two unstandardized ones, and they are the two a non-browsing user meets first. That is the whole problem in one line.

Shared primitives that already exist and should be reused rather than re-created:
`shared/StatusBadge.tsx` · `shared/TierBadge.tsx` · `shared/Skeleton.tsx` · `shared/Spinner.tsx` · `shared/AdminTable.tsx` · `shared/StandardForm.tsx` · `shared/MobileNav.tsx` · `lib/design-tokens.ts`

---

## The navigation problem (owner, 2026-08-04)

The shopper dashboard has absorbed roles that are not shopping. "My Markets" sits under a 🛒 **Shopper** badge. Market managers and event managers are already there; regional/partner roles are coming.

**Agreed direction:**
- Top-level Dashboard splits into **Shopper**, **Partner**, **Vendor**.
- **"Partner"** is the umbrella for market managers, event managers, and the future regional role — so a new role type does not require a new top-level section each time.
- Shopper stays on top (universal). Partner next. Vendor last.
- The cards inside each section are broadly right; they need standardizing more than replacing.

**One open disagreement to settle before building** — owner proposed accordion with **one section open at a time**; Claude pushed back:
> That penalizes exactly the people who matter most — someone who is both a vendor and a market manager toggles constantly. Alternative: render only the sections a user actually has, default-open their primary one, and don't force an accordion on single-role users at all.

**Not yet decided.** Resolve before layout work starts.

---

## Surface deep-dive: Shopper / default dashboard

`src/app/[vertical]/dashboard/page.tsx` — **1446 lines, one file.**

### 🔑 Second key finding — the target sections ALREADY EXIST here

The page is not an undifferentiated blob. It already renders three `h2` sections in order:

| Line | Heading | Notes |
|---|---|---|
| 404 | 🛒 **Shopper** (`t('dash.shopper')`) | localized, `xl`/semibold, primary colour |
| 839 | **My Events** | hardcoded English (not localized — inconsistency to fix) |
| 1075 / 1182 | **Vendor** (two variants) | signup pitch if not a vendor, dashboard link if they are. Comments literally read *"Separator between Shopper and Vendor sections"* |

So the reorg is **less about inventing structure and more about promoting what's already implied**: rename/regroup the middle band as **Partner** (absorbing My Events + My Markets), and give all three consistent chrome.

### Cards on this page

**Under 🛒 Shopper:**
`RateOrderCard` · Browse Products *(inline)* · My Orders *(inline, with status summary)* · My Favorites *(inline)* · Where Are Trucks Today / What Markets Are Open *(inline)* · **`MarketManagerCard` "My Markets"** ⚠ · `NotificationsCard` · `FeedbackCard` · Upgrade to Premium *(inline, conditional on free tier + vertical premium)*

⚠ **`MarketManagerCard` is the scope creep the owner flagged** — a manager surface sitting under a 🛒 Shopper badge. It already self-hides unless the user manages a market, so moving it to Partner is a relocation, not new conditional logic.

**Under My Events** *(event organizer surfaces — also not shopping)*:
`EventAgreementPickerCard` · `EventBroadcastCard` · `EventRatingsCard`, rendered per event token.

**Under Vendor:** signup pitch card, or the vendor dashboard link card.

### Observations that shape the plan

- **Roughly half the cards are inline JSX with hand-rolled `<h3>` + inline styles**; the other half are extracted components. Standardizing means extracting the inline ones — which is also what makes the file shrink to something readable.
- **Cross-imports from the vendor dashboard** (`vendor/dashboard/ReferralCard`, `VendorFeedbackCard`) — a shared card home would fix a real coupling smell, not just a cosmetic one.
- **Mixed localization**: the Shopper heading is localized, "My Events" is hardcoded. Any new heading must be localized from the start.
- Card headers here are `<h3>` at `lg`/semibold — **already matching `ManagerCard`'s header size**. The typography gap is smaller than the structural gap.

---

## Surface deep-dive: Vendor dashboard

`src/app/[vertical]/vendor/dashboard/page.tsx` — **1379 lines, one file.**

Cards in render order:

| # | Card | Notes |
|---|---|---|
| 1 | **Pickup Mode** | ⚠ operational |
| 2 | **Upcoming Pickups** | ⚠ operational |
| 3 | **Manage Locations** | ⚠ operational |
| 4 | Analytics & Insights | |
| 5 | Orders | |
| 6 | Your Listings | |
| 7 | My Booth Bookings | FM |
| 8 | My Park Bookings | FT |
| 9 | Business Profile | |
| 10 | Reviews | |
| 11 | Legal Agreements | |
| — | `PaymentMethodsCard`, `PromoteCard` | already extracted components |

### 🚨 Constraint — the top three are a deliberate owner decision

**Pickup Mode, Upcoming Pickups, and Manage Locations are at the top on purpose** — the owner's standing preference is *operational items first* on the vendor dashboard. A redesign must preserve operational-first ordering. Do not re-sort this page alphabetically, by card size, or by "visual balance."

Same structural problem as the shopper page: most cards are inline JSX with hand-rolled `<h3>` + inline styles rather than a shared wrapper.

---

## Role detection — already solved, just needs consuming

`dashboard/page.tsx:52-75` loads every signal the reorg needs, in **one parallel `Promise.all`**:

- `vendorProfile` → `isVendor` (`:141`), `isApprovedVendor` (`:142`)
- `userProfile.role` / `.roles` → admin tiers
- `managedMarkets` → drives `MarketManagerCard`
- `organizerEvents` → `hasOrganizerEvents` (`:239`)

**Implication:** "which sections does this user see" is answerable from data already in hand. No new queries, no new role model, no migration.

⚠ **Preserve the parallel-query shape.** It is deliberate (commented *"Phase 2: Parallel data queries — none depend on each other"*) and `performance-baseline.test.ts` enforces query count and sequential depth. A refactor that turns this into per-section fetches would fail that test — correctly.

---

## ⬜ Research still outstanding

- [x] ~~Shopper dashboard card inventory~~ — done, above
- [x] ~~Vendor dashboard card inventory~~ — done, above
- [x] ~~Role detection~~ — done, above
- [ ] **Vendor dashboard card inventory** — same
- [ ] **Vertical admin + platform admin** — do they follow `AdminNav`/`AdminSidebar` conventions? Are they in scope or a separate system?
- [ ] **Role detection** — how does the app currently know a user is a manager/vendor/organizer? This drives what renders.
- [ ] **Card anatomy spec** — formalize from `ManagerCard` into a written standard (header, description, accessory, metric, actions, empty state, loading state)
- [ ] **Empty + loading states** — currently ad hoc; a standardized dashboard needs standardized nothing-here-yet
- [ ] **Mobile** — owner tests on iPhone Safari; the manager dashboard's sticky nav behaviour on small screens needs checking
- [ ] **Familiar-shape reference** — decide which conventional dashboard pattern we are matching (sidebar + content? top nav + card grid?) so "looks like dashboards people have used" is a decision, not a vibe

## ⬜ Deliverables this plan must still produce

- [ ] Target information architecture per role combination (shopper only / vendor only / manager only / multi-role)
- [ ] Card anatomy spec with rules for when to use each variant
- [ ] Component promotion list — what moves out of `market-manager/` into shared, and what it gets renamed to
- [ ] Per-surface change list — what happens to each existing card
- [ ] Build order, sliced so each slice ships independently
- [ ] Regression risk list — these are the highest-traffic authenticated pages in the app

---

## Sequencing principle (agreed 2026-08-04)

**Standardize the card anatomy FIRST, reorganize navigation SECOND.**

Consistent chrome is what makes three sections read as one system rather than three things bolted together, it is independently valuable even if the reorg slips, and it makes the reorg mostly a matter of moving already-uniform blocks. Doing the reorg first means moving inconsistent cards around and standardizing them twice.

---

## Card anatomy spec (derived from `ManagerCard`, ready to adopt)

`ManagerCard` is 48 lines and already encodes the whole standard. Formalized:

```
<section id? scrollMarginTop=NAV_OFFSET>          ← anchor target for jump-nav
  ├─ header row (only if title or accessory)      ← flex, baseline, space-between, wraps
  │    ├─ title      h2 · lg · semibold · textPrimary · margin 0
  │    └─ accessory  optional right-aligned node (badge, count, action)
  ├─ description?    p · sm · textMuted · lineHeight 1.5
  └─ children        the card's actual content
```

**Fixed chrome (do not vary per card):** `padding: spacing.sm` · `backgroundColor: colors.surfaceElevated` · `border: 1px solid colors.border` · `borderRadius: radius.md` · `marginBottom: spacing.sm`.

**Type scale — four sizes, page-wide:** page title `xl` · card headers `lg` · body `sm` · meta `xs`. Metric values `lg` bold. **`2xl` and `xl` are banned inside cards** (the wrapping problem).

**Spacing rule already baked in:** header bottom margin is `2xs` when a description follows, `xs` when it doesn't — so the header/description/body rhythm is consistent without per-card tuning.

**Gaps this spec does not yet cover** (decide during Slice 2, then write back here):
- **Card actions** — no defined footer/action-row slot. Today buttons live loose in `children`.
- **Metric display** — "lg bold" is stated but there is no metric sub-component, so every card hand-rolls its number + label.
- **Empty state** — see below.
- **Card variants** — is there a "quiet"/secondary card, or only one? Manager surfaces use `CollapsibleSection` and `TabbedCard` as siblings rather than variants.

---

## Empty states, loading, and mobile

### Empty states — consistent in tone, unstandardized in code
Phrasing across manager surfaces is already uniform: *"No announcements sent yet." · "No documents uploaded yet." · "No event invitations yet." · "No seasons yet." · "No surveys yet." · "No occupants yet"* — the pattern is **"No {things} yet."**, occasionally missing the period.

There is **no shared empty-state component**; each is a hand-rolled `<p>`. Cheap win during Slice 2: an `EmptyState` slot on the card that enforces the phrasing pattern and the muted styling.

### Loading — already correct, leave it alone
Neither big dashboard uses `Skeleton`/`Spinner` inline (0 references each), because both are **server components with route-level `loading.tsx`** — `[vertical]/dashboard/loading.tsx` and `[vertical]/vendor/dashboard/loading.tsx` both exist. That is the right Next.js pattern.
⚠ Do not "add loading states to cards." Converting server-rendered cards to client components with spinners would regress the performance baseline. `shared/Skeleton.tsx` is for client-side surfaces only.

### Mobile — the vendor dashboard is the best of the three, and one real defect
**Vendor dashboard uses a raw `<style>` block with mobile-first media queries** and semantic row classes (`.row-1-grid`, `.row-2-grid`, `.promote-grow-grid`): 1 column by default → 2 at `640px` → 3 at `1024px`. This is genuinely good responsive behaviour and is **more evidence the owner is right that this surface is closest to the vision**.

✅ **RESOLVED 2026-08-05 — and the first read was wrong.** The shopper grid was NOT broken on mobile: a `@media (max-width: 540px)` rule collapsed it to one column. But it needed **`!important`** to do so, because an inline `gridTemplateColumns` outranks a stylesheet rule.

The real problem was that the two dashboards used **opposite philosophies**:

| | Shopper (before) | Vendor |
|---|---|---|
| Approach | desktop-first — start 2-col, collapse | mobile-first — start 1-col, expand |
| Breakpoints | `max-width: 540px` | `min-width: 640px` / `1024px` |
| Widest | 2 columns | 3 columns |
| Needed `!important` | yes | no |

**Fixed:** columns moved out of the inline style into the `.shopper-grid` rule, mobile-first at the vendor's breakpoints — `1fr` → 2 at `640px` → 3 at `1024px`. The `!important` is gone (nothing to override), both dashboards now reflow identically, and the shopper grid gains a 3-column desktop layout it never had.

**Lesson for the rest of this work:** never set `gridTemplateColumns` inline on anything that must respond. Inline styles cannot express media queries and will silently beat any rule that tries.

Elsewhere both use `repeat(auto-fit, minmax(250px, 1fr))`, which is self-responsive and fine.

---

## ⚠️ Three styling systems coexist — pick one before Slice 1

| Approach | Scale | Where |
|---|---|---|
| **Inline `style={{}}` + `lib/design-tokens`** | **373 files** | the de-facto standard |
| Tailwind `className=` | 75 files | minority |
| Raw `<style>` block + semantic classes | vendor dashboard | the only place media queries live |

**Recommendation: inline styles + design tokens remains the standard** (5:1 dominance, and every shared component already follows it), **with the `<style>`-block escape hatch retained specifically for media queries** — inline styles cannot express them, which is exactly why the vendor dashboard reached for one.

**`shared/MobileNav.tsx` is dead code.** Its only reference anywhere is `app/test-components/page.tsx`. It is also Tailwind-based, unlike the rest. If Slice 4 wants a mobile nav, decide deliberately whether to revive and convert it or delete it — do not assume it is wired up, because it is not.

---

## What "familiar" means concretely

The owner asked for *"the most popular and highly functional dashboards commonly seen across many web apps."* Those converge on a small set of conventions worth matching deliberately:

1. **Persistent primary navigation** — a left rail (desktop) collapsing to a drawer or bottom bar (mobile). The user always knows where they are and what else exists.
2. **One scannable landing surface per role**, not a wall of everything.
3. **Cards as uniform containers** — identical chrome, varying content. Difference carries meaning; here it is currently just drift.
4. **Action-oriented top zone** — what needs attention now, above reference material. The vendor dashboard's operational-first ordering already does this, and `ManagerActionSummary` is the same idea on the manager side.
5. **Consistent empty states** rather than blank space.
6. **Predictable density** — one type scale, one spacing rhythm.

The plan already satisfies 3, 4 and 6 once the card system is adopted. **1 is the genuinely open design decision** (see Slice 4), and it interacts with the render-what-you-have choice: with a left rail, Shopper/Partner/Vendor become nav destinations rather than stacked page sections — which is arguably more familiar, and worth weighing against the simpler stacked approach before Slice 3 locks the layout.

---

## Emerging shape of the plan (draft — not yet the final build order)

Based on what the research has established so far, the work looks like four slices, each independently shippable:

> ✅ **SLICE 1 BUILT 2026-08-07** (uncommitted). See the "Slice 1 — built" section below the change log for what actually shipped and the two findings from the build.

**Slice 1 — promote the card system.** Move `ManagerCard`, `CollapsibleSection`, `TabbedCard`, `GroupHeading`, `MANAGER_NAV_OFFSET` out of `components/market-manager/` into a shared home under neutral names. Pure move + re-export; the manager dashboard keeps working untouched. Nothing visual changes. This is the safest possible first commit and everything else depends on it.

**Slice 2 — write the card anatomy spec, then apply it to the vendor dashboard.** Vendor first, not shopper: it has fewer conditional branches and no role-mixing problem, so it is the cleaner place to prove the pattern. Extract each inline `<h3>` block into the shared card. Preserve operational-first ordering.

**Slice 3 — apply to the shopper dashboard and introduce Partner.** Regroup: 🛒 Shopper keeps buyer cards; new **Partner** section absorbs My Markets + My Events; Vendor stays last. All three headings localized. Section visibility driven by the role signals already loaded.

**Slice 4 — navigation.** Revive `MobileNav` as the phone bottom bar (converted off Tailwind), build the desktop/tablet left rail as its wider sibling, and wire both to the role signals. Nav renders only for multi-role users. **Build and test the phone case first.**

**Slice 5 — polish.** Standardized empty states, the card actions slot, and a device pass on the surfaces the mobile-first decision put at risk (starting with the shopper `:589` grid).

Admin surfaces (`/[vertical]/admin`, `/admin`) are **probably a separate system** — they already have `AdminNav` and `AdminSidebar` conventions and serve a different audience. Assess in research before deciding whether they join this effort or get their own pass.

---

## ✅ Owner decisions — 2026-08-05 (all four settled)

1. **Reference shape:** *"the most popular and highly functional dashboards commonly seen across many web apps"* — not merely this app's own precedent, though it can build on it. **Above all: easy to understand and navigate.**
   **The vendor dashboard is closest to the owner's vision** — but *"its styles and sizes have wavered and varied as the app has grown, so it has become unclear and it would be confusing for a new user."*
   → **Target = the vendor dashboard's information architecture, with the style drift fixed.** Its structure is right; its visual discipline rotted.
2. **Section visibility:** **render only what the user has.** No forced accordion. (Owner adopted the alternative.)
3. **Admin surfaces:** **OUT of scope for now** — `/[vertical]/admin` and `/admin` get their own later effort.
4. **Depth:** **appearance first, contents revisited afterwards.** Standardize chrome now; card-content redesign is a later, separately-scoped pass.

---

## 🔬 The style drift, measured (2026-08-05)

The owner's "styles and sizes have wavered" is precisely correct, and the numbers name it.

**Card headers — the same UI element, two different sizes depending on which dashboard you're on:**

| Surface | Card header size |
|---|---|
| Vendor dashboard (all 11 inline cards) | `typography.sizes.base` |
| Shopper dashboard (inline cards at `:605, :632, :688, :709`) | `typography.sizes.lg` |
| `ManagerCard` (the standard) | `typography.sizes.lg` |

The vendor dashboard — the one the owner considers closest to the vision — is the **odd one out**, and it is the surface a new vendor meets first.

**Type scale in use on the vendor dashboard:** `xs` ×19 · `sm` ×23 · `base` ×13 · **`2xl` ×8**

That `2xl` is the smoking gun. `ManagerCard`'s own doc comment warns:

> Cards should NOT reintroduce `2xl`/`xl` body text (**that was the wrapping problem**).

**Session 92 already diagnosed and fixed this exact failure on the manager dashboard.** The vendor dashboard still has it. So the remedy is not a new opinion — it is applying a known, verified fix to the surface that never received it.

**Container geometry is closer to fine** — `padding: spacing.sm` ×13 and `borderRadius: radius.md` ×13 dominate, with a scattering of one-off `2xs`/`3xs`/`md` paddings. Adopting the shared card wrapper absorbs these without a redesign argument.

**Conclusion for the plan:** the vendor dashboard needs *typographic discipline*, not restructuring. That is a mechanical, low-risk change with an existing reference implementation — and it is Slice 2, which the owner has effectively pre-approved by naming appearance first.

---

## ✅ Navigation decision — 2026-08-05

> *"Left nav rail for desktop & tablet. For mobile phones make it easy to navigate and reuse what you can, but not at the expense of confusion for users. **MOST of our users will be on their phone — that is the most important audience.**"*

### 🚨 This inverts the design priority. Mobile is the PRIMARY case, not the fallback.

Design the phone experience first and let desktop be the roomier variant. Do **not** design a rail and then figure out how to shrink it — that is how the phone experience ends up as a compromise, and the phone is where most users live.

**Desktop / tablet:** persistent left nav rail. Shopper / Partner / Vendor become destinations rather than bands you scroll past.

**Phone:** a **bottom tab bar** — thumb-reachable, always visible, and the pattern essentially every consumer app uses (so it needs no explanation). A hamburger drawer was considered and rejected: it hides the fact that other sections exist, which is the exact confusion the owner warned against.

### 🎁 `shared/MobileNav.tsx` is already exactly this — revive it, don't delete it

Open question 2 resolves itself. That "dead" component is a **fixed bottom bar, `md:hidden`, with `pb-safe` / `env(safe-area-inset-bottom)` handling for iPhone home-indicator clearance** — i.e. someone already built the right pattern and it was never wired up. Work needed: convert it from Tailwind to inline styles + design tokens (per the styling decision above), and feed it the role-derived destinations.

### Nav appears ONLY when there is somewhere to go

This follows directly from render-what-you-have, and it matters most on a phone where screen space is scarce:

| User has | Phone | Desktop / tablet |
|---|---|---|
| One role | **No nav at all** — just their dashboard | No rail |
| Two or more roles | Bottom tab bar | Left rail |

A bottom bar with a single tab is noise. Most users have one role and should see no chrome whatsoever.

### Consequences to carry into the build

- ~~The `:589` grid~~ — **already fixed 2026-08-05** (owner: *"ditch the 2 column grid and make it what it needs to be so all dashboards behave the same way"*). Both dashboards are now mobile-first at 640/1024. See the Mobile section for the correction.
- **The `2xl` type problem is worse on phones**, not better — oversized headings wrap hardest on narrow screens. Slice 2 gets more valuable under a mobile-first lens.
- **Bottom bar and safe areas:** any fixed bottom nav must reserve space so the last card is not trapped behind it, and must respect `env(safe-area-inset-bottom)`. `MobileNav` already does the second part.
- **The vendor dashboard's mobile-first `<style>` block (1 → 2 → 3 columns) is the pattern to copy**, not replace. It is already mobile-first, which is now the house rule.

---

## ✅ Build decisions — 2026-08-07 (Slices 1 & 2 authorized to plan)

**Session scope: Slices 1 and 2 only.** Slice 3 (shopper + Partner) is a later session.

**A. Naming + home.** The promoted wrapper is **`DashboardCard`**, living in a new **`components/dashboard/`** folder alongside the other dashboard layout primitives. Deliberately NOT `Card` (too generic for a 375-file codebase) and NOT left as `ManagerCard` (collides with `MarketManagerCard`, the unrelated "My Markets" box at `dashboard/page.tsx:27`).

**B. No forwarding shim.** All import sites are rewritten in the same commit; the old `market-manager/` paths are removed, not stubbed. Verified 2026-08-07: **24 `ManagerCard`/`MANAGER_NAV_OFFSET` importers**, plus 2 each for `CollapsibleSection` and `TabbedCard` — every one of them inside `components/market-manager/`, nothing external. `tsc --noEmit` in pre-commit catches any missed pointer, so a half-migration cannot reach staging.

**C. Styling mechanism — unchanged, and now constrained by owner UX requirements.**
Inline styles + `lib/design-tokens` remain the standard; raw `<style>` blocks remain the sanctioned tool **specifically for phone-vs-desktop breakpoints** (inline styles cannot express media queries). **No Tailwind in new dashboard code** — `MobileNav` gets converted off it in Slice 4.

> **Correction to this file (verified 2026-08-07):** the styling table above claims `<style>` blocks live only on the vendor dashboard. **False.** 34 files use them, including `[vertical]/dashboard/page.tsx`, `browse/page.tsx`, `checkout/page.tsx`, `layout/Header.tsx`, `admin/AdminSidebar.tsx`, `shared/Toast.tsx`, `shared/Skeleton.tsx`. The escape hatch is an established app-wide pattern, not a vendor-dashboard oddity.

**Owner requirements (2026-08-07):** *"I want a UI that is both smooth and loads fast + feels natural for mobile, while also allowing users to quickly access lots of options / information and that doesn't make users click multi-layers deep to access functionality (admin will do this if needed - but the user UI needs to be clean and intuitive)."*

These translate into three **binding build constraints**:

1. **`DashboardCard` stays a server component.** Verified: `ManagerCard.tsx` has no `'use client'` (imports only `ReactNode` type + design tokens, `:1-2`), and both `[vertical]/dashboard/page.tsx` and `[vertical]/vendor/dashboard/page.tsx` are server components. The card system therefore ships **zero client JS**. Adding interactivity to the *wrapper* would flip every card on both dashboards to client-rendered — so interactivity lives in individual cards, never in `DashboardCard`.

2. **Nothing collapses without a summary on its header.** `CollapsibleSection` and `TabbedCard` are both client components (verified) and are the app's content-hiding mechanisms. Collapsing is unavoidable on a phone (the vendor dashboard is 1,379 lines) but every collapse is one click of depth — the exact thing the owner ruled out. **Rule:** a collapsed section's header must carry a count, status, or next action so its contents are legible while closed. `"Orders"` is not acceptable; `"Orders — 3 need packing"` is. `ManagerCard`'s existing `headerAccessory` prop (`:24`) is the slot for this and becomes standard rather than optional.

3. **Route-level `loading.tsx` stays; no per-card spinners.** Both dashboards are server-rendered with `loading.tsx` at the route. Converting cards to client components with inline `Skeleton`/`Spinner` would regress `performance-baseline.test.ts` and make the page slower — the opposite of the requirement.

**Deployment posture:** dashboard work commits to `main` and merges to `staging` alongside the untested feature train (owner: *"Keep commit together"*) — a demo-able staging URL is needed for a presentation the week of 2026-08-10. Slice 1 is visually invisible. Before Slice 2 lands, testers should be told the vendor dashboard is being restyled: report broken function, ignore changed appearance.

---

## Remaining open questions

1. **Card actions slot** — define a footer/action row in the card spec, or keep buttons loose in `children`? Decide during Slice 2.
2. **Rail contents beyond the three sections** — does the desktop rail also carry secondary links (settings, notifications, help), or only Shopper/Partner/Vendor? Affects whether the bottom bar needs an overflow affordance.

---

## Status of research

| Area | State |
|---|---|
| Surfaces inventory | ✅ complete (admin deliberately out of scope) |
| Shopper cards | ✅ complete |
| Vendor cards | ✅ complete |
| Role detection | ✅ complete — already available, no new work |
| Card anatomy spec | ✅ derived; 4 gaps listed to close during Slice 2 |
| Empty / loading states | ✅ complete |
| Mobile behaviour | ✅ complete — 1 suspected defect to verify on device |
| Styling systems | ✅ complete — recommendation made |
| Familiar-dashboard conventions | ✅ complete |
| Navigation pattern | ✅ decided 2026-08-05 — rail on desktop/tablet, bottom bar on phone, **mobile-first** |
| **Final build order** | ✅ **5 slices, unblocked** |

**RESEARCH COMPLETE. This plan is ready to implement.** No decision blocks the start. The two remaining open questions are Slice-2 and Slice-4 details to settle in flight, not prerequisites.

Recommended entry point for the implementing session: **Slice 1** — promote `ManagerCard` + siblings into a shared home. Pure move plus re-exports, no visual change, nothing else can proceed without it, and it is the safest possible first commit on the app's highest-traffic authenticated pages.

---

## 📐 Tile vs Card — standing taxonomy (owner-agreed 2026-08-07)

**Canonical copy lives in `docs/Codebase_Map/22_Components_UI.md`** (that is where a new engineer is sent). Summary here so the plan is self-contained:

Two levels — **groups** organize (`GroupHeading`, `CollapsibleSection`, and `TabbedCard`, which is misnamed), **units** hold (**tiles**, **cards**). Nothing nests deeper.

- **Tile = a door.** Whole surface clickable, you leave the page. Grid, equal height. Icon + short label + usually one line. **Must show its status without being clicked.**
- **Card = a room.** Content lives here. Full width, stacked. **The card itself is never clickable** — buttons go inside.
- **Collapsible** and **tabbed** are *behaviours on cards*, not separate unit types.

**The face rule:** *the face answers "does this need me?", the inside answers "what do I do about it?"* Status/counts/warnings visible; controls and detail behind the lid. **If the face line can't be written in ~8 words, the card is doing too much — split it.**

**Ambiguity test:** does clicking the whole thing take me elsewhere? Yes → tile. No → card (plain / collapsible / tabbed).

**Never:** tile inside a card · card clickable as a whole · collapse with unreadable state · form or list inside a tile.

**Origin — the owner's example, verified 2026-08-07:** `[vertical]/vendor/markets/page.tsx` is 614 lines + `EventMarketsSection` 274 + `MarketSuggestionSection` 529 + `PrivatePickupSection` 559 ≈ **2,000 lines**, with raw numeric font sizes (`28`/`20`/`16`/`15`) bypassing design tokens entirely. Owner: *"a ton of functionality got crammed into a space and over time the space & visual organization became confusing so it's now a weakness instead of highlighting great functionality… but all (or almost all) the functionality is related and makes sense to be together."* Correct on both halves — the grouping is right, the prioritization never happened. **Fixing that page is Slice 3+ scope, deliberately NOT folded into Slice 2.** Owner noted the pick list is a candidate to move out.

---

## 🎨 Feedback pass + Slice 3a PART 1 — BUILT 2026-08-07 (UNCOMMITTED)

Owner feedback after seeing Slice 2 on staging, all four items addressed:

**1. Voice — "My" everywhere.** Was mixed: *Your* Listings/Events/Dashboard/Business vs *My* Orders/Favorites/Markets/Booth Bookings/Park Bookings. Now: My Listings · My Orders · My Upcoming Pickups · My Reviews · My Market Boxes · My Vendor Events.
⚠ **Name-collision rule (owner):** when "Your X" would collide with an existing "My X" meaning something else, **add a clarifying word.** Vendor invitations became **"My Vendor Events"** because the shopper dashboard already has **"My Events"** for people *organizing* events — same words, opposite roles.

**2. Title colour — one colour, not per-state.** Slice 2 tied tile title colour to state. Owner: *"different colors as a reflection of state makes sense, but it does look arbitrary and unpolished — the user doesn't know."* Correct. Titles are now `colors.textPrimary` and icons `colors.primary`, always; **state reads through background + border only.** `locked` is the single exception (a disabled thing should look disabled).

**3. Icons — lucide, and every tile has one.** Was inconsistent (2 of 9 vendor tiles had no icon) and off-motif (a booth rendered as 🪑 an office chair). **`components/dashboard/icons.tsx` is the whole vocabulary in one reviewable file** — to change a glyph, edit the map; never pass a raw lucide component at a call site.
Chosen because **emoji cannot be made consistent**: Apple, Google and Microsoft each draw them differently, and the primary audience is phones across mixed platforms. `lucide-react` 0.562.0 was already a dependency (7 landing components use it). Vertical theming comes free through colour (`colors.primary` is a per-vertical CSS variable); icon *choice* is already vertical-specific where it matters (`booth` FM-only, `park` FT-only). Notable fixes: booth 🪑→`Store`, park 🅿️→`Truck`, events 🎪→`Tent`, marketBoxes 📦→`ShoppingBasket`.

**4. My Vendor Events moved back INTO the grid.** Owner: *"I don't like My Events as a screen width card, it doesn't fit in the mix and makes the dashboard feel weird… events should be in line with booth bookings."* Now a grid peer in row 2 beside booth/park bookings, trimmed per the face rule — invitations awaiting response and today's events stay listed; upcoming/backup/past collapse to one count line.
**It stays a CARD rather than becoming a tile only because there is nowhere for a tile to lead.** ⚠ **Verified: the vendor events LIST lives inside the LOCATIONS page** — `EventMarketsSection` (274 lines) renders at `vendor/markets/page.tsx:603`; `/[vertical]/vendor/events` has per-event routes only, no index. The owner spotted this. **Extracting events into their own index during the events rebuild would simultaneously de-cram the locations page** — two problems, one fix. Then this becomes a plain tile.

### ✅ Slice 3a PART 2 — 2026-08-07 (UNCOMMITTED). tsc 0 · 1811/1811 · lint unchanged at 1 pre-existing error.

**⭐ The shopper `.shopper-grid` is now 100% converted** — every child uses the shared system: 4 tiles (Browse · My Orders · My Favorites · Where Today) + `MarketManagerCard` + `DashboardNotifications` + `HelpSearchWidget` + `FeedbackCard`. No seam left in the most-seen part of the page.

**New `promo` state** in `states.ts` — the one entry that is a PURPOSE, not a data condition. Kept in the shared map anyway so promo blocks cannot go bespoke, which is exactly how they drifted. **Outlined accent on a plain background, no gradient fill** (owner). Both gradient promos converted: the buyer "Upgrade to Premium" and the vendor "Grow your business" (which also dropped `#fefce8`/`#fef3c7`/`#fcd34d`/`#92400e`/`#78350f`/`#d97706`).

**`pending` got its first real use** — the vendor "Pending Approval" notice. Textbook case: the vendor has done their part and is waiting on US, so it is blue, not orange.

**⚠ Taxonomy extension — a tile may open a MODAL, not just navigate.** `FeedbackCard` and `VendorFeedbackCard` are whole-surface-clickable buttons that open a form. Our own rule says a whole-clickable surface is a tile, never a card — and that rule is about the CLICK TARGET, not about whether the destination is a page or a layer. So `DashboardTile` now takes either `href` or `onClick`. ⚠ `onClick` may only be passed from a CLIENT parent, which pulls the tile into that parent's client bundle; `href` callers are unaffected and still ship zero JS.

**Two conversions needed care, and both are documented in-file:**
- `HelpSearchWidget` — its results dropdown is absolutely positioned, so `position: relative` + the click-outside ref stay on an INNER wrapper. Moving that context to the card would misplace the dropdown.
- `DashboardNotifications` — has TWO returns (loading + loaded); both converted. Header badge and "mark all read" moved into `headerAccessory`.

**Also converted:** `MarketManagerCard` (a card — one destination per market, so it cannot be one door).

### ⏳ Slice 3a — what is STILL outstanding (verified count, 2026-08-07)

- **3 inline blocks** on the shopper page: **Ready for Pickup** alert (`~:419`, above the grid) · the **event-organizer** block · **Passion→Profit**.
- ~~36 raw hex values~~ **✅ DONE — the shopper dashboard is now at ZERO raw hex, down from 51.** Greens→`success*`, blues→`info*`, reds→`danger*`, ambers→`warning*`, greys→`neutral*`.
  **⚠ Purple:** the palette has no purple, only the **indigo `selection*`** trio (`#4F46E5`/`#EEF2FF`/`#4338CA`), which is the closest available — owner: *"map the purples for admin to whichever is the closest purple in the tokens available."* Done, but **the token name lies**: `selectionBg`/`selectionText` now paint the admin / "in review" accent. Worth a properly named token **if the admin surfaces stay on the dashboard** — decided in 3b. Deliberately not minting `admin*` tokens now, since the band may move out and they would be deleted.
- **6 components still hand-rolling chrome:** `RateOrderCard` (423) · `EventAgreementPickerCard` (193) · `EventBroadcastCard` (188) · `EventRatingsCard` (138) · `PendingSurveysCard` · `ReferralCard`. All render OUTSIDE the main grid, so the visible seam is small.

### Slice 3a — PART 1 done

**Done (shopper dashboard):** the main `.shopper-grid` is fully converted — Browse · My Orders · My Favorites · Where Today. Plus Create Drafts and Admin Panel. **The main grid is internally consistent.** "Where Today" moved off an off-palette amber (`#fffbeb`/`#fbbf24`, which read as a caution about nothing) to `active` — it is about who is out RIGHT NOW.

**⏳ NOT done — Slice 3a Part 2:**
- **6 inline card blocks** elsewhere on the page: Ready for Pickup alert (`~:419`) · the two upgrade/promo cards · the event-organizer block · Passion→Profit · Pending Approval.
- **The Vendor Dashboard tile** (`~:1148`) — marked with a TODO comment in the file.
- **The 8 extracted components** (the "wide" half): `RateOrderCard` 423 · `DashboardNotifications` 321 · `EventAgreementPickerCard` 193 · `EventBroadcastCard` 188 · `EventRatingsCard` 138 · `MarketManagerCard` 91 · `FeedbackCard` 59 · `VendorFeedbackCard` 55.
- **43 raw hex values** still on the page (down from 51).

**✅ Both Part-2 judgment calls now DECIDED (owner, 2026-08-07):**
1. **Promo / upgrade cards — convert them.** Owner: *"its ok to change the look of upgrade / promo — it's more important to have them consistent — if we want to promote them then an outlined color or colors is better anyway."* → Drop the gradients (`linear-gradient(135deg, #fefce8, #fef3c7)` + `shadows.md`). Promote via a **coloured outline**, not a fill treatment. Build as a `DashboardCard` with a promo/accent border rather than a bespoke block. **Consistency beats bespoke marketing chrome.**
2. **The Admin band — defer to Slice 3b.** Owner: *"admin can wait for 3b."* Part 1 standardized its chrome only; placement (dashboard vs settings) is decided in the reorg.

---

## 🔭 Slice 3 — SPLIT IN TWO (owner, 2026-08-07)

Owner: *"lets keep partner reorg it's own thing, there is enough detail in that by itself."* So:

- **Slice 3a — standardize the shopper dashboard's cards and tiles. NO reorg.** Mirrors Slice 2 exactly.
- **Slice 3b — the Partner reorg.** Its own effort. This is where the destinations-vs-stacked-bands decision gets made (the plan flags it must be settled before layout locks). Note **Vendor already IS its own route** (`/[vertical]/vendor/dashboard`) and the admin consoles already exist, so "destinations" would mean Partner is the only genuinely new route.

**The split follows the owner's own sequencing principle (2026-08-04): standardize card anatomy FIRST, reorganize navigation SECOND** — reorganizing inconsistent cards means standardizing them twice.

### ⚠ The plan's section inventory was incomplete

This file lists three `<h2>` bands on the shopper dashboard. **There are four.** Verified 2026-08-07: `:404` 🛒 Shopper (localized) · `:842` My Events (**hardcoded English**) · `:1078`/`:1185` Vendor (two variants) · **`:1397` 🔧 Admin (localized) — never inventoried.**

**Owner decision on the Admin band (2026-08-07):** *"admin card can live in a dashboard or it can just live in settings (from hamburger) — if it keeps things cleaner it doesn't need to be in a dashboard."* → **Not a fourth top-level band.** Moving it to settings is acceptable and preferred if it simplifies the structure. **Decide in 3b**; 3a leaves it in place and only standardizes its chrome.

### Slice 3a — verified inventory (2026-08-07)

`[vertical]/dashboard/page.tsx` — **1,464 lines · 51 raw hex values · 13 inline headers.**

Classified: **7 tiles** (link-wrapped) — Browse Products `:608` · My Orders `:635` · My Favorites `:691` · Where Are Trucks/Markets Open `:712` · Vendor Dashboard `:1216` · Create Drafts `:1370` · Admin Panel `:1422`. **6 cards** — Ready for Pickup `:433` · Upgrade `:760` · event org block `:894` · Passion→Profit `:1104` · Grow Business `:1258` · Pending Approval `:1339`.

⚠ **No element on this page uses `height: '100%'`** — unlike the vendor dashboard, its grid items do not stretch. Converting tiles to `DashboardTile` (which sets `height: 100%` + `minHeight: 120`) WILL change their sizing. Expected and probably an improvement, but it is a real visual change, not a no-op.

⚠ **Some headers are already correct** — `:433` is already `lg` bold. Not all 13 are drifted.

### ⚠ Slice 3a scope question: the 8 extracted components

Nine render sites on this page use components that hand-roll their own card chrome: `RateOrderCard` (423 lines, client) · `DashboardNotifications` (321, client) · `EventAgreementPickerCard` (193) · `EventBroadcastCard` (188, client) · `EventRatingsCard` (138) · `MarketManagerCard` (91, **server**) · `FeedbackCard` (59, client) · `VendorFeedbackCard` (55, client, rendered twice).

**Slice 2 precedent was to leave extracted components alone** (`PaymentMethodsCard`, `PromoteCard` on the vendor dashboard were not converted). But that was 2 components; here it is 8 across 9 sites — enough that converting only the inline blocks would leave a visibly half-standardized page. **Owner decision needed: narrow (inline only, matches precedent) or wide (also convert the 8).**

---

## ✅ Slice 2 — BUILT 2026-08-07 (UNCOMMITTED)

Owner chose **option A** (semantic states mapped to the shared palette), approved `pending`, deferred `suspended`/`revoked`, and approved moving Your Events full-width. Built as presented.

**Gates:** `tsc --noEmit` **0** · full suite **1811/1811 (70 files)** · `npm run lint` **still exactly 1 error**, the same pre-existing `EventRequestForm.tsx:241` — Slice 2 introduced none.

**New:** `components/dashboard/DashboardTile.tsx` (+ `TileBadge`) · `components/dashboard/states.ts` (`DashboardState` + `DASHBOARD_STATES`) · `statusColors.attention*` in `lib/design-tokens.ts`.

**Shared vocabulary, not two systems:** the state palette lives in `states.ts` and is consumed by BOTH `DashboardTile` and `DashboardCard`. `DashboardCard` gained `state` (defaults `neutral` = existing chrome, so the manager dashboard is untouched) and `inGrid`.

**Converted on the vendor dashboard:** 9 tiles → `DashboardTile` · 4 cards → `DashboardCard` · headers `base` → `lg` (via the components) · page title `2xl` → `xl` · emoji left at `2xl` (single glyphs cannot wrap) · **Your Events moved full-width below the tile grid**.

**Card titles stay `colors.textPrimary`** rather than taking the state colour — this keeps the manager dashboard (the reference implementation) pixel-identical. State reads through background + border.

### Two refinements the build forced

1. **The taxonomy needed the size clause after all.** "Analytics & Insights" is a *card* (two destinations, so it cannot be one door) but it is only two links tall and belongs in the grid. Hence `DashboardCard inGrid`. **The rule is now content weight, not type: more than one internal section ⇒ full width.** That is why Your Events moved and Analytics did not.
2. **`attention` vs `danger` had to be a real separation** — see the FT-red note in `design-tokens.ts`. Actionable-but-fine must not look like broken.

### ⚠ Carried into Slice 3

The **shopper dashboard still holds its share of the 38 raw hex values.** The vendor side is clean; the shopper side is not, and it has the same tile/card mix. Slice 3 does that conversion.

Pre-existing and NOT touched (flagged, not silently deleted): `vendor/dashboard/page.tsx` has three unused imports predating this work — `formatPrice`, `UpcomingPickupItem`, `ExternalPaymentBanner`. They may be breadcrumbs for disabled features, so they are the owner's call. `shadows` became unused *because of* Slice 2 and was removed.

---

## 🛑 Slice 2 — the pre-build analysis (2026-08-07, superseded by the build above)

Read the whole vendor dashboard before converting anything. **Slice 2 is not the mechanical extraction this plan described** — it requires designing a tile state/variant system, which is a shape change from what was approved. No code was changed. Presented to owner instead of built (change-discipline · Design Fidelity).

### The finding: every tile carries bespoke state-driven color

The 9 tiles are not 9 copies of one thing. Each encodes its own conditional palette:

| Tile | States | Colors used |
|---|---|---|
| Pickup Mode | 1 | `primaryLight` |
| Upcoming Pickups | 2 | `primaryLight` + 2px primary when pickups exist |
| Orders | 2 | `#fff7ed` + **3px** `#ea580c` + glow `rgba(234,88,12,.2)` when attention needed |
| Your Listings | **3** | `#fef2f2`/`#fecaca` (red) · `#fffbeb`/`#fde68a` (amber) · neutral |
| Market Boxes | 2 | `#f9fafb`/`#d1d5db` when tier-locked |
| Booth / Park Bookings | 1 each | neutral |
| Analytics · Reviews | 1 each | neutral |

Cards are the same story: **Your Events** has 3 states (invitations → orange, today → primaryLight, else neutral) and **Business Profile** has 3 (`cancellationWarningLevel` red/orange/none).

### ⚠ The real defect underneath: a documented convention is being violated

`lib/design-tokens.ts:41` says verbatim: *"Use these for error/success/warning/info states instead of hardcoded hex."* It then defines a full semantic palette — `danger` `#dc2626` · `dangerLight` `#fef2f2` · `dangerBorder` `#fca5a5` · `warning` `#d97706` · `warningLight` `#fffbeb` · `warningBorder` `#fcd34d` · plus success and info.

**The vendor dashboard hardcodes those exact values as raw hex instead of importing them**, and additionally introduces a *second* orange family (`#ea580c` / `#fff7ed` / `#fde68a`) that duplicates the warning role at different values. So "warning" currently renders as two different ambers depending on which tile you look at. That is the measurable form of the owner's *"styles and sizes have wavered."*

### The decision the owner must make

- **(A) Semantic variants — recommended.** `DashboardTile` takes `tone: 'neutral' | 'active' | 'attention' | 'danger' | 'locked'`, mapped to the **existing `statusColors` palette**. Genuinely standardizes; kills the duplicate orange. **Visible consequence:** tiles currently on `#ea580c`/`#fff7ed` shift to the canonical `warning` amber. Not invisible — that IS the drift being fixed, but the owner should approve a visible color change rather than discover it.
- **(B) Pass-through colors.** Component accepts explicit colors; pixel-identical to today. Standardizes nothing — same drift with extra indirection.
- **(C) Hybrid.** Semantic tones plus an escape hatch for genuine one-offs.

### ⚠ Taxonomy exception found within minutes of writing the taxonomy

**Your Events** (`page.tsx:614-772`) is a *card* that renders **inside the row-1 grid**, not full-width stacked. The rule as written says cards are full width and stacked. Either the rule needs a "cards may sit in a grid when they are peers of tiles" clause, or this one becomes full-width. Owner's call; flagged rather than silently resolved.

---

## ✅ Slice 1 — built 2026-08-07 (UNCOMMITTED)

**Gates:** `tsc --noEmit` **0 errors** · full suite **1811/1811 green (70 files)**, incl. `codebase-map-coverage.test.ts` · `npm run lint` clean for this change (see pre-existing error below).

**Moves (via `git mv`, history preserved):**

| From | To | Rename |
|---|---|---|
| `market-manager/ManagerCard.tsx` | `dashboard/DashboardCard.tsx` | `ManagerCard` → `DashboardCard`; `MANAGER_NAV_OFFSET` → `NAV_OFFSET` |
| `market-manager/CollapsibleSection.tsx` | `dashboard/CollapsibleSection.tsx` | — |
| `market-manager/TabbedCard.tsx` | `dashboard/TabbedCard.tsx` | — |
| *(new)* | `dashboard/GroupHeading.tsx` | extracted from two private copies |

**22 files rewritten**, no forwarding shims. `ManagerJumpNav` deliberately stayed in `market-manager/` — generalizing nav is Slice 4. `components/dashboard/` already existed (held `ScrollToSection.tsx`), so this was not a new folder.

**`GroupHeading` consolidation:** `FmDashboardBody:59` and `FtParkDashboardBody:61` each held a private copy. Diffed before merging — **markup and every style value identical**; the FT copy's optional `accessory` prop was the only difference and is preserved as the superset. FM therefore *gains* a capability and loses nothing; rendered output is unchanged on both. FT's `ReactNode` type import was dropped (GroupHeading was its only consumer).

**Map updated (Rule 6):** `12_Market_Manager.md` — primitives list corrected, "43 files" → 42, pointer added to the new home, stamp bumped. `22_Components_UI.md` — new `components/dashboard/` section documenting all 5 files + their server/client status + the two binding design rules, directory table corrected, stamp bumped. `src/components/dashboard/**` was already claimed there, so coverage needed no claim change.

### ⚠ Two findings from the build

1. **`sed -i` rewrites line endings on Windows.** Running it across `market-manager/*.tsx` converted CRLF→LF in all 42 files, marking 20 of them modified with **zero content change**. Cleaned up by re-staging through git (normalizes on checkin); the 20 dropped out, leaving exactly the 22 real edits. **Lesson for future bulk rewrites in this repo: `sed -i` touches every file it reads, so verify with `git diff --numstat` and re-stage before believing the modified-file list.**

2. **Pre-existing lint error, NOT from this work:** `components/events/EventRequestForm.tsx:241` — *"Calling setState synchronously within an effect can trigger cascading renders"* (`react-hooks/set-state-in-effect`). That file is untouched by Slice 1 (absent from `git status`), so the error exists on `00f234c8`. Pre-commit runs `lint-staged` (staged files only) so it will not block this commit, but **CI lints all files.** Parked for the owner — outside Slice 1's scope.

---

## Change log

- **2026-08-07 (2)** — **Slice 1 built.** Card system promoted to `components/dashboard/`, `GroupHeading` consolidated across FM/FT, 22 files rewritten with no shims, both map domains updated + stamped. tsc 0 · 1811/1811. Two findings recorded above (sed/CRLF; a pre-existing lint error in `EventRequestForm`).
- **2026-08-07** — **Slices 1 & 2 authorized to plan.** Owner settled the three blockers: name = `DashboardCard` in `components/dashboard/`; no forwarding shim (all 24+4 importers rewritten in one commit); styling mechanism unchanged. Owner added smooth/fast/mobile-natural/shallow-navigation requirements, which became three binding constraints (server-component wrapper · no summary-less collapse · keep route-level loading). Two claims in this file corrected against live code: `<style>` blocks are used by **34 files**, not just the vendor dashboard; and `ManagerCard` is confirmed a **server** component while `CollapsibleSection`/`TabbedCard`/`MobileNav` are client components. Commit posture: together with the feature train on staging (presentation the week of 08-10).
- **2026-08-05 (5)** — **First code change shipped ahead of the slices** (owner-authorized): the shopper `.shopper-grid` converted from desktop-first (2 columns, collapse under 540px via `!important`) to mobile-first at the vendor dashboard's breakpoints — `1fr` → 2 at 640 → 3 at 1024. Corrects an earlier claim in this file: the grid was never broken on mobile, it just used the opposite philosophy and needed `!important` because inline `gridTemplateColumns` outranks stylesheet rules. Both dashboards now reflow identically. tsc 0 · 1811/1811.
- **2026-08-05 (4)** — Navigation decided: left rail on desktop/tablet, bottom tab bar on phone, nav rendered only for multi-role users. **Owner set mobile as the primary audience, which inverts the design order** — phone first, desktop as the roomier variant. `shared/MobileNav.tsx` turns out to be exactly the needed bottom bar (fixed, `md:hidden`, safe-area aware) so it gets revived and converted off Tailwind rather than deleted. Build order finalized at 5 slices. **Plan is now implementation-ready.**
- **2026-08-05 (3)** — Research phase complete except the final layout decision. Added: card anatomy spec derived from `ManagerCard` (with 4 named gaps), empty-state/loading/mobile survey, the three-styling-systems finding with a recommendation, and what "familiar" means concretely. Two notable discoveries: `shared/MobileNav.tsx` is dead code referenced only by the component test page, and the shopper dashboard has a fixed 2-column grid at `:589` that cannot collapse on mobile. Confirmed the vendor dashboard has the best responsive implementation of the three — more support for the owner's read that it is closest to the vision.
- **2026-08-05 (2)** — All four owner questions answered and recorded. Measured the style drift: vendor card headers are `base` while shopper and `ManagerCard` use `lg`, and the vendor dashboard still carries 8 uses of `2xl` — the exact "wrapping problem" Session 92 diagnosed and fixed on the manager dashboard. Reframes Slice 2 from "redesign" to "apply a known fix to the surface that never got it." Admin surfaces removed from scope. Card-content redesign deferred to a later pass.
- **2026-08-05** — File created. Surfaces inventoried; discovered `ManagerCard` + friends are an existing, documented standard, which reframes the work from "design a system" to "extend the one we have." Navigation direction recorded from the 2026-08-04 discussion, including the unresolved accordion question.
