# Current Task: App-Wide Spacing & Padding Standardization
Started: 2026-03-03

## Goal
Replace hardcoded padding/margin/gap values across 11 component files with design token references. Add sizing presets to design-tokens.ts. Make interactive elements consistently tighter (38px for controls, 44px for CTAs).

## Prior Session Context
- Listing availability fix COMPLETE (committed `78014ce`, migration 067 applied all 3 envs, pushed to prod)
- MarketFilters layout fix COMPLETE (committed `e39706f`, pushed to prod)
- Main and staging synced with origin/main

## Plan File
`C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md` — full 5-batch plan

## Key Decisions Made
- **Sizing presets added to design-tokens.ts**: `sizing.control` (8px 12px, 38px, sm font), `sizing.cta` (12px 24px, 44px, base font), `sizing.badge` (4px 8px, xs font, pill radius)
- **No new shared components** — keep inline style pattern, just replace hardcoded values with tokens
- **Landing page pill shapes preserved** — ComingSoonForm keeps borderRadius: '24px'/'9999px'
- **Qty +/- buttons left as-is** — intentionally compact (28px)
- **MarketFilters.tsx already fixed** in previous commit `e39706f` — that's the reference

## What's Been Completed
- [x] **Batch 0**: `src/lib/design-tokens.ts` — added `sizing` export with control/cta/badge presets + added to `tokens` shorthand
- [x] **Batch 1a**: `src/app/[vertical]/browse/SearchFilter.tsx` — full rewrite, all hardcoded → design tokens
- [x] **Batch 1b**: `src/components/vendor/OrderFilters.tsx` — full rewrite, all hardcoded → design tokens, shared selectStyle/labelStyle
- [x] **Batch 2a**: `src/components/cart/AddToCartButton.tsx` — CTA button → sizing.cta, date/time selection → sizing.control, hardcoded borders → colors.border
- [x] **Batch 2b**: `src/components/cart/CartDrawer.tsx` — header/content/footer padding → spacing tokens, CTA → sizing.cta, banners → statusColors, cart items → spacing.sm
- [x] **Batch 3a**: `src/components/support/SupportForm.tsx` — full rewrite, inputStyle/labelStyle → tokens, submit → sizing.cta, error → statusColors
- [x] **Batch 3b**: `src/components/vendor/ProfileEditForm.tsx` — full rewrite, all hardcoded → tokens, premium badges → sizing.badge
- [x] **Batch 3c**: `src/components/landing/ComingSoonForm.tsx` — inputStyle padding/fontSize → sizing.control, submit → sizing.cta, error → statusColors (kept pill borderRadius)
- [x] **Batch 4a**: `src/components/shared/TierBadge.tsx` — full rewrite, hardcoded sizes → typography/spacing tokens

## What's Remaining
- [ ] **Batch 4b**: `src/components/analytics/DateRangePicker.tsx` — buttonStyle needs sizing.control values, date inputs need tokens, gaps need spacing tokens. FILE ALREADY READ — see current content below.
- [ ] **Batch 4c**: `src/components/vendor/MarketSelector.tsx` — structural spacing (padding/gap/borderRadius hardcoded → tokens). NOT YET READ.
- [ ] Run `npx tsc --noEmit` — last check was clean after Batch 3 (Batch 4a TierBadge not yet checked)
- [ ] Run `npx vitest run` — need to verify all tests pass
- [ ] Commit all changes
- [ ] Push to staging

## DateRangePicker.tsx Key Replacements Needed
```
Line 92: padding: '8px 16px' → sizing.control.padding
Line 93: borderRadius: 6 → sizing.control.borderRadius
Line 95: fontSize: 14 → sizing.control.fontSize
Line 109: gap: 8 → spacing['2xs']
Line 148: marginTop: 12 → spacing.xs
Line 149: padding: 12 → spacing.xs
Line 150: backgroundColor: '#f9fafb' → statusColors.neutral50
Line 151: borderRadius: 8 → radius.md
Line 153: gap: 12 → spacing.xs
Line 158: fontSize: 12 → typography.sizes.xs, marginBottom: 4 → spacing['3xs']
Line 167-170: date inputs padding: '8px 12px', borderRadius: 4, fontSize: 14 → sizing.control values
Line 192-200: Apply btn same pattern
```

## MarketSelector.tsx Key Replacements Needed
Already imports colors. Add spacing/radius. Replace:
- padding: 12/16 → spacing.xs/spacing.sm
- borderRadius: 8 → radius.md
- gap: 10/24 → spacing['2xs']/spacing.md
- marginBottom: 12 → spacing.xs
- marginRight: 12 → spacing.xs
- Repeats for eventMarkets and privateMarkets sections (same pattern x3)

## Files Modified (all uncommitted)
1. `src/lib/design-tokens.ts` — added sizing export
2. `src/app/[vertical]/browse/SearchFilter.tsx` — full token conversion
3. `src/components/vendor/OrderFilters.tsx` — full token conversion
4. `src/components/cart/AddToCartButton.tsx` — CTA + selection buttons
5. `src/components/cart/CartDrawer.tsx` — all padding/spacing
6. `src/components/support/SupportForm.tsx` — full token conversion
7. `src/components/vendor/ProfileEditForm.tsx` — full token conversion
8. `src/components/landing/ComingSoonForm.tsx` — input/button/error tokens
9. `src/components/shared/TierBadge.tsx` — badge size presets

## Sizing Presets Reference (in design-tokens.ts)
```typescript
export const sizing = {
  control: { padding: '8px 12px', fontSize: sm, borderRadius: '6px', minHeight: '38px' },
  cta: { padding: '12px 24px', fontSize: base, borderRadius: '8px', minHeight: '44px' },
  badge: { padding: '4px 8px', fontSize: xs, borderRadius: '9999px' },
}
```

## Git State
- Branch: main, up to date with origin/main (pushed to prod last commit `e39706f`)
- All Batch 0 through 4a changes are UNCOMMITTED
- tsc clean after Batch 3 (Batch 4a not yet checked)

## Gotchas / Watch Out For
- `sizing` properties are strings (e.g., minHeight: '38px') — works with inline styles
- ComingSoonForm keeps pill borderRadius intentionally — don't replace with radius tokens
- CartDrawer uses `statusColors` for neutral greys (neutral50, neutral200, etc.) — not `colors`
- OrderFilters pickup date select has conditional active styling (blue border/bg when selected) — preserved with statusColors.info/infoLight
- AddToCartButton has many small internal elements (11-13px fonts) that are intentionally compact — don't touch
- MarketSelector has 3 repeating sections (traditional, event, private) — same spacing pattern applies to all 3
