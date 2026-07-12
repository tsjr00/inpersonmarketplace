# Visual System Audit — UI Standards & Design Token Research

**Purpose:** Comprehensive review of how visual elements are defined, named, placed, and sized across the app. Starting point for landing page redesign with professional designer input.

**Status:** COMPLETE — research phase finished

**Files Reviewed:**
- `src/lib/design-tokens.ts` (273 lines) — all token definitions
- `src/app/globals.css` (209 lines) — CSS custom properties + base styles
- `src/lib/branding/defaults.ts` (64 lines) — per-vertical branding fallbacks
- `src/lib/branding/types.ts` (34 lines) — VerticalBranding interface
- `src/lib/branding/server.ts` (195 lines) — server-side config fetching
- `src/lib/branding/index.ts` (7 lines) — client-safe exports
- `src/app/layout.tsx` (52 lines) — root layout, fonts, globals
- `src/app/[vertical]/layout.tsx` (30 lines) — vertical theme injection
- `src/app/[vertical]/page.tsx` (197 lines) — landing page server component
- `src/components/landing/` — all 10 landing components (2,013 lines total)

---

## 1. Design Token System

### How It Works (Two-Layer Architecture)

**Layer 1: CSS Custom Properties** (`globals.css:9-139` — the `:root` block)
- Defines default values (FM green palette) as CSS variables
- Example: `--color-primary: #8BC34A` at `globals.css:21`
- Vertical overrides injected via inline `style` at `[vertical]/layout.tsx:23`

**Layer 2: JS Token Objects** (`design-tokens.ts`)
- Exports `colors` (`design-tokens.ts:10-35`), `spacing` (`:73-83`), `typography` (`:86-108`), `containers` (`:112-119`), `radius` (`:121-127`), `shadows` (`:129-136`)
- Color values are `var()` references: `colors.primary = 'var(--color-primary, #8BC34A)'` at `design-tokens.ts:11`
- Components consume these via inline `style={{}}` props — NOT Tailwind classes
- The `var()` fallback ensures colors work even without CSS variable injection

**How Vertical Theming Works:**
1. `getVerticalCSSVars(vertical)` at `design-tokens.ts:232-259` returns CSS var overrides for non-FM verticals
2. FM returns `{}` (uses `:root` defaults from `globals.css`)
3. FT returns `{ '--color-primary': '#ff5757', ... }` (16+ overrides) — FT palette defined at `design-tokens.ts:161-187`
4. `[vertical]/layout.tsx:19` calls `getVerticalCSSVars(vertical)`, line `:23` injects as `style={...cssVars}` on the root `<div>`
5. CSS cascade: inline overrides > `:root` defaults
6. All children reading `var(--color-primary)` automatically get the vertical color

### Color Tokens — FM (Farmers Market) Green Palette

Defined at `design-tokens.ts:10-34` (JS) and `globals.css:21-50` (CSS)

| Token Name | Hex | CSS Var | Where Defined (JS / CSS) | Where Used (examples) |
|-----------|-----|---------|--------------------------|----------------------|
| `primary` | `#8BC34A` | `--color-primary` | `design-tokens.ts:11` / `globals.css:21` | Hero CTA borders (`Hero.tsx:115`), step badges (`HowItWorks.tsx:106`), circle CTA bg (`HowItWorks.tsx:149`), trust dot (`Hero.tsx:148`), check circles (`VendorPitch.tsx:82`) |
| `primaryDark` | `#689F38` | `--color-primary-dark` | `design-tokens.ts:12` / `globals.css:22` | Hero H1 accent line (`Hero.tsx:76`), stat numbers (`TrustStats.tsx:68`), CTA hover (`HowItWorks.tsx:157`), vendor pitch section bg (`VendorPitch.tsx:30`) |
| `primaryLight` | `#F1F8E9` | `--color-primary-light` | `design-tokens.ts:13` / `globals.css:23` | Hero CTA hover bg (`Hero.tsx:121`), step icon circle bg (`HowItWorks.tsx:94`), FinalCTA gradient start (`FinalCTA.tsx:22`) |
| `accent` | `#FBC02D` | `--color-accent` | `design-tokens.ts:16` / `globals.css:26` | GetTheApp decorative circle (`GetTheApp.tsx:159`) |
| `accentMuted` | `#BCAAA4` | `--color-accent-muted` | `design-tokens.ts:17` / `globals.css:27` | TrustStats section bg (`TrustStats.tsx:33`), feature icons FM (`Features.tsx:96`), footer brand text (`Footer.tsx:70`), footer links (`Footer.tsx:98`) |
| `surfaceBase` | `#FFFEF7` | `--color-surface-base` | `design-tokens.ts:20` / `globals.css:30` | Page bg (`[vertical]/layout.tsx:23`), Hero gradient end (`Hero.tsx:37`), FinalCTA gradient end (`FinalCTA.tsx:23`) |
| `surfaceElevated` | `#FFFFFF` | `--color-surface-elevated` | `design-tokens.ts:21` / `globals.css:31` | Cards (`HowItWorks.tsx:82`), feature cards FM (`Features.tsx:87`), stat icon circles (`TrustStats.tsx:58`), VendorPitch CTA bg (`VendorPitch.tsx:113`), phone mockup bg (`GetTheApp.tsx:271`) |
| `surfaceSubtle` | `#FFFDE7` | `--color-surface-subtle` | `design-tokens.ts:22` / `globals.css:32` | Hero gradient start FM (`Hero.tsx:37`), Features section bg FM (`Features.tsx:43`), GetTheApp full bg (`GetTheApp.tsx:139`), VendorPitch CTA hover (`VendorPitch.tsx:125`) |
| `surfaceMuted` | `#F5F5F0` | `--color-surface-muted` | `design-tokens.ts:23` / `globals.css:33` | FeaturedMarkets bg (`FeaturedMarkets.tsx:19`), Hero gradient end FT (`Hero.tsx:38`), feature cards FT (`Features.tsx:88`) |
| `textPrimary` | `#33691E` | `--color-text-primary` | `design-tokens.ts:26` / `globals.css:36` | H2 headings (`HowItWorks.tsx:62`, `FeaturedMarkets.tsx:35`, `Features.tsx:56`), step titles (`HowItWorks.tsx:122`), Footer bg (`Footer.tsx:54`), phone frame border (`GetTheApp.tsx:275`) |
| `textSecondary` | `#558B2F` | `--color-text-secondary` | `design-tokens.ts:27` / `globals.css:37` | Body text (`Hero.tsx:85`), descriptions (`HowItWorks.tsx:132`, `Features.tsx:115`), subtitles (`Features.tsx:67`), feature list text (`GetTheApp.tsx:207`), footer divider (`Footer.tsx:122`) |
| `textMuted` | `#7C8B6F` | `--color-text-muted` | `design-tokens.ts:28` / `globals.css:38` | Trust indicators (`Hero.tsx:137`), link underlines (`HowItWorks.tsx:180`, `FeaturedMarkets.tsx:78`), GetTheApp install tip (`GetTheApp.tsx:255`), search bar placeholder (`GetTheApp.tsx:305`) |
| `textInverse` | `#FFFFFF` | `--color-text-inverse` | `design-tokens.ts:29` / `globals.css:39` | VendorPitch heading/text (`VendorPitch.tsx:43`, `:98`), step badges (`HowItWorks.tsx:111`), circle CTA text (`HowItWorks.tsx:151`), button text (`GetTheApp.tsx:241`) |
| `textInverseMuted` | `rgba(255,255,255,0.85)` | `--color-text-inverse-muted` | `design-tokens.ts:30` / `globals.css:40` | VendorPitch subtitle (`VendorPitch.tsx:53`), VendorPitch description (`VendorPitch.tsx:141`) |
| `border` | `#E8E5E0` | `--color-border` | `design-tokens.ts:33` / `globals.css:49` | Step cards (`HowItWorks.tsx:84`), location badge (`LocationEntry.tsx:102`), input default border (`LocationEntry.tsx:183`), compact GetTheApp borders (`GetTheApp.tsx:56`), search bar (`GetTheApp.tsx:304`) |
| `borderMuted` | `#F0EDE8` | `--color-border-muted` | `design-tokens.ts:34` / `globals.css:50` | (available but not used on landing) |

