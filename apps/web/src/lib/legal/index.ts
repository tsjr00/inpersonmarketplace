export { resolvePlaceholders } from './resolve'
export { verticalPlaceholders } from './placeholders'
export { getPlatformUserAgreement } from './content/platform-user-agreement'
export { getVendorServiceAgreement } from './content/vendor-service-agreement'
export { getVendorPartnerAgreement } from './content/vendor-partner-agreement'
export { getPrivacyPolicy } from './content/privacy-policy'
export type { LegalDocument, LegalSection, VerticalPlaceholders, AgreementType } from './types'

export const CURRENT_AGREEMENT_VERSION = '2026-03-v1'
