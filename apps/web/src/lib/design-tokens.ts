/**
 * FASTWRKS DESIGN SYSTEM - Design Tokens
 * Color Palette: "Sunshine & Sprouts"
 *
 * Industry standard approach: JS tokens for React inline styles
 * These values match the CSS variables in globals.css
 */

export const colors = {
  // Primary Colors (Green - Brand/Action) — CSS var references with FM defaults
  primary: 'var(--color-primary, #8BC34A)',
  primaryDark: 'var(--color-primary-dark, #689F38)',
  primaryLight: 'var(--color-primary-light, #F1F8E9)',

  // Accent Colors (Golden - Highlights)
  accent: 'var(--color-accent, #FBC02D)',
  accentMuted: 'var(--color-accent-muted, #BCAAA4)',

  // Surface Colors (Backgrounds)
  surfaceBase: 'var(--color-surface-base, #FFFEF7)',
  surfaceElevated: 'var(--color-surface-elevated, #FFFFFF)',
  surfaceSubtle: 'var(--color-surface-subtle, #FFFDE7)',
  surfaceMuted: 'var(--color-surface-muted, #F5F5F0)',

  // Text Colors (Dark to Light hierarchy)
  textPrimary: 'var(--color-text-primary, #33691E)',
  textSecondary: 'var(--color-text-secondary, #558B2F)',
  textMuted: 'var(--color-text-muted, #7C8B6F)',
  textInverse: 'var(--color-text-inverse, #FFFFFF)',
  textInverseMuted: 'var(--color-text-inverse-muted, rgba(255, 255, 255, 0.85))',

  // Border Colors
  border: 'var(--color-border, #E8E5E0)',
  borderMuted: 'var(--color-border-muted, #F0EDE8)',
}

export const spacing = {
  '3xs': '4px',
  '2xs': '8px',
  xs: '12px',
  sm: '16px',
  md: '24px',
  lg: '32px',
  xl: '40px',
  '2xl': '48px',
  '3xl': '64px',
}

export const typography = {
  sizes: {
    xs: 'clamp(12px, 1.2vw, 13px)',
    sm: 'clamp(13px, 1.4vw, 14px)',
    base: 'clamp(15px, 1.6vw, 17px)',
    lg: 'clamp(17px, 1.8vw, 20px)',
    xl: 'clamp(20px, 2.2vw, 24px)',
    '2xl': 'clamp(24px, 3vw, 32px)',
    '3xl': 'clamp(28px, 3.5vw, 40px)',
    '4xl': 'clamp(32px, 4vw, 48px)',
  },
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  leading: {
    tight: 1.2,
    snug: 1.3,
    normal: 1.5,
    relaxed: 1.6,
    loose: 1.8,
  },
}

// Container widths for different page types
export const containers = {
  sm: '640px',      // Narrow forms, modals
  md: '768px',      // Medium content, auth pages
  lg: '820px',      // iPad Air width - landing pages, content-focused
  xl: '1024px',     // Dashboards, data tables
  wide: '1200px',   // Admin panels, complex layouts
  max: '1400px',    // Full-width with margins
}

export const radius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
}

export const shadows = {
  sm: 'var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05))',
  md: 'var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.07))',
  lg: 'var(--shadow-lg, 0 10px 15px rgba(0, 0, 0, 0.1))',
  xl: 'var(--shadow-xl, 0 20px 25px rgba(0, 0, 0, 0.1))',
  primary: 'var(--shadow-primary, 0 4px 12px rgba(139, 195, 74, 0.3))',
  primaryHover: 'var(--shadow-primary-hover, 0 6px 16px rgba(139, 195, 74, 0.4))',
}