### Color Tokens — FT (Food Trucks) Red Palette

Defined at `design-tokens.ts:161-187`

| Token Name | Hex | Where Defined | Key Difference from FM |
|-----------|-----|---------------|----------------------|
| `primary` | `#ff5757` | `design-tokens.ts:163` | Red instead of green — all buttons, links, accents turn red |
| `primaryDark` | `#ff3131` | `design-tokens.ts:164` | Bright red hovers/emphasis, VendorPitch bg turns dark red |
| `primaryLight` | `#fff5f5` | `design-tokens.ts:165` | Very light red instead of pale lime |
| `accent` | `#ff3131` | `design-tokens.ts:168` | Same as primaryDark (vs yellow for FM) |
| `accentMuted` | `#b4b4b4` | `design-tokens.ts:169` | Light grey instead of desert sand |
| `surfaceBase` | `#ffffff` | `design-tokens.ts:172` | Pure white instead of warm cream |
| `surfaceSubtle` | `#f5f5f5` | `design-tokens.ts:174` | Neutral grey instead of sunshine yellow |
| `surfaceMuted` | `#f0f0f0` | `design-tokens.ts:175` | Neutral grey instead of warm gray |
| `textPrimary` | `#1a1a1a` | `design-tokens.ts:178` | Near-black instead of deep olive |
| `textSecondary` | `#545454` | `design-tokens.ts:179` | Charcoal instead of olive brown |
| `textMuted` | `#737373` | `design-tokens.ts:180` | Medium grey instead of muted olive |

### Status Colors (Shared Across Verticals)

Defined at `design-tokens.ts:38-69`

| Purpose | Color | Light BG | Border |
|---------|-------|----------|--------|
| Danger | `#dc2626` | `#fef2f2` | `#fca5a5` |
| Success | `#059669` | `#ecfdf5` | `#6ee7b7` |
| Warning | `#d97706` | `#fffbeb` | `#fcd34d` |
| Info | `#2563eb` | `#eff6ff` | `#93c5fd` |

### Typography Scale (Fluid — uses `clamp()`)

Defined at `design-tokens.ts:86-95` (JS) and `globals.css:77-84` (CSS)

| Token | Min | Preferred | Max | Where Used (examples) |
|-------|-----|-----------|-----|----------------------|
| `xs` | 12px | 1.2vw | 13px | Step badges (`HowItWorks.tsx:112`), stat labels (`TrustStats.tsx:78`), error text (`LocationEntry.tsx:240`), privacy notes (`LocationEntry.tsx:253`), check marks (`GetTheApp.tsx:216`) |
| `sm` | 13px | 1.4vw | 14px | Trust indicators (`Hero.tsx:138`), descriptions (`HowItWorks.tsx:130`), feature descriptions (`Features.tsx:113`), help links (`HowItWorks.tsx:176`), footer text (`Footer.tsx:70`, `:88`, `:98`), location badge (`LocationEntry.tsx:103`), compact headline sub (`GetTheApp.tsx:93`) |
| `base` | 15px | 1.6vw | 17px | CTA buttons (`Hero.tsx:113`), body paragraphs (`FeaturedMarkets.tsx:52`), benefit text (`VendorPitch.tsx:97`), input fields (`LocationEntry.tsx:180`), feature list items (`GetTheApp.tsx:206`), install buttons (`GetTheApp.tsx:240`) |
| `lg` | 17px | 1.8vw | 20px | Subheadline (`Hero.tsx:84`), step titles (`HowItWorks.tsx:121`), feature titles (`Features.tsx:105`), circle CTA text (`HowItWorks.tsx:166`), subtitles (`Features.tsx:65`), VendorPitch CTA (`VendorPitch.tsx:117`), compact headline (`GetTheApp.tsx:86`) |
| `xl` | 20px | 2.2vw | 24px | (not heavily used on landing — available for dashboard) |
| `2xl` | 24px | 3vw | 32px | (not used on landing) |
| `3xl` | 28px | 3.5vw | 40px | All H2 section headings: `HowItWorks.tsx:60`, `FeaturedMarkets.tsx:33`, `Features.tsx:54`, `VendorPitch.tsx:41`, `GetTheApp.tsx:178`, `FinalCTA.tsx:34`, stat numbers (`TrustStats.tsx:66`) |
| `4xl` | 32px | 4vw | 48px | Hero H1 only (`Hero.tsx:66`) |

**Font Weights** — defined at `design-tokens.ts:96-101`:
- 400 (normal) — tagline default (`TrustStatsTagline.tsx:29`)
- 500 (medium) — stat labels (`TrustStats.tsx:80`), benefit text (`VendorPitch.tsx:97`), location badge change button (`LocationEntry.tsx:120`)
- 600 (semibold) — CTA buttons (`Hero.tsx:114`), step titles (`HowItWorks.tsx:123`), feature titles (`Features.tsx:107`), install buttons (`GetTheApp.tsx:241`), VendorPitch CTA (`VendorPitch.tsx:118`), footer section titles (`Footer.tsx:86`), submit button (`LocationEntry.tsx:214`)
- 700 (bold) — H1 (`Hero.tsx:67`), all H2s, stat numbers (`TrustStats.tsx:67`), step badges (`HowItWorks.tsx:113`), circle CTA (`HowItWorks.tsx:167`)

**Line Heights** — defined at `design-tokens.ts:102-108`:
- 1.2 (tight) — H1 (`Hero.tsx:68`), GetTheApp H2 (`GetTheApp.tsx:181`)
- 1.5 (normal) — (default)
- 1.6 (relaxed) — subheadline (`Hero.tsx:86`), step descriptions (`HowItWorks.tsx:133`), paragraphs (`FeaturedMarkets.tsx:54`), feature descriptions (`Features.tsx:117`), VendorPitch description (`VendorPitch.tsx:145`), footer brand text (`Footer.tsx:72`), GetTheApp subtitle (`GetTheApp.tsx:190`)

### Spacing Scale (8px Base Unit)

Defined at `design-tokens.ts:73-83` (JS) and `globals.css:57-65` (CSS)

