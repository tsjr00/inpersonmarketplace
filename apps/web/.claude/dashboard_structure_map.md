# Dashboard Structure Map

**Built 2026-08-07** by direct inspection of every file listed. Every row below was produced by a `grep`/`wc` against the source, not from memory and not from `dashboard_redesign_plan.md`.

**Why this exists.** The plan file carried a "Surfaces inventory" that was a five-row table of *route · line count · standardized?*. It answered **which files**, never **what is inside them** — and every correction the owner had to force during the 2026-08-07 session lived in that missing second layer (which section, which container, which child, how many). Two of the plan's stated facts were also simply wrong and got repeated. See `rules/verification-discipline.md` Rule 7.

**How to use it.** Read this before designing anything that spans surfaces — a rule, a taxonomy, a nav, a reorg. **Re-verify before relying on a specific line number**; line numbers drift, structure does not. Structure claims in conversation still need a fresh grep (Rule 7) — this file is a map, not a licence.

**Scope:** the three dashboard surfaces. Admin consoles (`/[vertical]/admin` 738 lines, `/admin` 485) are **deliberately out of scope** (owner, 2026-08-05) and have their own `AdminNav`/`AdminSidebar` conventions.

---

## The shared system (`src/components/dashboard/`)

| File | Role | Rendering |
|---|---|---|
| `DashboardCard.tsx` | **the card ("a room")** · props `id · title · description · headerAccessory · state · inGrid` · exports `NAV_OFFSET` | **server** |
| `DashboardTile.tsx` | **the tile ("a door")** · `href` **or** `onClick` · `icon · title · badge · state · targetBlank` · exports `TileBadge` | **server**¹ |
| `states.ts` | `DashboardState` + `DASHBOARD_STATES` — the 8-entry palette shared by BOTH | n/a |
| `icons.tsx` | `DASHBOARD_ICONS` — the whole lucide vocabulary, one editable map | n/a |
| `GroupHeading.tsx` | banner grouping several cards; optional `accessory` | **server** |
| `CollapsibleSection.tsx` | group with a lid | client |
| `TabbedCard.tsx` | group with tabs (**misnamed** — it is a group, not a card) | client |
| `ScrollToSection.tsx` | scroll helper, shopper dashboard only | client |

¹ `DashboardTile` is server **unless** a client parent passes `onClick`, which pulls it into that parent's bundle. `href` callers ship zero JS.

**States:** `neutral · active · attention · warning · danger · pending · locked · promo`. Taxonomy + face rule: `docs/Codebase_Map/22_Components_UI.md`.

---

## Surface 1 — Shopper · `/[vertical]/dashboard/page.tsx`

**~1,290 lines · 0 raw hex** (was 51) · server component with route-level `loading.tsx`.

**FOUR `<h2>` bands**, not three (the plan said three):

| Band | `<h2>` | Localized? |
|---|---|---|
| 🛒 Shopper | `:406` | ✅ |
| My Events *(organizers)* | `:752` | ❌ **hardcoded English** |
| Vendor *(two variants — pitch / dashboard-link)* | `:993`, `:1100` | ✅ |
| 🔧 Admin | `:1258` | ✅ |

### Containers and their children

| Container | Children | Status |
|---|---|---|
| *(above the grid, stacked)* | `RateOrderCard` `:587` | ⏳ unconverted |
| **`.shopper-grid`** `:593` | Browse · My Orders · My Favorites · Where Today *(tiles)* · `MarketManagerCard` · `DashboardNotifications` · `HelpSearchWidget` · `FeedbackCard` | ✅ **100% converted** |
| *(stacked, after grid)* | Upgrade to Premium — `DashboardCard state="promo"` `:670` | ✅ |
| flex column `:698`→ | organizer block: `EventAgreementPickerCard` `:952` · `EventBroadcastCard` `:958` · `EventRatingsCard` `:964` | ⏳ unconverted |
| **grid `:1114`** *(Vendor band)* | Vendor Dashboard *(tile)* · `HelpSearchWidget` · `PendingSurveysCard` · `VendorFeedbackCard` · Grow-your-business promo · `ReferralCard` | ✅ **100% converted 2026-08-07** |
| *(stacked)* | Pending Approval — `DashboardCard state="pending"` `:1214` | ✅ |
| **grid `:1226`** *(pre-approval)* | Create Drafts *(tile)* · `HelpSearchWidget` · `VendorFeedbackCard` | ✅ |
| *(Admin band)* | Admin Panel *(tile)* `:1275` | ✅ chrome only — **placement is a 3b decision** |

✅ **Every grid on every dashboard is now internally uniform.** The grid at `:1114` was the last mixed container; `PendingSurveysCard` and `ReferralCard` were converted 2026-08-07. (Correcting an earlier claim: those two were **not** "outside the grid" — that was wrong, and it made a leftover sound intentional.) Everything still unconverted sits in a **stacked** container, where a mismatch reads as inconsistent rather than broken.

