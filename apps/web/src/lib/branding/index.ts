// Client-safe exports only
// For server functions (getVerticalConfig, getAllVerticals, getBrandingByDomain),
// import from '@/lib/branding/server' directly

export type { VerticalBranding, VerticalConfig } from './types'
export { defaultBranding } from './defaults'
