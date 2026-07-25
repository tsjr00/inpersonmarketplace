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
  /**
   * F7 (2026-07-24): whether this document is REQUIRED for a legitimate
   * operator. Advisory — labeled + checklisted in the UI, but does NOT block
   * setup; admin still verifies before approving the market. Insurance is NOT
   * a required document — operators self-certify it instead (mig 208).
   */
  required: boolean
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
    label: 'Legal entity',
    helpText:
      'Document showing the entity that operates the market (LLC, partnership, sole proprietorship, etc.) and that you are affiliated with it. State business registration, city/state vendor permit naming the entity, articles of organization, etc.',
    required: true,
  },
  {
    value: 'owners_managers_list',
    label: 'Owners / managers list',
    helpText:
      'The names and email addresses of the other owners or managers of the market entity. A short typed letter, an operating agreement excerpt, or a screenshot from your secretary of state filing is fine — just make sure names and emails are included.',
    required: true,
  },
  {
    value: 'venue_proof',
    label: 'Proof you’re allowed to operate here',
    helpText:
      'A lease, deed, or written agreement showing you have permission to run a market at this address. It needs to identify who granted that permission — the property owner, property manager, and/or the controlling entity — and include their contact info, so we can confirm your right to operate with the party in control of the site.',
    required: true,
  },
  {
    value: 'market_website',
    label: 'Market website (if any)',
    helpText:
      'Screenshot or URL-as-PDF of the market website if one exists. Helps confirm you are the legitimate operator. Optional.',
    required: false,
  },
  {
    value: 'insurance_coi',
    label: 'Certificate of Insurance (optional)',
    helpText:
      'You self-certify your insurance below, so a COI is no longer required — but you may upload one here if you’d like it on file. Optional.',
    required: false,
  },
  {
    value: 'other',
    label: 'Other',
    helpText:
      'Anything else that helps us verify legitimacy. Use the notes field to describe what it is. Optional.',
    required: false,
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