**Responsive:** `.shopper-grid` is mobile-first — `1fr` → 2 @640 → 3 @1024, matching vendor.

---

## Surface 2 — Vendor · `/[vertical]/vendor/dashboard/page.tsx`

**~1,000 lines · server component · `export const dynamic = 'force-dynamic'` `:1`.** Root `className="vendor-dashboard"` `:367` scopes its `<style>` block.

**No `<h2>` bands** — organised as commented ROWS, each its own grid.

| Container | Children | Status |
|---|---|---|
| *(stacked, top)* | `OnboardingChecklist` `:396` · `QualityAlertBanner` `:410` | banners, n/a |
| **`.row-1-grid`** `:416` *— operational* | Pickup Mode · My Upcoming Pickups *(tiles)* · Manage Locations *(card, `inGrid`)* | ✅ |
| **`.row-2-grid`** `:567` *— daily ops* | My Orders · My Listings · My Market Boxes · My Booth Bookings (FM) · My Park Bookings (FT) *(tiles)* · **My Vendor Events** *(card, `inGrid`)* `:701` | ✅ |
| **`.row-3-grid`** `:757` *— business* | Business Profile *(card, `inGrid`)* · `PaymentMethodsCard` `:874` · Analytics & Insights *(card, `inGrid`)* `:901` | ⚠️ `PaymentMethodsCard` unconverted |
| **`.row-4-grid`** `:944` *— info* | `DashboardNotifications` · My Reviews *(tile)* | ✅ |
| **`.promote-grow-grid`** `:966` | `PromoteCard` | ⏳ unconverted |
| *(stacked, bottom)* | Legal Agreements *(card)* `:983` | ✅ |

🚨 **Rows 1–2 order is an owner decision — operational first.** Do not re-sort by size, alphabet, or "visual balance."

**Responsive** (`<style>` block, mobile-first): rows 1–3 `1fr` → 2 @640 → 3 @1024; row 4 and promote `1fr` → 2 @640.

---

## Surface 3 — Market Manager · `/[vertical]/market-manager/[marketId]/dashboard/page.tsx`

**The reference implementation. Do not redesign its chrome** — it is what everything else standardises *toward*.

Shell (232 lines): `<h1>` `:176` → `ManagerJumpNav` `:198` → **one of two bodies** by vertical: `FtParkDashboardBody` `:204` (FT) or `FmDashboardBody` `:218` (FM).

⚠️ **Both bodies are pure vertical STACKS — zero grid containers.** Structurally unlike the shopper and vendor dashboards. Anything assuming "dashboards are grids" is wrong here.

### `ManagerJumpNav` — sticky section chips, plain `<a href="#id">` on purpose (native scroll, works without JS, re-scrolls on repeat clicks)

| | anchors offered |
|---|---|
| **FM** `:35` | `setup` · `booths` · `vendors` · `money` · `announce` |
| **FT** `:25` | `week` · `vendors` · `money`¹ · `setup` · `announce` |

¹ FT `money` is conditional on `showMoney`.

### `FmDashboardBody.tsx` (220 lines) — render order

`DashboardCard`(vendors→`VendorBoothList`) `:75` · `DashboardCard`(invite) `:90` · `ManagerActionSummary` `:129` · **`CollapsibleSection id="setup"`** `:134` *(defaults collapsed once onboarding completes)* → `OnboardingChecklist` · `MarketStripeConnectCard` · `MarketScheduleCard`(`#schedule`) · `MarketSeasonCard`(`#seasons`) · `MarketSeasonSettlementCard` · `DashboardCard`(→`OptinManager`) · `MarketBrandingCard` · `VerificationDocumentsCard` · `MarketVisibilityCard` · **`GroupHeading id="booths"`** `:173` → `BoothInventoryManager` · `MarketMapCard` · `BoothOccupancyGrid` · `BoothPlaceholderManager` · `WeeklyBookingsCard`(`#weekly-bookings`) · `MarketAttendanceCard` · `MarketCancelDateCard` · **`TabbedCard`** `:195` · **`GroupHeading id="money"`** `:205` → `ManagerEarningsCard` · `MarketTransactionsCard` · `SurveyResultsCard`(`#surveys`) · **`GroupHeading` "Communicate & learn"** `:213` → `MarketBroadcastCard`(`#announce`) · `ManagerSupportCard`

### `FtParkDashboardBody.tsx` (255 lines) — render order

