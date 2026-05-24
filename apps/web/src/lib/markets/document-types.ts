/**
 * Type definitions + display metadata for market verification documents
 * (mig 148 / NEW-7).
 *
 * The taxonomy is locked in code so the manager dropdown + admin display
 * stay in sync. Database CHECK constraint on market_documents.document_type
 * enforces the same set — any addition here needs a paired DB migration.
 */

export const DOCUMENT_TYPES = [
  'legal_entity_filing',
  'owners_managers_list',
  'market_website',
  'insurance_coi',
  'venue_proof',
  'other',
] as const

export type MarketDocumentType = typeof DOCUMENT_TYPES[number]

export interface DocumentTypeDefinition {
  value: MarketDocumentType
  label: string
  helpText: string
}

/**
 * Display metadata for each document type. Used by:
 *   - Manager upload form (dropdown label + help text under the picker)
 *   - Admin review list (group docs by type)
 *   - Empty-state copy ("you haven't uploaded a Legal Entity Filing yet")
 */
export const DOCUMENT_TYPE_DEFINITIONS: readonly DocumentTypeDefinition[] = [
  {
    value: 'legal_entity_filing',
    label: 'Legal entity filing',
    helpText:
      'Document showing the entity that operates the market (LLC, partnership, sole proprietorship, etc.) and that you are affiliated with it. State business registration, city/state vendor permit naming the entity, articles of organization, etc.',
  },
  {
    value: 'owners_managers_list',
    label: 'Owners / managers list',
    helpText:
      'Names + contact info of other owners or managers of the market entity. A short typed letter, an operating agreement excerpt, or a screenshot from your secretary of state filing is fine.',
  },
  {
    value: 'market_website',
    label: 'Market website (if any)',
    helpText:
      'Screenshot or URL-as-PDF of the market website if one exists. Helps confirm you are the legitimate operator.',
  },
  {
    value: 'insurance_coi',
    label: 'Certificate of Insurance',
    helpText:
      'COI showing liability coverage for the market. Required for booth-rental fraud protection.',
  },
  {
    value: 'venue_proof',
    label: 'Venue / location proof',
    helpText:
      'Evidence that the market actually operates at the address provided: lease, recent city event permit, dated photo of the market in operation, or vendor sign-up sheet.',
  },
  {
    value: 'other',
    label: 'Other',
    helpText:
      'Anything else that helps us verify legitimacy. Use the notes field to describe what it is.',
  },
] as const

export function getDocumentTypeLabel(value: string): string {
  const def = DOCUMENT_TYPE_DEFINITIONS.find((d) => d.value === value)
  return def?.label ?? value
}

/** Row shape from market_documents table (read-side). */
export interface MarketDocumentRow {
  id: string
  market_id: string
  uploader_user_id: string
  document_type: MarketDocumentType
  storage_path: string
  file_name: string
  file_size_bytes: number
  mime_type: string
  notes: string | null
  uploaded_at: string
  created_at: string
}

/** Allowed mime types — kept in sync with bucket policy in mig 148. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export function isAllowedMime(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
}

/** File size cap in bytes (3MB — matches platform-wide cap from logo/cover image upload routes). */
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024