// Actual hex color palettes per vertical (used by getVerticalColors/getVerticalCSSVars)
// NOTE: colors export above uses CSS var() references for automatic theming.
// These palettes contain real hex values for cases that need actual colors
// (landing pages, hex+alpha concatenation, etc.)
const verticalColorPalettes: Record<string, typeof colors> = {
  farmers_market: {
    primary: '#8BC34A',
    primaryDark: '#689F38',
    primaryLight: '#F1F8E9',
    accent: '#FBC02D',
    accentMuted: '#BCAAA4',
    surfaceBase: '#FFFEF7',
    surfaceElevated: '#FFFFFF',
    surfaceSubtle: '#FFFDE7',
    surfaceMuted: '#F5F5F0',
    textPrimary: '#33691E',
    textSecondary: '#558B2F',
    textMuted: '#7C8B6F',
    textInverse: '#FFFFFF',
    textInverseMuted: 'rgba(255, 255, 255, 0.85)',
    border: '#E8E5E0',
    borderMuted: '#F0EDE8',
  },
  food_trucks: {
    // Primary Colors (Medium red — brand identity, headers, links, active states)
    primary: '#ff5757',           // Medium red (brand kit) — headers, links
    primaryDark: '#ff3131',       // Bright red (brand kit) — hover, emphasis
    primaryLight: '#fff5f5',      // Very light red — subtle highlight backgrounds

    // Accent Colors
    accent: '#ff3131',            // Bright red — key CTAs, danger/error
    accentMuted: '#b4b4b4',      // Light grey (brand kit) — secondary accents

    // Surface Colors (White-dominant — clean and classic)
    surfaceBase: '#ffffff',       // White — page background
    surfaceElevated: '#ffffff',   // White — cards
    surfaceSubtle: '#f5f5f5',     // Very light grey — alternate sections
    surfaceMuted: '#f0f0f0',      // Light grey — muted sections

    // Text Colors (Black paragraphs, charcoal sub-headers, grey captions)
    textPrimary: '#1a1a1a',       // Near-black — paragraph text
    textSecondary: '#545454',     // Charcoal — sub-headers, labels (brand kit)
    textMuted: '#737373',         // Medium grey — captions, hints (brand kit)
    textInverse: '#FFFFFF',
    textInverseMuted: 'rgba(255, 255, 255, 0.85)',

    // Border Colors
    border: '#e0e0e0',
    borderMuted: '#eeeeee',
  },
}

/**
 * Get vertical-specific color palette.
 * Returns the food_trucks red/charcoal palette or default green palette.
 */
export function getVerticalColors(vertical: string): typeof colors {
  return verticalColorPalettes[vertical] || verticalColorPalettes.farmers_market
}

// Vertical-specific shadow palettes (primary shadow color matches brand)
const verticalShadowPalettes: Record<string, typeof shadows> = {
  food_trucks: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.07)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
    primary: '0 4px 12px rgba(255, 87, 87, 0.25)',
    primaryHover: '0 6px 16px rgba(255, 87, 87, 0.35)',
  },
}

/**
 * Get vertical-specific shadow palette.
 */
// Default FM shadow palette with actual values (not CSS var references)
const defaultShadows: typeof shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px rgba(0, 0, 0, 0.07)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
  primary: '0 4px 12px rgba(139, 195, 74, 0.3)',
  primaryHover: '0 6px 16px rgba(139, 195, 74, 0.4)',
}

export function getVerticalShadows(vertical: string): typeof shadows {
  return verticalShadowPalettes[vertical] || defaultShadows
}

/**
 * Build CSS custom property overrides for a vertical.
 * Inject the returned object as inline style on a wrapper element.
 * Non-FM verticals override the CSS vars; FM uses the defaults (no-op).
 */
export function getVerticalCSSVars(vertical: string): Record<string, string> {
  if (vertical === 'farmers_market' || !verticalColorPalettes[vertical]) return {} // FM uses defaults from globals.css
  const palette = verticalColorPalettes[vertical]

  const shadowPalette = verticalShadowPalettes[vertical]
  return {
    '--color-primary': palette.primary,
    '--color-primary-dark': palette.primaryDark,
    '--color-primary-light': palette.primaryLight,
    '--color-accent': palette.accent,
    '--color-accent-muted': palette.accentMuted,
    '--color-surface-base': palette.surfaceBase,
    '--color-surface-elevated': palette.surfaceElevated,
    '--color-surface-subtle': palette.surfaceSubtle,
    '--color-surface-muted': palette.surfaceMuted,
    '--color-text-primary': palette.textPrimary,
    '--color-text-secondary': palette.textSecondary,
    '--color-text-muted': palette.textMuted,
    '--color-text-inverse': palette.textInverse,
    '--color-text-inverse-muted': palette.textInverseMuted,
    '--color-border': palette.border,
    '--color-border-muted': palette.borderMuted,
    ...(shadowPalette ? {
      '--shadow-primary': shadowPalette.primary,
      '--shadow-primary-hover': shadowPalette.primaryHover,
    } : {}),
  }
}

// Shorthand for common patterns
export const tokens = {
  colors,
  spacing,
  typography,
  containers,
  radius,
  shadows,
}

export default tokens
