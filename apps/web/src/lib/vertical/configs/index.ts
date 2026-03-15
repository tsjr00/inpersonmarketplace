import type { VerticalTerminologyConfig } from '../types'
import { farmersMarketConfig } from './farmers-market'
import { foodTrucksConfig } from './food-trucks'
import { farmersMarketEsConfig } from './farmers-market.es'
import { foodTrucksEsConfig } from './food-trucks.es'

// Registry of all vertical terminology configs
// Add new verticals here as they are created
export const verticalConfigs: Record<string, VerticalTerminologyConfig> = {
  farmers_market: farmersMarketConfig,
  food_trucks: foodTrucksConfig,
}

// Locale-specific overrides — keyed by `${verticalId}:${locale}`
// English ('en') uses the base configs above. Only non-English locales need entries here.
export const localizedConfigs: Record<string, VerticalTerminologyConfig> = {
  'farmers_market:es': farmersMarketEsConfig,
  'food_trucks:es': foodTrucksEsConfig,
}
