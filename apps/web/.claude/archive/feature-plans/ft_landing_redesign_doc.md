# FT Landing Page Redesign — Implementation Documentation
Date: 2026-02-23

## Goal
Redesign the Food Trucks landing page to match the mockup PDF (7 PNG screenshots in `C:\GitHub\Projects\foodtrucks\`). The mockup colors supersede the prior FT brand kit for buyer-facing pages. FM landing page must remain unchanged — all changes are FT-conditional (`isFT` checks).

## Status: IMPLEMENTATION COMPLETE — NEEDS VERIFICATION & COMMIT

### Verification
- 0 type errors (`npx tsc --noEmit` clean)
- 94 tests pass (`npx vitest run`)
- All changes are FT-conditional — FM landing page untouched

## Files Modified (9 total)
1. **`src/app/[vertical]/page.tsx`** — Skip HowItWorks, FeaturedMarkets, GetTheApp, FinalCTA for FT
2. **`src/components/landing/Hero.tsx`** — Large centered logo, italic accent line, FILLED red pill buttons (uppercase), dotted separator, lifestyle photo
3. **`src/components/landing/TrustStats.tsx`** — Grey bg (#6b6b6b), red circles with white icons, "CONNECTING YOU WITH LOCAL FOOD TRUCKS" header, food-themed icons (UtensilsCrossed, Truck, MapPin)
4. **`src/components/landing/Features.tsx`** — Horizontal list layout (icon-left text-right) with dotted separators between items, icons in red circles with white fill, simplified phone outline + app icon at bottom
5. **`src/components/landing/VendorPitch.tsx`** — Red bg (primary not primaryDark), gold heading (#fcd34d), gold CTA button, CTA above body text, dotted separator at bottom
6. **`src/components/landing/Footer.tsx`** — Food Truck'n logo in brand column, dotted separator above copyright (replaces solid line)
7. **`src/components/landing/index.ts`** — Added DottedSeparator export
8. **NEW `src/components/landing/DottedSeparator.tsx`** — Reusable light grey dotted line separator
9. **NEW `public/images/food-truck-lifestyle.png`** — Copied from `C:\GitHub\Projects\foodtrucks\Food Truck at Night Photo.png`

## Key Design Decisions
- **Dotted separators**: Light grey (#d1d5db), 2px dotted border. Used throughout as section dividers. In dark sections (VendorPitch, Footer), uses rgba white for visibility.
- **CTA buttons**: FT uses FILLED red pills with uppercase + letter-spacing. FM keeps outlined pills.
- **Stats section**: FT uses grey (#6b6b6b) bg with inverted icon circles (red bg, white icons). FM keeps desert sand with white circles.
- **Features layout**: FT uses single-column horizontal list (not 2-col card grid). FM keeps card grid.
- **VendorPitch**: FT uses gold/yellow (#fcd34d) for heading and CTA. FM keeps white.
- **Gold color**: Hardcoded in VendorPitch.tsx (not a design token) because the token system requires all palettes to share the same shape. Only used on FT landing page.
- **Sections removed for FT**: HowItWorks, FeaturedMarkets, GetTheApp, FinalCTA — consolidated into other sections.
- **Hero reorder**: For FT, LocationEntry comes AFTER headline (not before). Logo → dotted line → headline → zip entry → subtitle → CTA buttons → dotted line → lifestyle photo.
- **Feature titles**: FT uses bold italic style. FM uses semibold normal.

## Mockup-to-Implementation Mapping

| Mockup Section | Component | Match Quality |
|---|---|---|
| Nav bar (logo + hamburger) | Header.tsx (already exists) | 1:1 — no changes needed |
| Large centered logo | Hero.tsx — FT conditional | Implemented |
| "Skip the line. Enjoy!" italic | Hero.tsx — FT conditional | Implemented |
| Zip code + Find Local | LocationEntry.tsx (unchanged) | 1:1 |
| Grey stats bar with red circles | TrustStats.tsx — FT conditional | Implemented |
| 3 filled red CTA buttons | Hero.tsx — FT conditional | Implemented |
| Food truck lifestyle photo | Hero.tsx — uses public/images/food-truck-lifestyle.png | Implemented |
| Features horizontal list | Features.tsx — FT conditional | Implemented |
| Simplified phone + app icon | Features.tsx — bottom of FT section | Implemented |
| Red vendor pitch with gold heading | VendorPitch.tsx — FT conditional | Implemented |
| Footer with logo | Footer.tsx — FT conditional | Implemented |
| Grey dotted separators | DottedSeparator.tsx (new) | Implemented |

## Color Palette Used (FT Landing — from mockup)
| Element | Color | Notes |
|---|---|---|
| Primary red | #ff5757 | Buttons, icon circles, vendor pitch bg |
| Hover red | #ff3131 | Button hover states |
| Stats bar bg | #6b6b6b | Grey background for trust stats |
| Gold accent | #fcd34d | Vendor pitch heading + CTA button |
| Gold hover | #fbbf24 | Vendor pitch CTA hover |
| Text dark | #1a1a1a | Headings, body text, footer bg |
| Text secondary | #545454 | Feature descriptions |
| Dotted separator | #d1d5db | Light grey dotted lines |
| White | #ffffff | Page bg, button text, icon fills on red circles |

## Section Flow (FT landing, top to bottom)
1. **Header** — Small logo (left) + hamburger menu (right) — already existed
2. **Hero** — Dotted line → large centered logo → headline + italic accent → zip entry → subtitle → 3 filled red pill buttons → dotted line → lifestyle photo
3. **TrustStats** — Grey bar with "CONNECTING YOU WITH LOCAL FOOD TRUCKS IN YOUR AREA" header, 3 red icon circles (utensils/truck/pin) with white icons, stats below
4. **Features** — Horizontal list: 6 items each with red circle icon (left) + bold italic title + description (right), dotted separators between items, simplified phone outline + app icon at bottom
5. **VendorPitch** — Red bg, gold italic heading "Grow Your Food Truck Business", white subtitle, gold pill CTA "List Your Food Truck", dotted separator
6. **Footer** — Dark charcoal bg, Food Truck'n logo + tagline, 3 link columns (Shoppers/Vendors/Company), dotted separator, copyright

## Sections REMOVED for FT (still present for FM)
- HowItWorks (4 step cards + circle CTA)
- FeaturedMarkets (text-only section)
- GetTheApp (phone mockup + feature checklist — simplified version moved into Features)
- FinalCTA (gradient section with 3 outlined buttons)
