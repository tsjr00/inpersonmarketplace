# 22 — Components & UI

<!-- map-stamp: domain=components-ui; verified=2026-08-07; commit=8bba03d5 -->
<!-- map-claims
src/components/shared/**
src/components/layout/**
src/components/admin/**
src/components/analytics/**
src/components/dashboard/**
src/components/onboarding/**
src/components/ErrorFeedback.tsx
src/hooks/**
src/types/**
src/instrumentation.ts
-->

183 components, 142 pages. Hand-rolled — there is no third-party component library.

---

## Read this first

1. **`src/lib/design-tokens.ts`** — the whole visual language, roughly a ten-minute read.
2. **`src/app/globals.css`** — where the CSS variables the tokens reference are actually set. This is the theming seam.
3. **`src/components/shared/README.md`** — usage examples for `AdminTable`, `StandardForm`, `StatusBadge`, `MobileNav`. Read it for the APIs, but **ignore its "Tailwind Only" line** — see below.
4. **`src/components/shared/ConfirmDialog.tsx`** — the mandated replacement for `window.confirm`.
5. **`src/app/test-components/page.tsx`** — a live gallery of primitives; the fastest way to see what exists.

## ⚠ The styling convention contradicts the in-repo README

**Verified by count on 2026-07-18:** in `src/components`, **167 files use `style={{…}}` and only 26 use `className=`**. **296 files import `design-tokens`.**

⚠ **Raw hex in a dashboard is a bug, not a style choice** (added 2026-08-07). `design-tokens.ts:41` says so explicitly — *"Use these for error/success/warning/info states instead of hardcoded hex"* — yet the vendor and shopper dashboards had accumulated **38 hardcoded hex values**, including two different colours for the same severity tier (`Your Listings` painted its middle state amber; `Business Profile` painted its middle state orange, both named `'orange'` in code). The vendor dashboard was cleaned up in Slice 2; **the shopper dashboard still carries its share — Slice 3.** The missing tier those hexes were improvising is now `statusColors.attention`.

Tailwind v4 *is* installed and `@import "tailwindcss"` is in `globals.css`, but the codebase does not use it in practice. `shared/README.md:68` still says *"Tailwind Only: Use Tailwind utility classes, no custom CSS"* — **that line is stale and contradicts the code.** `Spinner.tsx`, `Toast.tsx` and `ConfirmDialog.tsx` are all pure inline token styles with zero Tailwind.

One leftover from the Tailwind era survives: `StatusBadge` still accepts Tailwind class strings via `customColor` (`{bg: 'bg-purple-100', text: 'text-purple-800'}`).

**How theming works:** brand colors in `design-tokens.ts` are **CSS-variable references with fallbacks**, e.g. `primary: 'var(--color-primary, #8BC34A)'`. Swap the variables per vertical and every component retheme's. Semantic status colors are deliberately hardcoded hex because they are *not* vertical-specific.

## Conventions

- **No component library.** No Radix, shadcn or MUI. UI-adjacent dependencies are `lucide-react` (icons), `chart.js` + `react-chartjs-2` (analytics only) and `qrcode`. `components/shared/` **is** the design system.
- **`'use client'` is the norm** in `components/`. Server components live at the `page.tsx` layer, with `*Wrapper.tsx` / `*Body.tsx` files marking the client boundary (`HeaderWrapper`, `CartProviderWrapper`, `TutorialWrapper`, `FmDashboardBody`).
- **i18n is built into the primitives** — `ConfirmDialog` pulls `getClientLocale()` and `t()`. New strings go through that path.
- **Data fetching is SWR**, configured centrally in `lib/swr.ts`, with `lib/polling-config.ts` + `useSmartRefresh` governing cadence.
- **`window.confirm` / `alert` / `prompt` are forbidden** (blocked on mobile). Verified: **zero live calls** remain in `src/app` or `src/components` — only comments explaining the replacement. `ConfirmDialog` is referenced in **40 files**.

## `components/shared/` — the primitives

| File | Purpose |
|---|---|
| `ConfirmDialog.tsx` | Modal confirm with `variant: 'default' \| 'danger'`, an optional text input (`showInput` / `inputRequired`) for reason capture, Escape-to-close and focus management |
| `Toast.tsx` | Fixed bottom-right transient notification; `success \| error \| info \| warning`, auto-dismiss 5s |
| `StandardForm.tsx` | Declarative form renderer — pass a `fields` array plus an async `onSubmit` |
| `AdminTable.tsx` | Generic sortable/filterable/paginated table with per-column `render` |
| `StatusBadge.tsx` | Status pill with a built-in status→color map, plus `customColor` and `size` |
| `TierBadge.tsx` | Vendor tier badge |
| `Spinner.tsx` | Loading spinner with `role="status"` + `aria-label` |
| `Skeleton.tsx` | Skeleton placeholders, several variants |
| `ErrorDisplay.tsx` | Inline error surface with optional dismiss |
| `MobileNav.tsx` | Bottom tab bar |
| `Footer.tsx` | Global footer, vertical- and locale-aware |
| `BackLink.tsx` · `LanguageSelector.tsx` · `VendorAvatar.tsx` | Navigation, locale switcher, avatar with tier ring |
| `VendorDocLink.tsx` | Signed-URL link to a vendor document; also exports `extractVendorDocPathFromPublicUrl()` |

**Feedback patterns — pick deliberately:** `useToast` (transient, global) vs `useStatusBanner` (inline, in-form).

## Component directories

| Directory | Files | What lives there |
|---|---|---|
| `market-manager/` | 42 | The largest. Manager dashboards (`FmDashboardBody` / `FtParkDashboardBody`), booth and spot inventory, seasons, settlement, onboarding, surveys — see [12_Market_Manager.md](12_Market_Manager.md) and [13_FT_Park.md](13_FT_Park.md) |
| `vendor/` | 35 | Profile, listings, six distinct upload components, market/park booking, order queue — see [11_Vendor_Orders.md](11_Vendor_Orders.md). (`TrialStatusBanner` deleted 2026-07-18 with the trial retirement) |
| `landing/` | 15 + local tokens | Marketing sections, barrel-exported. **Has its own local `design-tokens.ts`** separate from `lib/design-tokens.ts` — a real duplication |
| `buyer/` | 8 | Order status, pickup, feedback and ratings |
| `admin/` | 7 | Console chrome, verification panel, mobile rows, pagination — see [19_Admin.md](19_Admin.md) |
| `events/` | 7 | Organizer and attendee flows — see [14_Events.md](14_Events.md) |
| `analytics/` | 5 | Chart.js widgets: `SalesChart`, `MetricCard`, `TopVendorsTable`, `TopProductsTable` |
| `listings/` | 5 | Public listing detail: gallery, purchase section, pickup locations, cutoff badges |
| `markets/` | 5 | Public market discovery: cards, location-aware list, schedule display, documents viewer |
| `layout/` | 5 | `Header`/`HeaderWrapper`, `EnvironmentBanner` (staging warning bar), `SentryInit`, `WebVitals` |
| `cart/` | 4 | See [10_Checkout_Payments.md](10_Checkout_Payments.md) |
| `notifications/` | 3 | Bell, dashboard list, push opt-in — see [18_Notifications.md](18_Notifications.md) |
| `marketing/` | 3 | Share button, post-purchase share prompt, social-proof toast |
| `help/` · `onboarding/` · `surveys/` · `location/` | 2 each | Help search + article list · tutorial modal + wrapper · survey form + pending card · location prompt + inline search |
| `dashboard/` | 7 | **The shared dashboard card + tile system** — see the section below |
| `auth/` · `browse/` · `legal/` · `projection/` · `support/` | 1 each | Turnstile · notify-me capture · legal document renderer · operator projection tool · support form |

## `components/dashboard/` — the shared dashboard card system

Promoted out of `components/market-manager/` on **2026-08-07** (Slice 1 of the dashboard standardization) so the manager, vendor and shopper dashboards share one set of chrome instead of hand-rolling cards each. The manager dashboard is the reference implementation and did not change visually.

| File | Purpose | Rendering |
|---|---|---|
| `DashboardCard.tsx` | **The card ("a room")** — fixed padding/border/radius/gap, header at `lg` semibold, `description` at `sm` muted, optional `headerAccessory`, optional `state`, optional `inGrid`, `id` + `scrollMarginTop` for anchor landing. Also exports **`NAV_OFFSET`** (sticky-nav height). Was `ManagerCard` / `MANAGER_NAV_OFFSET` | **server** |
| `DashboardTile.tsx` | **The tile ("a door")** — whole surface is a `next/link`, equal height in a grid, `icon` + `title` + `badge` + status line, semantic `state`. Also exports `TileBadge` (the count pill) | **server** |
| `states.ts` | **The shared state vocabulary** — `DashboardState` + `DASHBOARD_STATES`. One palette used by BOTH tile and card, so "needs your attention" looks identical everywhere | n/a |
| `GroupHeading.tsx` | Banner grouping several cards under one heading; optional right-aligned `accessory`. Consolidated from two identical private copies in `FmDashboardBody` and `FtParkDashboardBody` | **server** |
| `CollapsibleSection.tsx` | Expand/collapse group wrapper | client |
| `TabbedCard.tsx` | Segmented tab bar swapping one panel at a time | client |
| `ScrollToSection.tsx` | Scroll helper used by the shopper dashboard | client |

**The seven states** (`states.ts`): `neutral` resting · `active` in flight and healthy · **`attention`** you must act and nobody else can · `warning` degrading not broken · `danger` broken or blocking · `pending` you have done your part, someone else has not · `locked` your tier does not include it.

Adding a state is one entry in `DASHBOARD_STATES` — deliberately cheap, because the list is expected to grow from real device testing. **`suspended`/`revoked` was considered and deliberately left out** (owner, 2026-08-07): the concept is live in the data (migration 217; the manager access-suspended/access-removed pages) but renders identically to `danger`, so it earns its own state only if testing shows it needs one.

⚠ **`attention` vs `danger` is a deliberate separation, not a nicety.** The FT vertical previously leaned on red so heavily that everything looked urgent and the signal stopped meaning anything (owner, 2026-08-07). Actionable-but-fine (an unconfirmed order) must not look like broken (out of stock).

**⚠ `DashboardCard` and `GroupHeading` are server components on purpose** — an exception to the "`'use client'` is the norm" convention above. The dashboards are the highest-traffic authenticated pages and are server-rendered; keeping the chrome server-side means it ships zero JS. Adding interactivity to either would flip every card on every dashboard to client-rendered.

**⚠ Two binding design rules (owner, 2026-08-07):** navigation must stay shallow, so nothing is wrapped in `CollapsibleSection` unless its header states what is inside (a count, a status, or the next action). And the dashboards keep their route-level `loading.tsx` — no per-card `Skeleton`/`Spinner`, which would convert server cards to client cards and regress `performance-baseline.test.ts`.

### 📐 Tile vs Card — the standing taxonomy (agreed with owner 2026-08-07)

**This is the vocabulary. Use these words precisely; they mean specific things.**

There are **two levels**. **Groups** organize, **units** hold. Groups contain units, units contain content, and nothing nests deeper than that.

- **Groups:** `GroupHeading` (labeled band) · `CollapsibleSection` (band with a lid) · `TabbedCard` (⚠ *misnamed* — it is a group, not a card; it folds several cards into one object).
- **Units:** **tiles** and **cards**.

| | **Tile** | **Card** |
|---|---|---|
| What it is | **A door — you click it and you leave** | **A room — the content is here** |
| Clickable | The whole surface | **Never**; buttons and links live *inside* it |
| Layout | Grid, equal height (`height: 100%`) | Full width, stacked — **unless small**, see below |
| Holds | Icon, short label, usually one line of description (a goal, not a hard cap) | Real content — lists, forms, controls |
| Must show | **Its status without being clicked** — count, badge, alert border | — |

Two behaviours sit **on top of cards**, rather than being separate kinds of unit:

- **Collapsible** — for genuinely occasional content, and only under the face rule below.
- **Tabbed** — only for 2–4 alternative views *of the same thing* (roster / recurring / invite for the same trucks). Never unrelated sections parked together to save vertical space.

**The face rule — what earns the front of a collapsible:**

> **The face answers "does this need me?" The inside answers "what do I do about it?"**

Status, counts and warnings stay visible; controls and detail go behind the lid. Example: a locations card's face reads *"3 locations · 1 needs check-in today"*, while editing, schedules and the suggestion form sit inside.

**Hard limit:** if the face line cannot be written in **roughly eight words**, the card is doing too much and must be split. An unwritable summary is the diagnostic that a card has accumulated unrelated jobs.

**When it is ambiguous, one question decides it:** *does clicking the whole thing take me somewhere else?* Yes → tile. No → card: plain if needed most visits, collapsible if occasional, tabbed if there are a few views of the same thing.

**A small card MAY sit in a grid** (`DashboardCard inGrid`), as a peer of tiles. **The test is content weight, not type.** Vendor "Analytics & Insights" is a card — it holds *two* destinations, so the whole surface cannot be one door — but it is two links tall, so it stays a grid peer. "Your Events" is also a card and was also in the grid, but it carries five internal sections (Action Needed / Today / Upcoming / Backup / Past) fighting over a third of a row; it was moved full-width below the grid on 2026-08-07. *If a card has more than one internal section, it needs the full width.*

**Four things we do not do:**
1. A tile inside a card — two competing click targets in one box.
2. A card that is clickable as a whole — that is a tile.
3. A collapse whose state cannot be read from the face.
4. A form or list inside a tile — if it needs real content, it is a card.

**Why this exists.** `[vertical]/vendor/markets/page.tsx` is **614 lines** plus three section components totalling **1,362 more** (`EventMarketsSection` 274 · `MarketSuggestionSection` 529 · `PrivatePickupSection` 559) — ~2,000 lines of related-but-uncategorized functionality on one screen, setting font sizes as raw numbers (`28`, `20`, `16`, `15`) instead of design tokens. The functionality is good and genuinely belongs together; it accreted without anyone deciding what deserved the front of the room. It did not get confusing because someone made a bad call — it got confusing because **there was no rule to violate.** This is that rule.

### 🫙 Empty sections COLLAPSE — they never disappear (owner 2026-08-08)

A card with nothing to show renders **header + one muted line, no body** (`DashboardCard`'s `empty` prop). It does **not** `return null`.

**Why, in the owner's words:** *"I want the user to see the functionality & features available to them… so people start using the app more and get used to its functionality more than their other options."* A section that vanishes on a quiet week is a feature the user never learns exists — no adoption, no upgrade, no reason to stay. Collapsing keeps the page scannable as a table of contents without a wall of empty grids and dead buttons.

**"Empty" is three things and the copy differs. Using the wrong flavour is worse than saying nothing.**

| Kind | When | The line does |
|---|---|---|
| `setup` | Not configured yet — no booth tiers, no listings | **Invites.** Name the thing to do, or pass an `action`. Data will never arrive on its own |
| `waiting` | Nothing right now, by nature — no orders today, no announcements sent | **Reassures.** It fills in on its own; nothing is owed |
| `unavailable` | Wrong tier or wrong market type | **Offers the path.** Pair with an upgrade link. NEVER use `waiting` copy — the data is not coming, and saying it will is a lie |

**Mechanics:** collapsed cards drop to `spacing.xs` padding, `radius.sm`, a 1px neutral border, and **no state and no headerAccessory** — an empty section must never signal or shout. `children` and `description` are suppressed, so a caller passes its normal body unguarded.

**Tiles use the tile version of the same rule** — always render, drop to `neutral`, drop the badge, swap the body copy. `PendingSurveysCard` and `RateOrderCard` are the reference pair; note `RateOrderCard` is `attention` only when it actually has something to ask for.

**Two exceptions, both deliberate:**
- **A competing prompt is not an empty state.** `ManagerActionSummary` still returns null while onboarding is incomplete, because `OnboardingChecklist` owns that moment. Do not "fix" it.
- **Still null while LOADING.** A tile that appears, changes state, then changes again is worse than one that arrives once.

⏳ **Not decided:** whether populated sections should sort above collapsed ones. Deliberately held for the owner to judge on staging, since it moves things on screen.

Plan of record: `apps/web/.claude/dashboard_redesign_plan.md`.

Root-level: `ErrorFeedback.tsx` — the user-facing error reporter; takes `errorCode`/`traceId` and resolves human copy via `lookupError`.

## `src/hooks/` and `src/types/`

| File | Purpose |
|---|---|
| `hooks/useLocationAreaName.ts` | Resolves coordinates to a human area name; caches in sessionStorage, supports `enabled` and a timeout |
| `hooks/useStatusBanner.tsx` | Inline success/error/warning/info banner with auto-dismiss |
| `types/pickup.ts` | Pickup-scheduling types. `AvailablePickupDate` mirrors the `get_available_pickup_dates()` row shape including `market_type` and `cutoff_hours` |

**Types are mostly co-located**, either with the module that owns them (`lib/branding/types.ts`, `lib/vertical/types.ts`) or beside the components that use them (`components/vendor/markets/types.ts`).

## Page inventory

142 `page.tsx` files: **110 under `[vertical]/`**, 20 under `app/admin/`, 12 at other top levels. The full grouped inventory lives in the domain files — vendor pages in [11_Vendor_Orders.md](11_Vendor_Orders.md), manager pages in [12_Market_Manager.md](12_Market_Manager.md), admin in [19_Admin.md](19_Admin.md), buyer and public in [20_Buyer_Public.md](20_Buyer_Public.md), events in [14_Events.md](14_Events.md).

## Gotchas to internalize

1. **Two `design-tokens` files exist** (`lib/` and `components/landing/`). Use `@/lib/design-tokens` unless editing the landing page.
2. **Most hooks are in `lib/hooks/`, not `src/hooks/`.** Check both.
3. **`[vertical]` prefixes nearly every route**, and there are also non-scoped root duplicates plus a fully separate `/admin` console with its own MFA login.
4. **Two market archetypes run in parallel** (farmers market vs food-truck park) through the manager and vendor components — before changing something, check whether it has an `Fm*` / `Park*` / `FtPark*` twin.