**`GroupHeading id="week-group"`** `:113` → `DashboardCard` · `ParkWeekCard` · `MarketAttendanceCard` · `MarketCancelDateCard` · **`TabbedCard`** `:132` *(roster / `StandingReservationsCard` / invite)* · **`GroupHeading id="money"`** `:190` → `ManagerEarningsCard` · **`CollapsibleSection id="setup"` "Park setup"** `:197` → `MarketStripeConnectCard` · `DashboardCard` · `MarketMapCard` · `MarketScheduleCard`(`#schedule`) · `DashboardCard` · `ParkRequiredDocsCard` · `MarketBrandingCard` · `VerificationDocumentsCard` · `MarketVisibilityCard` · **`GroupHeading` "Communicate & learn"** `:241` → `MarketBroadcastCard`(`#announce`) · `SurveyResultsCard`(`#surveys`) · `ManagerSupportCard`

⚠️ **Anchor ids are a cross-file contract** between `ManagerJumpNav` and the bodies. A dead jump link has already shipped once (staging tester, 2026-08-03: `#vendors-at-market` vs the real `#vendors`). **Rename an id in one place and the nav silently breaks.**

---

## Everything still hand-rolling its own chrome

| Component | Lines | Renders in | Priority |
|---|---|---|---|
| ~~`PendingSurveysCard`~~ | 83 | shopper grid `:1114` | ✅ done 2026-08-07 (tile, `attention` when pending) |
| ~~`ReferralCard`~~ | 190 | shopper grid `:1114` | ✅ done 2026-08-07 (card, `promo`) |
| ~~`PaymentMethodsCard`~~ | 585 | vendor `.row-3-grid` | ✅ done 2026-08-07 (card, `inGrid`) |
| `RateOrderCard` | 423 | shopper, stacked above grid | 🟡 stacked, seam is small |
| `EventAgreementPickerCard` | 193 | shopper organizer block | 🟡 |
| `EventBroadcastCard` | 188 | shopper organizer block | 🟡 |
| `EventRatingsCard` | 138 | shopper organizer block | 🟡 |
| `PromoteCard` | — | vendor `.promote-grow-grid` | 🟡 alone in its grid, no peers to clash with |
| 3 inline blocks | — | shopper: Ready for Pickup `~:419`, organizer block, Passion→Profit | 🟡 |

**The rule that ranks these:** a component sitting in a grid **beside converted peers** is a visible defect. One in a stacked list is merely inconsistent. **All of the first kind are now done** — everything remaining is the second kind.

⚠️ **One judgment call to review:** `PendingSurveysCard` uses `attention` when surveys are pending. That is semantically right (a task only that vendor can do) but `attention` is the LOUDEST state, and a survey nudge may not deserve the same weight as an unconfirmed order. If the dashboard starts feeling uniformly urgent, this is the first thing to demote.

---

## Facts that bite, collected

1. **Manager bodies have no grids.** Pure stacks. (Cost: the "cards are full-width and stacked" rule was written from the vendor dashboard and immediately contradicted.)
2. **`components/dashboard/` already existed** before Slice 1 — it held `ScrollToSection`.
3. **`MarketManagerCard` ≠ `ManagerCard`.** Different components, near-identical names. The second is now `DashboardCard`.
4. **Vendor events have no index route.** `EventMarketsSection` (274 lines) renders inside **`vendor/markets/page.tsx:603`** — the *locations* page. `/[vertical]/vendor/events` has per-event routes only. Extracting it would fix events **and** de-cram locations.
5. **`vendor/markets/page.tsx` is the cram case** — 614 lines + `EventMarketsSection` 274 + `MarketSuggestionSection` 529 + `PrivatePickupSection` 559 ≈ **2,000 lines**, with raw numeric font sizes (`28`/`20`/`16`/`15`) outside the token system entirely.
6. **`shared/MobileNav.tsx` is dead code** — referenced only by `app/test-components/page.tsx`. It is a correct fixed bottom bar with safe-area handling. Slice 4 revives it (converting off Tailwind).
7. **The purples are indigo.** The palette has no purple; the admin/"in review" accent uses `selection*`, so the token name lies. Resolve in 3b.
10. 🚨 **On food trucks, `accent` IS `primaryDark` IS bright red** (`#ff3131`). FT's `primary` `#ff5757`, `primaryDark` `#ff3131` and `accent` `#ff3131` are all reds — so reaching for a brand colour to signal "special" lands on top of `danger`. **This is the mechanical cause of "everything was red and it got confusing."**
    **`accentGold` was added 2026-08-07** to both palettes (`#FBC02D`) as a SECOND accent — the one non-red signal colour FT has. It is an option to use where red would collide, **not** a replacement for `accent`: `colors.accent` has 46 usages across 23 files (checkout borders, order-status colours, browse capacity), and swapping it wholesale would repaint all of them.
    The `promo` state uses `accentGold` for exactly this reason. A promo bordered with `accent` shipped briefly on 2026-08-07 and rendered indistinguishable from `danger` on FT.
8. **Both big dashboards are server components** with route-level `loading.tsx`. Do **not** add per-card spinners.
9. **`performance-baseline.test.ts` enforces query count and sequential depth.** The shopper dashboard's role signals load in one parallel `Promise.all` — splitting them into per-section fetches fails the test, correctly.
