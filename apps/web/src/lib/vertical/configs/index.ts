import type { VerticalTerminologyConfig } from '../types'
import { farmersMarketConfig } from './farmers-market'
import { foodTrucksConfig } from './food-trucks'

// Registry of all vertical terminology configs
// Add new verticals here as they are created
export const verticalConfigs: Record<string, VerticalTerminologyConfig> = {
  farmers_market: farmersMarketConfig,
  food_trucks: foodTrucksConfig,
}
