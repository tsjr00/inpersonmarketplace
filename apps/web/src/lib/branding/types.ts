export interface VerticalBranding {
  domain: string
  brand_name: string
  tagline: string
  logo_path: string
  favicon: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  meta: {
    title: string
    description: string
    keywords: string
  }
}

export interface VerticalConfig {
  vertical_id: string
  name_public: string
  branding: VerticalBranding
  vendor_fields?: Array<{
    key: string
    label: string
    type: string
    required?: boolean
    options?: string[]
  }>
  config?: Record<string, unknown>
}
