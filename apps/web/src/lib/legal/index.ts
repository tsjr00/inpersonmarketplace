export { resolvePlaceholders } from './resolve'
export { verticalPlaceholders } from './placeholders'
export { getPlatformUserAgreement } from './content/platform-user-agreement'
export { getVendorServiceAgreement } from './content/vendor-service-agreement'
export { getVendorPartnerAgreement } from './content/vendor-partner-agreement'
export { getPrivacyPolicy } from './content/privacy-policy'
export type { LegalDocument, LegalSection, VerticalPlaceholders, AgreementType } from './types'

// 2026-08-v3: fee-language reframe (owner decision 2026-08-15, scenario 2) —
// same charges (6.5% + $0.15 per side), described as 5% platform + half of
// card processing (1.5% + $0.15) per side; §3.2 confidentiality narrowed to
// custom arrangements so standard rates can be published.
export const CURRENT_AGREEMENT_VERSION = '2026-08-v3'