| Token | Value | Where Used (examples) |
|-------|-------|----------------------|
| `3xs` | 4px | Stat number bottom margin (`TrustStats.tsx:70`) |
| `2xs` | 8px | Title bottom margins (`HowItWorks.tsx:125`, `Features.tsx:109`), footer link spacing (`Footer.tsx:93`), location form entry gap (`LocationEntry.tsx:264`), change button padding (`LocationEntry.tsx:122`) |
| `xs` | 12px | CTA button gaps (`Hero.tsx:99`, `FinalCTA.tsx:55`), H2 bottom margins (`HowItWorks.tsx:64`, `Features.tsx:59`, `FinalCTA.tsx:37`), step icon circle margin (`TrustStats.tsx:60`), input/button padding vertical (`LocationEntry.tsx:178`, `:208`), form gap (`LocationEntry.tsx:162`), benefit item gap (`VendorPitch.tsx:75`), feature list check mark span (`GetTheApp.tsx:216`) |
| `sm` | 16px | Card padding (`HowItWorks.tsx:92`, note: uses md=24px), H2 bottom margin (`FeaturedMarkets.tsx:37`, `VendorPitch.tsx:45`, `GetTheApp.tsx:180`), icon bottom margin (`Features.tsx:99`, `HowItWorks.tsx:97`), paragraph bottom margin (`FeaturedMarkets.tsx:55`), button padding vertical (`Hero.tsx:111`, `VendorPitch.tsx:114`, `FinalCTA.tsx:67`), feature list gap (`GetTheApp.tsx:197`), footer section title margin (`Footer.tsx:87`), location badge gap (`LocationEntry.tsx:100`), install tip margin top (`GetTheApp.tsx:253`) |
| `md` | 24px | Grid gaps (`HowItWorks.tsx:73`, `TrustStats.tsx:48`, `Features.tsx:79`), step card padding (`HowItWorks.tsx:86`), feature card padding (`Features.tsx:89`), trust indicator gap (`Hero.tsx:139`), paragraph bottom margin (`FeaturedMarkets.tsx:66`), location saved capsule padding horizontal (`LocationEntry.tsx:101`), input padding horizontal (`LocationEntry.tsx:178`), VendorPitch description top margin (`VendorPitch.tsx:139`), footer copyright padding top (`Footer.tsx:124`), footer bottom padding (`Footer.tsx:55`), compact GetTheApp gap (`GetTheApp.tsx:65`) |
| `lg` | 32px | Section header bottom margin (`VendorPitch.tsx:37`), CTA button padding horizontal (`Hero.tsx:112`, `FinalCTA.tsx:68`, `GetTheApp.tsx:235`), HowItWorks circle margin (`HowItWorks.tsx:145`), FinalCTA subtitle bottom margin (`FinalCTA.tsx:48`), VendorPitch grid bottom margin (`VendorPitch.tsx:66`), footer grid gap/margin (`Footer.tsx:63`), GetTheApp feature list bottom margin (`GetTheApp.tsx:197`), GetTheApp subtitle margin (`GetTheApp.tsx:189`), compact GetTheApp horizontal padding (`GetTheApp.tsx:56`) |
| `xl` | 40px | Section header margin bottom (`HowItWorks.tsx:58`, `Features.tsx:50`), TrustStats padding (`TrustStats.tsx:34`), HowItWorks steps margin bottom (`HowItWorks.tsx:74`), hero button container margin bottom (`Hero.tsx:97`), VendorPitch CTA padding horizontal (`VendorPitch.tsx:115`), GetTheApp grid gap (`GetTheApp.tsx:170`), compact GetTheApp vertical padding (`GetTheApp.tsx:55`) |
| `2xl` | 48px | Hero bottom padding (`Hero.tsx:40`) |
| `3xl` | 64px | Section vertical padding: `HowItWorks.tsx:44`, `FeaturedMarkets.tsx:20` |

**Fluid Spacing (CSS only)** — defined at `globals.css:68-71`:
- `--space-fluid-sm`: clamp(16px, 3vw, 24px)
- `--space-fluid-md`: clamp(24px, 4vw, 40px)
- `--space-fluid-lg`: clamp(32px, 5vw, 64px)
- `--space-fluid-xl`: clamp(48px, 6vw, 80px)
- Used by `.landing-section` (`globals.css:189-194`) for vertical padding

### Container Widths

Defined at `design-tokens.ts:112-119` (JS) and `globals.css:103-107` (CSS)

| Token | CSS Var | JS Value | Where Used |
|-------|---------|----------|------------|
| `sm` | `--container-sm: 640px` | 640px | (modals, forms — not on landing) |
| `md` | `--container-md: 768px` | 768px | (auth pages — not on landing) |
| `lg` | `--container-lg: 820px` | 820px | **All landing sections** via `.landing-container` (`globals.css:179-186`), also explicitly: `Hero.tsx:49`, `TrustStats.tsx:41`, `HowItWorks.tsx:51`, `FeaturedMarkets.tsx:26` |
| `xl` | `--container-xl: 820px (CSS)` | **1024px (JS)** | CSS class matches lg; JS value used in dashboards |
| `wide` | n/a (JS only) | 1200px | (admin panels — not on landing) |
| `max` | `--container-max: 900px (CSS)` | **1400px (JS)** | CSS has smaller value; JS used elsewhere |

**NOTE:** Container mismatch — JS tokens `design-tokens.ts:117-118` define xl=1024px and max=1400px, but CSS `globals.css:106-107` defines xl=820px and max=900px. CSS wins for landing pages since they use CSS classes.

### Border Radius

Defined at `design-tokens.ts:121-127` (JS) and `globals.css:115-119` (CSS)

| Token | Value | Where Used |
|-------|-------|------------|
| `sm` | 6px | Phone mockup product cards (`GetTheApp.tsx:322`), cart button (`GetTheApp.tsx:368`) |
| `md` | 8px | Compact install button (`GetTheApp.tsx:109`), search bar (`GetTheApp.tsx:302`), phone product image circle (`GetTheApp.tsx:335`) |
| `lg` | 12px | Step cards (`HowItWorks.tsx:85`), feature cards (`Features.tsx:90`), compact icon box (`GetTheApp.tsx:74`), install button full (`GetTheApp.tsx:237`), bottom nav (`GetTheApp.tsx:384`) |
| `xl` | 16px | (available — not used on landing) |
| `full` | 9999px | CTA buttons (`Hero.tsx:110`, `FinalCTA.tsx:66`), location input/badge (`LocationEntry.tsx:100`, `:186`), submit button (`LocationEntry.tsx:211`), HowItWorks icon circles (`HowItWorks.tsx:93`), VendorPitch CTA (`VendorPitch.tsx:116`), feature check marks (`GetTheApp.tsx:213`) |

### Shadows

Defined at `design-tokens.ts:129-136` (JS) and `globals.css:124-127` (CSS)

