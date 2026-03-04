export interface LegalSection {
  id: string
  title: string
  level: 'article' | 'section'
  content: string[]
  subsections?: LegalSection[]
}

export interface LegalDocument {
  type: AgreementType | 'privacy_policy'
  title: string
  subtitle?: string
  lastUpdated: string
  preamble: string[]
  sections: LegalSection[]
}

export interface VerticalPlaceholders {
  PLATFORM_NAME: string
  PLATFORM_DOMAIN: string
  VERTICAL_MARKET_TERM: string
  VERTICAL_BOX_TERM: string
  VERTICAL_BOX_TYPES: string
  GRACE_PERIOD: string
  SMALL_ORDER_THRESHOLD: string
  SMALL_ORDER_FEE: string
  VENDOR_TIERS: string
  TRIAL_TERMS: string | null
}

export type AgreementType = 'platform_user' | 'vendor_service' | 'vendor_partner'
