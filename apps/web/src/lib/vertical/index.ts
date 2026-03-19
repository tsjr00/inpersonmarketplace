// Public API for vertical terminology system
export { term, getContent, getVerticalTerminologyConfig, hasTerminologyConfig, getRadiusOptions, isBuyerPremiumEnabled } from './terminology'
export type { TerminologyKey, VerticalTerminology, VerticalContent, VerticalTerminologyConfig, VerticalFeatureConfig, FeatureBlock } from './types'

/** Verticals that support the event/catering system */
const EVENT_ENABLED_VERTICALS = ['food_trucks', 'farmers_market']

/** Check if a vertical supports events/catering */
export function isEventEnabled(vertical: string): boolean {
  return EVENT_ENABLED_VERTICALS.includes(vertical)
}