| Token | Value | Where Used |
|-------|-------|------------|
| `sm` | `0 1px 2px rgba(0,0,0,0.05)` | Step cards (`HowItWorks.tsx:87`), feature cards (`Features.tsx:91`), submit button (`LocationEntry.tsx:216`), phone product cards (`GetTheApp.tsx:324`) |
| `md` | `0 4px 6px rgba(0,0,0,0.07)` | Phone bottom nav (`GetTheApp.tsx:387`) |
| `lg` | `0 10px 15px rgba(0,0,0,0.1)` | VendorPitch CTA (`VendorPitch.tsx:120`) |
| `xl` | `0 20px 25px rgba(0,0,0,0.1)` | Phone mockup frame (`GetTheApp.tsx:277`) |
| `primary` | `0 4px 12px rgba(139,195,74,0.3)` (FM) / `rgba(255,87,87,0.25)` (FT) | Circle CTA (`HowItWorks.tsx:153`), install button (`GetTheApp.tsx:243`). FT shadow at `design-tokens.ts:205` |

### Transitions

Defined at `globals.css:132-134`

| Token | Duration | Where Used |
|-------|----------|------------|
| `--transition-fast` | 150ms ease | (available — not explicitly used on landing) |
| `--transition-base` | 200ms ease | Location input focus (`LocationEntry.tsx:193`), submit button hover (`LocationEntry.tsx:215`) |
| `--transition-slow` | 300ms ease | Tagline opacity (`TrustStatsTagline.tsx:28`) |

**Inline transition patterns** (not using tokens):
- `transition: 'all'` — Hero CTA hover, circle CTA hover, VendorPitch CTA hover
- `transition-colors` Tailwind class — Footer links (`Footer.tsx:96`)

---

## 2. Vertical Branding System

### Branding Data Flow

```
Database (verticals.config.branding)
    ↓ fallback if unavailable
defaultBranding (src/lib/branding/defaults.ts)
    ↓ consumed by
Server components: getVerticalConfig() (branding/server.ts) → props to client components
Landing pages: defaultBranding[vertical] used in page.tsx:24,106 for SEO + structured data
Theme injection: getVerticalCSSVars(vertical) (design-tokens.ts:232) → inline style at [vertical]/layout.tsx:23
```

### defaultBranding Per Vertical

Defined at `src/lib/branding/defaults.ts`

**Farmers Market** (`defaults.ts:44-62`):
- `brand_name`: "Fresh Market" (`:46`)
- `domain`: farmersmarketing.app (`:45`)
- `colors.primary`: #2d5016 (`:51`) — NOTE: different from design-tokens #8BC34A
- `colors.secondary`: #6b8e23 (`:52`)
- `logo_path`: /logos/logo-full-color.png (`:49`)
- `tagline`: "Farm Fresh, Locally Grown" (`:48`)

**Food Trucks** (`defaults.ts:25-42`):
- `brand_name`: "Food Truck'n" (`:27`)
- `domain`: foodtruckn.app (`:26`)
- `colors.primary`: #ff5757 (`:32`) — matches design-tokens
- `colors.secondary`: #ff3131 (`:33`)
- `logo_path`: /logos/food-truckn-logo.png (`:29`)
- `tagline`: "Skip the Line. Eat Local." (`:28`)

**Fireworks** (`defaults.ts:6-23`):
- `brand_name`: "Fireworks Stand" (`:8`)
- `domain`: fireworksstand.com (`:7`)
- `colors.primary`: #ff4500 (`:13`)
- `colors.secondary`: #ffa500 (`:14`)
- `logo_path`: /logos/fastwrks-logo.png (`:10`)

### Fonts

**Root layout** (`layout.tsx:2,7-15`):
- Imports `Geist` and `Geist_Mono` from `next/font/google` (`:2`)
- `geistSans` config with `--font-geist-sans` variable (`:7-10`)
- `geistMono` config with `--font-geist-mono` variable (`:12-15`)
- Applied as class names on `<body>` (`:38`)

**Actual body font** (`globals.css:153`):
- `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
- Geist vars are set but the body doesn't reference `var(--font-geist-sans)` — system fonts are used instead

**Special font:** Leckerli One — used for FT brand logo only (loaded on demand)

### Where Branding Is Hardcoded vs Dynamic

| Element | Source | File:Line | Dynamic? |
|---------|--------|-----------|----------|
| Color palette for theming | design-tokens.ts → CSS vars | `design-tokens.ts:232-259` | Yes — vertical switch via `getVerticalCSSVars()` |
| Brand name, tagline, logo | defaultBranding[vertical] | `defaults.ts:6-62` | Yes — per vertical |
| SEO metadata | defaultBranding[vertical].meta | `page.tsx:22-61` | Yes — per vertical |
| Domain mapping | hardcoded fallback map | `branding/server.ts` | Semi — fallback only |
| Landing section bg (FT check) | if/else in component | `Hero.tsx:35-38`, `Features.tsx:43` | Semi — FT-specific branches |
| Feature icon color (FT check) | if/else in component | `Features.tsx:96` | Semi — FT-specific branch |
| Feature card bg (FT check) | if/else in component | `Features.tsx:87-88` | Semi — FT-specific branch |
| Schema.org structured data | Built from branding | `page.tsx:112-157` | Yes |

---

## 3. Landing Page Structure

### Architecture

**Server Component:** `src/app/[vertical]/page.tsx`
- Stats fetch: `page.tsx:64-93` (queries listings, vendor_profiles, markets counts)
- SEO metadata: `page.tsx:22-61`
- Logged-in redirect: `page.tsx:100-103`
- Structured data: `page.tsx:112-157` (Schema.org JSON-LD injected at `:162-165`)
- Section rendering: `page.tsx:167-194`

### Section Render Order (in `page.tsx`)

| Line | Component | What You See in the App |
|------|-----------|------------------------|
| `page.tsx:169` | `<Hero>` | Big headline, subtext, 3 CTA buttons, zip code entry |
| `page.tsx:172` | `<TrustStats>` | Desert sand bar with 3 stats (listings, vendors, markets) |
| `page.tsx:175` | `<HowItWorks>` | White section, 4 step cards, round CTA button |
| `page.tsx:178` | `<FeaturedMarkets>` | Gray section, text-only description of markets |
| `page.tsx:181` | `<Features>` | 2-column grid of feature cards with icons |
| `page.tsx:184` | `<VendorPitch>` | Dark green section, check-mark benefits, white CTA |
| `page.tsx:187` | `<GetTheApp>` | Phone mockup + feature list + install button |
| `page.tsx:190` | `<FinalCTA>` | Gradient section, same 3 CTA buttons as Hero |
| `page.tsx:193` | `<Footer>` | Dark section, 4-column link grid, copyright |

### Section-by-Section Detail

#### 1. Hero (`Hero.tsx` — 159 lines)

**What you see:** The first thing on the page — large headline, subtitle, 3 outlined buttons, trust indicators, zip code entry

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| Section wrapper | `Hero.tsx:33-41` | min-height 650px, gradient background, top padding clamp(100px, 15vh, 140px) |
| Gradient BG (FM) | `Hero.tsx:37` | `surfaceSubtle → surfaceBase` (pale yellow → warm cream) |
| Gradient BG (FT) | `Hero.tsx:38` | `surfaceElevated → surfaceMuted` (white → light gray) |
| Container | `Hero.tsx:47-54` | max-width 820px, horizontal padding clamp(20px, 5vw, 60px) |
| Content area | `Hero.tsx:56-60` | max-width 650px, centered |
| H1 headline | `Hero.tsx:63-71` | 4xl (32-48px), bold, tight line-height, -0.02em letter spacing |
| H1 accent line | `Hero.tsx:76` | Second line of text colored `primaryDark` |
| Subheadline | `Hero.tsx:81-90` | lg (17-20px), secondary color, relaxed line-height, max-width 540px |
| Button container | `Hero.tsx:96-100` | flex, `flex-col sm:flex-row`, gap xs (12px), margin-bottom xl (40px) |
| CTA button (x3) | `Hero.tsx:109-124` | transparent bg, 2px solid primary border, primaryDark text, pill shape (radius.full), min-width 180px, padding 16px/32px |
| CTA hover | `Hero.tsx:119-124` | onMouseEnter: bg fills with `primaryLight` / onMouseLeave: bg back to transparent |
| Trust indicator row | `Hero.tsx:132-153` | flex wrap, gap 24px, textMuted color, sm font |
| Trust dots | `Hero.tsx:146-149` | 8x8px circles, `primary` color, rounded-full |
| LocationEntry | `Hero.tsx:44` | Nested component (see below) |

**CTA button labels** (what the 3 buttons say): `Hero.tsx:101-108` — these come from `verticalLandingContent` at top of file, e.g. "Browse Food Trucks", "Become a Vendor", "Find Markets"

#### LocationEntry (`LocationEntry.tsx` — 294 lines)

**What you see:** Either a capsule showing saved zip code, or a zip code input form

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| Saved location capsule | `LocationEntry.tsx:97-107` | inline-flex, gap 12px, 12px/24px padding, white bg, 1px border, pill shape, sm font |
| MapPin icon | `LocationEntry.tsx:109` | 16x16px, primary color |
| "Change" button | `LocationEntry.tsx:113-127` | No bg/border, primary color, sm font, medium weight |
| Zip input field | `LocationEntry.tsx:177-200` | 180px wide, 12px/24px padding, base font, 2px border, pill shape, white bg |
| Input focus state | `LocationEntry.tsx:189-194` | Border changes to primary, 3px primaryLight box-shadow |
| Input error border | `LocationEntry.tsx:183` | **Hardcoded `#ef4444`** (not from token system) |
| Submit button | `LocationEntry.tsx:202-234` | 180px wide, primary bg, white text, pill shape, sm shadow |
| Submit hover | `LocationEntry.tsx:222-229` | bg darkens to primaryDark, translateY(-1px) lift |
| Error message | `LocationEntry.tsx:237-246` | xs font, **hardcoded `#ef4444`** color |
| Privacy note | `LocationEntry.tsx:250-258` | xs font, textMuted color |

