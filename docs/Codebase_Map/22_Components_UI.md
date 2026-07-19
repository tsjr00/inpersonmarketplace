# 22 — Components & UI

<!-- map-stamp: domain=components-ui; verified=2026-07-18; commit=b9f82116 -->
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

180 components, 142 pages. Hand-rolled — there is no third-party component library.

---

## Read this first

1. **`src/lib/design-tokens.ts`** — the whole visual language, roughly a ten-minute read.
2. **`src/app/globals.css`** — where the CSS variables the tokens reference are actually set. This is the theming seam.
3. **`src/components/shared/README.md`** — usage examples for `AdminTable`, `StandardForm`, `StatusBadge`, `MobileNav`. Read it for the APIs, but **ignore its "Tailwind Only" line** — see below.
4. **`src/components/shared/ConfirmDialog.tsx`** — the mandated replacement for `window.confirm`.
5. **`src/app/test-components/page.tsx`** — a live gallery of primitives; the fastest way to see what exists.

## ⚠ The styling convention contradicts the in-repo README

**Verified by count on 2026-07-18:** in `src/components`, **167 files use `style={{…}}` and only 26 use `className=`**. **296 files import `design-tokens`.**

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
| `market-manager/` | 43 | The largest. Manager dashboards (`FmDashboardBody` / `FtParkDashboardBody`), booth and spot inventory, seasons, settlement, onboarding, surveys — see [12_Market_Manager.md](12_Market_Manager.md) and [13_FT_Park.md](13_FT_Park.md) |
| `vendor/` | 36 | Profile, listings, six distinct upload components, market/park booking, order queue — see [11_Vendor_Orders.md](11_Vendor_Orders.md) |
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
| `auth/` · `browse/` · `dashboard/` · `legal/` · `projection/` · `support/` | 1 each | Turnstile · notify-me capture · scroll helper · legal document renderer · operator projection tool · support form |

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
