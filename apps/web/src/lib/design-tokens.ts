/**
 * FASTWRKS DESIGN SYSTEM - Design Tokens
 * Color Palette: "Sunshine & Sprouts"
 *
 * Industry standard approach: JS tokens for React inline styles
 * These values match the CSS variables in globals.css
 */

export const colors = {
  // Primary Colors (Green - Brand/Action)
  primary: '#8BC34A',           // Lime/new growth - primary CTAs
  primaryDark: '#689F38',       // Grass green - hover states, emphasis
  primaryLight: '#F1F8E9',      // Very pale lime - subtle backgrounds

  // Accent Colors (Golden - Highlights)
  accent: '#FBC02D',            // Sunflower/wheat - highlights, badges
  accentMuted: '#BCAAA4',       // Desert sand - secondary accents

  // Surface Colors (Backgrounds)
  surfaceBase: '#FFFEF7',       // Warm cream - page background
  surfaceElevated: '#FFFFFF',   // Pure white - cards, elevated content
  surfaceSubtle: '#FFFDE7',     // Sunshine - subtle section backgrounds
  surfaceMuted: '#F5F5F0',      // Light warm gray - alternate sections

  // Text Colors (Dark to Light hierarchy)
  textPrimary: '#33691E',       // Deep olive-brown - headings
  textSecondary: '#558B2F',     // Olive brown - body text
  textMuted: '#7C8B6F',         // Muted olive - captions, hints
  textInverse: '#FFFFFF',       // White - text on dark backgrounds
  textInverseMuted: 'rgba(255, 255, 255, 0.85)',

  // Border Colors
  border: '#E8E5E0',
  borderMuted: '#F0EDE8',
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
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px rgba(0, 0, 0, 0.07)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
  primary: '0 4px 12px rgba(139, 195, 74, 0.3)',
  primaryHover: '0 6px 16px rgba(139, 195, 74, 0.4)',
}

// Vertical-specific color palettes
const verticalColorPalettes: Record<string, typeof colors> = {
  food_trucks: {
    // Primary Colors (Red — from Food Truck'n logo)
    primary: '#E53935',           // True red from logo truck + border
    primaryDark: '#C62828',       // Darker red — hover states, emphasis
    primaryLight: '#FFEBEE',      // Very light pink — subtle backgrounds

    // Accent Colors
    accent: '#FF8F00',            // Warm amber — food warmth highlights
    accentMuted: '#B0BEC5',       // Cool gray — secondary accents, icons

    // Surface Colors
    surfaceBase: '#FAFAFA',       // Clean near-white
    surfaceElevated: '#FFFFFF',   // Pure white — cards
    surfaceSubtle: '#FFF3E0',     // Light amber — warm subtle sections
    surfaceMuted: '#F5F5F5',      // Light gray — alternate sections

    // Text Colors (Charcoal — from logo circle background)
    textPrimary: '#4A4A4A',       // Charcoal from logo — headings
    textSecondary: '#666666',     // Medium gray — body text
    textMuted: '#999999',         // Light gray — captions, hints
    textInverse: '#FFFFFF',
    textInverseMuted: 'rgba(255, 255, 255, 0.85)',

    // Border Colors
    border: '#E0E0E0',
    borderMuted: '#EEEEEE',
  },
}

/**
 * Get vertical-specific color palette.
 * Returns the food_trucks red/charcoal palette or default green palette.
 */
export function getVerticalColors(vertical: string): typeof colors {
  return verticalColorPalettes[vertical] || colors
}

// Vertical-specific shadow palettes (primary shadow color matches brand)
const verticalShadowPalettes: Record<string, typeof shadows> = {
  food_trucks: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.07)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
    primary: '0 4px 12px rgba(229, 57, 53, 0.3)',
    primaryHover: '0 6px 16px rgba(229, 57, 53, 0.4)',
  },
}

/**
 * Get vertical-specific shadow palette.
 */
export function getVerticalShadows(vertical: string): typeof shadows {
  return verticalShadowPalettes[vertical] || shadows
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