#### 2. Trust Stats (`TrustStats.tsx` — 95 lines)

**What you see:** Horizontal desert sand colored bar with 3 stat numbers (listings, vendors, markets)

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| Section bg | `TrustStats.tsx:33` | `accentMuted` (#BCAAA4 desert sand) |
| Section padding | `TrustStats.tsx:34` | xl (40px) top and bottom |
| Container | `TrustStats.tsx:39-44` | max-width 820px, clamp(20px, 5vw, 60px) horizontal padding |
| 3-column grid | `TrustStats.tsx:46-48` | `grid grid-cols-3`, gap md (24px) |
| Icon circle | `TrustStats.tsx:55-60` | 44x44px, white bg, rounded-full |
| Icon | `TrustStats.tsx:62` | 22x22px, primaryDark color. Icons: Package, Users, Store (Lucide) |
| Stat number | `TrustStats.tsx:65-71` | 3xl (28-40px), bold, primaryDark, line-height 1 |
| Stat label | `TrustStats.tsx:76-82` | xs (12-13px), textPrimary, uppercase, 0.05em letter spacing, medium weight |
| Tagline | `TrustStatsTagline.tsx:21-34` | base font, textSecondary, 0.3s opacity transition |

#### 3. How It Works (`HowItWorks.tsx` — 192 lines)

**What you see:** White section with H2, 4 step cards in a row, a large round green button, and a help link

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| Section bg | `HowItWorks.tsx:43` | `surfaceElevated` (white) |
| Section padding | `HowItWorks.tsx:44` | 3xl (64px) top and bottom |
| H2 heading | `HowItWorks.tsx:58-67` | 3xl, bold, textPrimary, center, margin-bottom xs |
| Steps grid | `HowItWorks.tsx:71-74` | `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, gap md, margin-bottom xl |
| Step card | `HowItWorks.tsx:78-87` | White bg, 1px border, radius lg (12px), padding md (24px), shadow sm |
| Step icon circle | `HowItWorks.tsx:91-100` | 56x56px, primaryLight bg, centered |
| Step icon | `HowItWorks.tsx:99` | 28x28px, primaryDark color. Icons: Search, ShoppingCart, Package, Users |
| Step number badge | `HowItWorks.tsx:101-115` | 22x22px circle, absolute top-right, primary bg, white text, xs font, bold |
| Step title | `HowItWorks.tsx:118-126` | lg, semibold, textPrimary, margin-bottom 2xs (8px) |
| Step description | `HowItWorks.tsx:128-135` | sm, textSecondary, relaxed line-height |
| Circle CTA button | `HowItWorks.tsx:144-162` | 140x140px circle, primary bg, white text, lg bold, primary shadow |
| Circle CTA hover | `HowItWorks.tsx:155-162` | Scale 1.05x, bg to primaryDark |
| Circle CTA text | `HowItWorks.tsx:164-169` | Two `<span>` elements, lg font, bold |
| Help link | `HowItWorks.tsx:173-185` | sm, textSecondary, italic, 1px border-bottom underline |

#### 4. Featured Markets (`FeaturedMarkets.tsx` — 89 lines)

**What you see:** Light gray section with just text — description of what markets are available

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| Section bg | `FeaturedMarkets.tsx:19` | `surfaceMuted` (light warm gray #F5F5F0) |
| Section padding | `FeaturedMarkets.tsx:20` | 3xl (64px) top and bottom |
| H2 heading | `FeaturedMarkets.tsx:31-39` | 3xl, bold, textPrimary, margin-bottom sm (16px) |
| Content wrapper | `FeaturedMarkets.tsx:42` | max-width 640px, auto margins (centered) |
| Paragraph 1 | `FeaturedMarkets.tsx:49-57` | base font, textSecondary, relaxed line-height, margin-bottom sm |
| Paragraph 2 | `FeaturedMarkets.tsx:60-68` | base font, textSecondary, relaxed line-height, margin-bottom md (24px) |
| "Browse" link | `FeaturedMarkets.tsx:71-83` | sm, textSecondary, italic, 1px textMuted border-bottom, 2px padding-bottom |

#### 5. Features (`Features.tsx` — 128 lines)

**What you see:** 2-column grid of feature cards, each with an icon, title, and description

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| Section bg (FM) | `Features.tsx:43` | `surfaceSubtle` (sunshine #FFFDE7) |
| Section bg (FT) | `Features.tsx:43` | `surfaceElevated` (white) — conditional at same line |
| H2 heading | `Features.tsx:52-61` | 3xl, bold, textPrimary, margin-bottom xs |
| Subtitle | `Features.tsx:62-72` | lg, textSecondary, max-width 540px, centered |
| Feature grid | `Features.tsx:76-79` | `grid-cols-1 md:grid-cols-2`, gap md (24px) |
| Feature card bg (FM) | `Features.tsx:87` | `surfaceElevated` (white) |
| Feature card bg (FT) | `Features.tsx:88` | `surfaceMuted` — conditional |
| Feature card shape | `Features.tsx:89-91` | radius lg (12px), padding md (24px), shadow sm |
| Feature icon (FM) | `Features.tsx:96` | 40x40px, `accentMuted` color (desert sand) |
| Feature icon (FT) | `Features.tsx:96` | 40x40px, `primaryDark` color (bright red) — conditional |
| Feature title | `Features.tsx:101-109` | lg, semibold, textPrimary, margin-bottom 2xs (8px) |
| Feature description | `Features.tsx:111-119` | sm, textSecondary, relaxed line-height |

**Icons used:** Shield, Smartphone, MapPin, Bell, CheckCircle, Clock (from Lucide)

#### 6. Vendor Pitch (`VendorPitch.tsx` — 153 lines)

**What you see:** Dark green section with white text — "Sell at Markets" pitch with check-mark benefits and white CTA button

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| Section bg | `VendorPitch.tsx:30` | `primaryDark` (dark green #689F38 FM / dark red #ff3131 FT) |
| H2 heading | `VendorPitch.tsx:39-47` | 3xl, bold, `textInverse` (white), margin-bottom sm |
| Subtitle | `VendorPitch.tsx:49-59` | lg, `textInverseMuted` (white 85%), max-width 540px |
| Benefits grid | `VendorPitch.tsx:63-66` | `grid-cols-1 md:grid-cols-2`, gap sm/xl, max-width 700px, margin-bottom lg |
| Check circle | `VendorPitch.tsx:77-92` | 24x24px, primary bg, flex-shrink-0, margin-top 2px |
| Check icon | `VendorPitch.tsx:86-91` | 14x14px, textInverse (white) |
| Benefit text | `VendorPitch.tsx:94-102` | base font, medium weight, textInverse (white) |
| CTA button | `VendorPitch.tsx:109-133` | White bg (`surfaceElevated`), primaryDark text, pill shape, min-width 220px, padding 16px/40px, shadow lg |
| CTA hover | `VendorPitch.tsx:123-130` | bg to surfaceSubtle, translateY(-2px) |
| Description below | `VendorPitch.tsx:135-147` | sm, textInverseMuted, max-width 480px, relaxed line-height |

#### 7. Get The App (`GetTheApp.tsx` — 405 lines)

**What you see:** Split section — left side has text + feature list + install button, right side has a CSS-drawn phone mockup

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| **FULL VARIANT** | | |
| Section bg | `GetTheApp.tsx:139` | `surfaceSubtle` (sunshine pale) |
| Decorative circle (top-right) | `GetTheApp.tsx:145-154` | 300x300px, primary 8% opacity, absolute top -100 right -100 |
| Decorative circle (bottom-left) | `GetTheApp.tsx:155-164` | 200x200px, accent 8% opacity, absolute bottom -50 left -50 |
| Content grid | `GetTheApp.tsx:167-172` | auto-fit grid, minmax(300px, 1fr), gap xl (40px) |
| H2 heading | `GetTheApp.tsx:175-182` | 3xl, bold, textPrimary, line-height 1.2, margin-bottom sm |
| Subtitle | `GetTheApp.tsx:185-192` | lg, textSecondary, line-height 1.6, margin-bottom lg |
| Feature list | `GetTheApp.tsx:194-226` | ul, no bullets, flex column, gap sm |
| Check mark circle | `GetTheApp.tsx:210-220` | 20x20px, primary 20% bg, full radius, "✓" character, xs font |
| Feature item text | `GetTheApp.tsx:206-207` | base font, textSecondary |
| Install button | `GetTheApp.tsx:229-249` | primary bg, white text, radius lg, 50px min-height, padding sm/xl, primary shadow |
| Install tip | `GetTheApp.tsx:251-258` | sm, textMuted, centered |
| **PHONE MOCKUP** | | |
| Phone frame | `GetTheApp.tsx:267-278` | 280x560px, white bg, 40px border-radius, 8px dark border, xl shadow |
| Notch | `GetTheApp.tsx:278-289` | 120x28px, centered, dark bg, rounded bottom corners |
| Screen bg | `GetTheApp.tsx:292-296` | Gradient: primary 10% → surfaceBase |
| Search bar | `GetTheApp.tsx:298-308` | 8px/12px padding, white bg, md radius, 1px border, 11px font |
| Product grid | `GetTheApp.tsx:311-315` | 2-column grid, 8px gap |
| Product card | `GetTheApp.tsx:318-324` | White bg, sm radius, shadow sm |
| Product image | `GetTheApp.tsx:325-337` | 80px height, tinted bg, 40px centered circle |
| Product name | `GetTheApp.tsx:340-348` | 10px, weight 600, nowrap + ellipsis |
| Product price | `GetTheApp.tsx:351-357` | 11px, weight 700, primary color |
| Cart button | `GetTheApp.tsx:364-375` | Primary bg, sm radius, 11px white text |
| Bottom nav | `GetTheApp.tsx:378-396` | 46px height, white bg, lg radius, shadow md, 4 emoji icons |
| **COMPACT VARIANT** | | |
| Section | `GetTheApp.tsx:54-59` | xl/lg padding, white bg, border top/bottom |
| Icon box | `GetTheApp.tsx:71-80` | 48x48px, primary 15% bg, lg radius |
| Headline | `GetTheApp.tsx:83-89` | lg, semibold, textPrimary |
| Subtitle | `GetTheApp.tsx:91-97` | sm, textSecondary |
| Install button | `GetTheApp.tsx:100-119` | primary bg, white text, md radius, 44px min-height |

#### 8. Final CTA (`FinalCTA.tsx` — 90 lines)

**What you see:** Gradient section mirroring the Hero — "Ready to Get Started?" with same 3 outlined buttons

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| Section bg | `FinalCTA.tsx:22-23` | Gradient: `primaryLight → surfaceBase` |
| Container | `FinalCTA.tsx:27-29` | max-width 700px, centered |
| H2 heading | `FinalCTA.tsx:31-40` | 3xl, bold, textPrimary, margin-bottom xs |
| Subtitle | `FinalCTA.tsx:42-50` | lg, textSecondary, margin-bottom lg |
| Button container | `FinalCTA.tsx:52-55` | flex, `flex-col sm:flex-row`, center, gap xs |
| CTA button (x3) | `FinalCTA.tsx:61-83` | Same as Hero: outlined pill, 180px min-width, primaryDark text |
| CTA hover | `FinalCTA.tsx:75-80` | bg fills with primaryLight |

#### 9. Footer (`Footer.tsx` — 138 lines)

**What you see:** Darkest section at bottom — brand text, 3 link columns, copyright

| Element | File:Line | Visual Properties |
|---------|-----------|-------------------|
| Footer bg | `Footer.tsx:54` | `textPrimary` (deep olive #33691E FM / near-black #1a1a1a FT) |
| Footer padding | `Footer.tsx:55` | xl (40px) top, md (24px) bottom |
| Link grid | `Footer.tsx:61-63` | `grid-cols-2 md:grid-cols-4`, gap lg (32px), margin-bottom lg |
| Brand column | `Footer.tsx:66-76` | col-span-2 on mobile, sm font, accentMuted color, relaxed line-height |
| Section titles (h4) | `Footer.tsx:81-88` | sm, semibold, surfaceSubtle color, margin-bottom sm |
| Links | `Footer.tsx:94-109` | sm, accentMuted color, transition-colors class |
| Link hover | `Footer.tsx:101-106` | Color changes to primary (onMouseEnter/Leave) |
| Link spacing | `Footer.tsx:93` | margin-bottom 2xs (8px) between items |
| Divider | `Footer.tsx:118-122` | 1px solid textSecondary border-top, md padding-top |
| Copyright | `Footer.tsx:124-131` | sm, accentMuted, centered |

---

## 4. Layout & Component Patterns

### Styling Approach: Inline Styles with JS Tokens

The app uses **inline `style={{}}` objects** with values from `design-tokens.ts`. This is the primary (95%+) styling method across the app.

```tsx
// Typical pattern — seen in every landing component:
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
const { sizes, weights, leading } = typography

<div style={{
  backgroundColor: colors.surfaceElevated,  // → 'var(--color-surface-elevated, #FFFFFF)'
  padding: spacing.md,                       // → '24px'
  borderRadius: radius.lg,                   // → '12px'
  boxShadow: shadows.sm,                     // → '0 1px 2px rgba(0,0,0,0.05)'
}}>
```

**Example locations of this pattern:**
- `HowItWorks.tsx:78-87` — step card styling
- `Features.tsx:83-91` — feature card styling
- `VendorPitch.tsx:109-120` — CTA button styling
- `LocationEntry.tsx:177-200` — input field styling

**Why NOT Tailwind?** Despite `@import "tailwindcss"` in `globals.css`, Tailwind utility classes are used sparingly — mostly for responsive layout and a few utilities. The design token system predates or replaces Tailwind for most visual properties.

**Tailwind class usage on landing page (complete list):**
- `flex-col sm:flex-row` — `Hero.tsx:98`, `FinalCTA.tsx:53` (CTA button stacking)
- `grid-cols-1 md:grid-cols-2` — `Features.tsx:77` (feature grid)
- `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` — `HowItWorks.tsx:72` (step grid)
- `grid grid-cols-3` — `TrustStats.tsx:47` (stat columns)
- `grid-cols-2 md:grid-cols-4` — `Footer.tsx:62` (footer grid)
- `col-span-2 md:col-span-1` — `Footer.tsx:66` (brand column)
- `transition-colors` — `Footer.tsx:96` (link hover)
- `rounded-full` — `Hero.tsx:147` (trust dots), `TrustStats.tsx:56` (icon circles)
- `text-center` — multiple components for centered text

**CSS Classes Used (landing only)** — defined at `globals.css:179-208`:
- `.landing-container` (`globals.css:179-186`) — max-width 820px, fluid horizontal padding, centered
- `.landing-section` (`globals.css:189-194`) — flex center, fluid vertical padding
- `.landing-card` (`globals.css:197-208`) — white bg, rounded, shadow, hover shadow transition

### Responsive Strategy

**Mobile-first** (Tailwind breakpoints for layout, `clamp()` for sizing):

| Breakpoint | Pixel Value | Where Used | What Changes |
|-----------|-------------|------------|-------------|
| Default (mobile) | < 640px | everywhere | Single column, stacked CTAs, full-width content |
| `sm:` | 640px | `Hero.tsx:98`, `FinalCTA.tsx:53` | CTA buttons switch from stacked to horizontal row |
| `md:` | 768px | `Features.tsx:77`, `Footer.tsx:62`, `VendorPitch.tsx:64` | Grids switch to 2 columns, footer expands to 4 cols |
| `lg:` | 1024px | `HowItWorks.tsx:72` | Step cards go from 2 columns to 4 columns |

**Fluid scaling** (no breakpoints — scales continuously):
- All font sizes: `clamp()` in every `sizes[...]` token (`design-tokens.ts:87-95`)
- Horizontal padding: `clamp(20px, 5vw, 60px)` at `Hero.tsx:50`, `TrustStats.tsx:43`, `HowItWorks.tsx:53`, `FeaturedMarkets.tsx:28`, and via `.landing-container` (`globals.css:183`)
- Hero top padding: `clamp(100px, 15vh, 140px)` at `Hero.tsx:39`

### Container Strategy

All landing sections use `containers.lg` = 820px (iPad Air width) as max-width:
- Explicit: `Hero.tsx:49`, `TrustStats.tsx:41`, `HowItWorks.tsx:51`, `FeaturedMarkets.tsx:26`
- Via `.landing-container` class: `Features.tsx:46`, `VendorPitch.tsx:33`, `FinalCTA.tsx:28`, `Footer.tsx:59`
- Exception: `GetTheApp.tsx` full variant uses its own grid inside `.landing-container`

On different screen sizes:
- Mobile (< 820px): full-width with ~20px side padding
- Tablet (820px+): content centered, fixed 820px with growing margins
- Desktop (1200px+): same 820px content, generous margins

### Button Patterns (Landing Page)

| Pattern | Where Used | File:Line | Style Description |
|---------|-----------|-----------|-------------------|
| **Outlined pill** | Hero CTAs (x3) | `Hero.tsx:109-124` | Transparent bg, 2px primary border, primaryDark text, radius.full, min-width 180px |
| **Outlined pill** | Final CTA (x3) | `FinalCTA.tsx:61-83` | Same as Hero |
| **Filled primary** | LocationEntry submit | `LocationEntry.tsx:202-234` | Primary bg, white text, pill shape, sm shadow, translateY(-1px) hover |
| **Filled primary** | HowItWorks circle | `HowItWorks.tsx:144-162` | 140x140px circle, primary bg, white text, scale(1.05) hover |
| **Filled primary** | GetTheApp install | `GetTheApp.tsx:229-249` | Primary bg, white text, radius lg, 50px height, primary shadow |
| **Inverted filled** | VendorPitch CTA | `VendorPitch.tsx:109-133` | White bg, primaryDark text, pill shape, min-width 220px, shadow lg, translateY(-2px) hover |
| **Text link** | HowItWorks help | `HowItWorks.tsx:173-185` | sm, italic, 1px border-bottom underline |
| **Text link** | FeaturedMarkets browse | `FeaturedMarkets.tsx:71-83` | sm, italic, 1px border-bottom underline |

### Icon Usage Map

All icons from **Lucide React** library.

| Component | File:Line | Icon | Size | Color | Container |
|-----------|-----------|------|------|-------|-----------|
| LocationEntry | `:109` | MapPin | 16px | primary | none |
| LocationEntry | `:231` | Search | 18px | (in button — white) | none |
| TrustStats | `:62` | Package/Users/Store | 22px | primaryDark | 44px white circle (`:55-60`) |
| HowItWorks | `:99` | Search/ShoppingCart/Package/Users | 28px | primaryDark | 56px primaryLight circle (`:91-100`) |
| Features | `:93-99` | Shield/Smartphone/MapPin/Bell/CheckCircle/Clock | 40px | accentMuted (FM) / primaryDark (FT) | none |
| VendorPitch | `:86-91` | Check | 14px | textInverse | 24px primary circle (`:77-92`) |
| GetTheApp | `:80` (compact) | Smartphone | 24px | primary | 48px tinted box (`:71-80`) |
| GetTheApp | `:247` (full) | Plus | 20px | (in button — white) | none |

### Hover/Interaction Patterns

| Element | File:Line (handler) | Effect | Transition |
|---------|-------------------|--------|------------|
| Hero CTA buttons | `Hero.tsx:119-124` | bg: transparent → primaryLight | `transition: 'all'` |
| FinalCTA buttons | `FinalCTA.tsx:75-80` | bg: transparent → primaryLight | `transition: 'all'` |
| LocationEntry submit | `LocationEntry.tsx:222-229` | bg: primary → primaryDark + translateY(-1px) | `transition: 'background-color 0.2s, transform 0.2s'` |
| LocationEntry input focus | `LocationEntry.tsx:189-194` | border: → primary + 3px primaryLight shadow | `transition: 'border-color 0.2s, box-shadow 0.2s'` |
| HowItWorks circle CTA | `HowItWorks.tsx:155-162` | bg: primary → primaryDark + scale(1.05) | `transition: 'all'` |
| VendorPitch CTA | `VendorPitch.tsx:123-130` | bg: white → surfaceSubtle + translateY(-2px) | `transition: 'all'` |
| Footer links | `Footer.tsx:101-106` | color: accentMuted → primary | Tailwind `transition-colors` class |
| Landing cards (CSS) | `globals.css:204-207` | shadow: sm → md on hover | `transition: box-shadow var(--transition-base)` |

---

## 5. Issues & Inconsistencies Found

### Container Width Mismatch
- **JS tokens** at `design-tokens.ts:117`: `containers.xl = 1024px`
- **JS tokens** at `design-tokens.ts:118`: `containers.max = 1400px`
- **CSS vars** at `globals.css:106`: `--container-xl = 820px`
- **CSS vars** at `globals.css:107`: `--container-max = 900px`
- **Impact:** Landing pages use CSS classes (correct at 820px). Dashboard pages using JS tokens get 1024px. A designer referencing "container xl" would see different widths depending on context.

### Branding Color Mismatch
- **`defaults.ts:51`**: `defaultBranding.farmers_market.colors.primary = '#2d5016'` (deep forest green)
- **`design-tokens.ts:11`**: FM primary = `#8BC34A` (lime green)
- These are completely different greens. Design tokens are used for visual rendering; defaultBranding is used for email headers and SEO metadata. A designer looking at "brand primary" would see different colors depending on context.

### Font Declaration vs Usage
- `layout.tsx:2,7-15` imports Geist Sans/Mono and sets CSS variables
- `globals.css:153` body uses system font stack (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto...`)
- **Geist is loaded but never used.** Available via `var(--font-geist-sans)` but nothing references it.

### Hardcoded Error Color
- `LocationEntry.tsx:183` and `:240` use hardcoded `#ef4444` for error states
- Should use `statusColors.danger` (`#dc2626` at `design-tokens.ts:40`) for consistency

### GetTheApp Is Oversized
- At 405 lines, it's the largest landing component — nearly 2x the next largest (LocationEntry at 294)
- The phone mockup (`GetTheApp.tsx:267-398`) is entirely hand-drawn CSS — 130+ lines of styling
- Product placeholder colors at `GetTheApp.tsx:313` are hardcoded (`#8BC34A`, `#FBC02D`, `#FF7043`, `#7E57C2`)

### FT-Specific Conditional Branches
Instead of being fully token-driven, these locations have `if (vertical === 'food_trucks')` checks:
- `Hero.tsx:35-38` — gradient background color swap
- `Features.tsx:43` — section background swap
- `Features.tsx:87-88` — card background swap
- `Features.tsx:96` — icon color swap
- These work but scale poorly if more verticals are added

### Missing Animation System
- Some hovers use CSS `transition` property inline (`LocationEntry.tsx:193,215`)
- Others use `onMouseEnter`/`onMouseLeave` with state changes (`Hero.tsx:119-124`)
- CSS transition tokens exist (`globals.css:132-134`) but landing components mostly don't reference them
- No entrance animations, scroll reveals, or standardized micro-interactions

### Tailwind vs Inline Style Mix
- Visual properties (colors, padding, fonts): inline styles with design tokens
- Layout (grid columns, flex direction): Tailwind classes
- Hover effects: Mix — some Tailwind (`transition-colors`), some JS state handlers
- This creates a dual system that's harder for a designer to reason about

---

## 6. Quick Reference: Section Background Rhythm

The landing page alternates backgrounds to create visual sections. View this in the app by scrolling the landing page — each section has a distinct background:

```
Section               Background                          File:Line
─────────────────────────────────────────────────────────────────────
Hero                  Gradient (pale yellow → cream)       Hero.tsx:37
TrustStats            Desert sand (#BCAAA4)                TrustStats.tsx:33
HowItWorks            White                                HowItWorks.tsx:43
Featured Markets      Light warm gray (#F5F5F0)            FeaturedMarkets.tsx:19
Features              Sunshine pale (#FFFDE7)              Features.tsx:43
Vendor Pitch          DARK GREEN (#689F38) ← inverted      VendorPitch.tsx:30
Get The App           Sunshine pale (#FFFDE7)              GetTheApp.tsx:139
Final CTA             Gradient (pale lime → cream)         FinalCTA.tsx:22-23
Footer                DEEP OLIVE (#33691E) ← darkest      Footer.tsx:54
```

Pattern: light → warm → white → gray → warm → **DARK** → warm → light → **DARK**

---

## 7. Summary for Designer Communication

### What the designer needs to know:

1. **All visual properties come from a JS token system** (`src/lib/design-tokens.ts`) — colors, spacing, sizes, shadows, radius are defined once and referenced everywhere via inline styles
2. **Two color palettes exist** — FM green (`design-tokens.ts:10-34`) and FT red (`design-tokens.ts:161-187`), switched automatically by vertical
3. **Typography is fluid** — all sizes use CSS `clamp()` and scale smoothly between mobile min and desktop max (`design-tokens.ts:87-95`)
4. **Content is constrained to 820px** (iPad Air width) — set at `globals.css:105` and used by `.landing-container` at `globals.css:179-186`
5. **Buttons have 3 patterns**: outlined pill (`Hero.tsx:109`), filled primary (`HowItWorks.tsx:144`), inverted filled (`VendorPitch.tsx:109`)
6. **No images on the landing page** — everything is text, Lucide icons, and one CSS-drawn phone mockup (`GetTheApp.tsx:267-398`)
7. **Sections alternate backgrounds** in a deliberate light/dark rhythm (see Section 6 above)
8. **Responsive approach:** Mobile-first with fluid scaling. Grid columns increase at `md:` (768px) and `lg:` (1024px). CTAs stack on mobile, go horizontal at `sm:` (640px).
9. **The phone mockup in GetTheApp** is pure CSS/HTML — not an image. It's 130+ lines of hand-drawn UI at `GetTheApp.tsx:267-398`.
10. **Hover effects are subtle** — background fills, small lifts (1-2px translateY), color shifts. All use `onMouseEnter`/`onMouseLeave` handlers or Tailwind `transition-colors`.
