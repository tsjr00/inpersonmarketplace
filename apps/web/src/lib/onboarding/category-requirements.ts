/**
 * TX DSHS Category Requirements for Vendor Onboarding
 *
 * Maps product categories to their regulatory document requirements
 * based on Texas Department of State Health Services rules.
 */

import type { Category } from '@/lib/constants'

export type RequirementLevel =
  | 'none'                  // No permits needed (produce, plants, artisan goods)
  | 'cottage_food_or_dshs'  // Cottage food acknowledgment OR DSHS temp food permit
  | 'dshs_permit'           // DSHS temp food establishment permit required
  | 'dshs_plus_processing'  // DSHS permit + processing facility compliance

export type DocType =
  | 'cottage_food_ack'
  | 'dshs_temp_food_permit'
  | 'processing_facility_compliance'

export interface CategoryRequirement {
  level: RequirementLevel
  label: string
  description: string
  acceptedDocTypes: DocType[]
}

const CATEGORY_REQUIREMENTS: Record<Category, CategoryRequirement> = {
  'Produce': {
    level: 'none',
    label: 'No permits required',
    description: 'Fresh fruits and vegetables do not require permits for direct sales at farmers markets in Texas.',
    acceptedDocTypes: [],
  },
  'Plants & Flowers': {
    level: 'none',
    label: 'No permits required',
    description: 'Live plants, flowers, and nursery stock do not require food safety permits.',
    acceptedDocTypes: [],
  },
  'Art & Decor': {
    level: 'none',
    label: 'No permits required',
    description: 'Art, crafts, and decorative items do not require food safety permits.',
    acceptedDocTypes: [],
  },
  'Clothing & Fashion': {
    level: 'none',
    label: 'No permits required',
    description: 'Clothing and fashion items do not require food safety permits.',
    acceptedDocTypes: [],
  },
  'Home & Functional': {
    level: 'none',
    label: 'No permits required',
    description: 'Home goods and functional items do not require food safety permits.',
    acceptedDocTypes: [],
  },
  'Health & Wellness': {
    level: 'none',
    label: 'No permits required',
    description: 'Non-food health and wellness products do not require food safety permits.',
    acceptedDocTypes: [],
  },
  'Baked Goods': {
    level: 'cottage_food_or_dshs',
    label: 'Cottage food acknowledgment or DSHS permit',
    description: 'Baked goods can be sold under the Texas Cottage Food Law (home kitchen, under $75,000/year) or with a DSHS Temporary Food Establishment permit.',
    acceptedDocTypes: ['cottage_food_ack', 'dshs_temp_food_permit'],
  },
  'Pantry': {
    level: 'cottage_food_or_dshs',
    label: 'Cottage food acknowledgment or DSHS permit',
    description: 'Shelf-stable items like jams, honey, and pickles can be sold under the Texas Cottage Food Law or with a DSHS Temporary Food Establishment permit.',
    acceptedDocTypes: ['cottage_food_ack', 'dshs_temp_food_permit'],
  },
  'Dairy & Eggs': {
    level: 'dshs_permit',
    label: 'DSHS permit required',
    description: 'Dairy products and eggs require a Texas DSHS Temporary Food Establishment permit for sale at farmers markets.',
    acceptedDocTypes: ['dshs_temp_food_permit'],
  },
  'Prepared Foods': {
    level: 'dshs_permit',
    label: 'DSHS permit required',
    description: 'Prepared foods require a Texas DSHS Temporary Food Establishment permit for sale at farmers markets.',
    acceptedDocTypes: ['dshs_temp_food_permit'],
  },
  'Meat & Poultry': {
    level: 'dshs_plus_processing',
    label: 'DSHS permit + processing facility compliance',
    description: 'Meat and poultry require a DSHS Temporary Food Establishment permit and documentation of processing facility compliance.',
    acceptedDocTypes: ['dshs_temp_food_permit', 'processing_facility_compliance'],
  },
}

export function getCategoryRequirement(category: Category): CategoryRequirement {
  return CATEGORY_REQUIREMENTS[category]
}

export function getRequiredDocTypes(category: Category): DocType[] {
  return CATEGORY_REQUIREMENTS[category].acceptedDocTypes
}

export function requiresDocuments(category: Category): boolean {
  return CATEGORY_REQUIREMENTS[category].level !== 'none'
}

export function getCategoriesRequiringDocs(): Category[] {
  return (Object.keys(CATEGORY_REQUIREMENTS) as Category[]).filter(
    (cat) => CATEGORY_REQUIREMENTS[cat].level !== 'none'
  )
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  cottage_food_ack: 'Cottage Food Acknowledgment',
  dshs_temp_food_permit: 'DSHS Temporary Food Establishment Permit',
  processing_facility_compliance: 'Processing Facility Compliance Documentation',
}

export const PROHIBITED_ITEMS = [
  { item: 'Controlled substances', description: 'Including THC/CBD products regardless of legal status' },
  { item: 'Firearms & ammunition', description: 'Including weapon accessories' },
  { item: 'Explosives & fireworks', description: 'All explosive materials' },
  { item: 'Tobacco & nicotine products', description: 'All tobacco and nicotine products' },
  { item: 'Alcohol', description: 'All alcoholic beverages' },
  { item: 'Raw (unpasteurized) milk', description: 'Unpasteurized milk products' },
  { item: 'Live animals', description: 'No live animal sales' },
  { item: 'Recalled or adulterated products', description: 'Products subject to recall, adulterated, or misbranded' },
  { item: 'Resale or wholesale items', description: 'Items not produced by the vendor' },
  { item: 'Counterfeit or trademarked goods', description: 'Unauthorized use of trademarks or counterfeit products' },
] as const
