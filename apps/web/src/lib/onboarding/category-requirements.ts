/**
 * Vendor Onboarding Requirements
 *
 * Farmers Market: Maps product categories to regulatory document requirements
 * based on Texas Department of State Health Services rules.
 *
 * Food Trucks: Universal permit requirements — all food trucks need the same
 * permits regardless of cuisine type (TX DSHS + local health dept).
 *
 * TODO: These requirements are Texas-specific. When expanding to other states,
 * parameterize by state/jurisdiction — each state has different cottage food laws,
 * mobile food unit regulations, and permit requirements.
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

/**
 * JURISDICTION NOTICE: All permit requirements below are specific to Texas.
 * This disclaimer should be shown to users in the signup flow.
 */
export const JURISDICTION_DISCLAIMER = 'Permit requirements shown are based on Texas state regulations. Requirements may differ in other states.'

// Safe default for categories not in the lookup (e.g., new categories added to DB but not to code)
const DEFAULT_REQUIREMENT: CategoryRequirement = {
  level: 'none',
  label: 'Unknown Category',
  description: 'This category does not have specific permit requirements configured.',
  acceptedDocTypes: [],
}

export function getCategoryRequirement(category: Category): CategoryRequirement {
  return CATEGORY_REQUIREMENTS[category] || DEFAULT_REQUIREMENT
}

export function getRequiredDocTypes(category: Category): DocType[] {
  return (CATEGORY_REQUIREMENTS[category] || DEFAULT_REQUIREMENT).acceptedDocTypes
}

export function requiresDocuments(category: Category): boolean {
  const req = CATEGORY_REQUIREMENTS[category]
  if (!req) return false
  return req.level !== 'none'
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

// Vertical-specific prohibited items
// starred = conditional/regulatory (rendered differently in UI)
export interface ProhibitedItem {
  item: string
  description: string
  starred?: boolean
}

export const PROHIBITED_ITEMS_FT: ProhibitedItem[] = [
  { item: 'Controlled substances', description: 'Including THC/CBD products regardless of legal status' },
  { item: 'Alcohol', description: 'All alcoholic beverages' },
  { item: 'Tobacco & nicotine products', description: 'All tobacco and nicotine products' },
  { item: 'Recalled or adulterated food products', description: 'Products subject to recall, adulterated, or misbranded' },
  { item: 'Counterfeit or trademarked goods', description: 'Unauthorized use of trademarks or counterfeit products' },
  { item: 'Pre-packaged food items not prepared by you', description: 'Chips, bottled water, etc. — these items may be included as part of a meal combo but cannot be sold individually as standalone items', starred: true },
]

export const PROHIBITED_ITEMS_FM: ProhibitedItem[] = [
  { item: 'Controlled substances', description: 'Including THC/CBD products regardless of legal status' },
  { item: 'Firearms & ammunition', description: 'Including weapon accessories' },
  { item: 'Explosives & fireworks', description: 'All explosive materials' },
  { item: 'Tobacco & nicotine products', description: 'All tobacco and nicotine products' },
  { item: 'Alcohol', description: 'All alcoholic beverages' },
  { item: 'Recalled or adulterated products', description: 'Products subject to recall, adulterated, or misbranded' },
  { item: 'Resale items not produced by you', description: 'Items you did not produce, grow, or make yourself' },
  { item: 'Counterfeit or trademarked goods', description: 'Unauthorized use of trademarks or counterfeit products' },
  { item: 'Raw (unpasteurized) milk', description: 'Unpasteurized milk products', starred: true },
  { item: 'Live animals', description: 'No live animal sales', starred: true },
]

export const PROHIBITED_ITEMS_DISCLAIMER = 'Prohibited based on current Texas state law and platform guidance. Prohibited items may change as laws and regulatory guidance evolve.'

/** Get prohibited items for a vertical */
export function getProhibitedItems(vertical: string): ProhibitedItem[] {
  if (vertical === 'food_trucks') return PROHIBITED_ITEMS_FT
  if (vertical === 'farmers_market') return PROHIBITED_ITEMS_FM
  // Default: union of both lists (fireworks or unknown verticals)
  return [...PROHIBITED_ITEMS_FM]
}

// Legacy: keep for backward compatibility with existing code that imports PROHIBITED_ITEMS
export const PROHIBITED_ITEMS = PROHIBITED_ITEMS_FM

// ============================================================
// Food Truck Permit Requirements (Texas)
// ============================================================

export type FoodTruckDocType =
  | 'mfu_permit'
  | 'cfm_certificate'
  | 'food_handler_card'
  | 'fire_safety_certificate'
  | 'commissary_agreement'

export interface FoodTruckPermitRequirement {
  docType: FoodTruckDocType
  label: string
  description: string
  required: boolean
}

export const FOOD_TRUCK_PERMIT_REQUIREMENTS: FoodTruckPermitRequirement[] = [
  {
    docType: 'mfu_permit',
    label: 'Mobile Food Unit (MFU) Permit',
    description: 'TX DSHS or local health department mobile food vendor permit. Required for all mobile food operations.',
    required: true,
  },
  {
    docType: 'cfm_certificate',
    label: 'Certified Food Manager (CFM)',
    description: 'At least one Certified Food Manager must be on duty at all times. Valid for 5 years.',
    required: true,
  },
  {
    docType: 'food_handler_card',
    label: "Food Handler's Card",
    description: 'Required for every food service employee within 30 days of hire. Valid for 2 years.',
    required: true,
  },
  {
    docType: 'fire_safety_certificate',
    label: 'Fire Safety Certificate',
    description: 'Local Fire Marshal inspection certificate (NFPA 96 compliance). Renewed annually.',
    required: true,
  },
  {
    docType: 'commissary_agreement',
    label: 'Commissary Agreement',
    description: 'Agreement with a licensed commercial kitchen for food prep and storage. Required in most Texas cities.',
    required: false,
  },
]

export const FOOD_TRUCK_DOC_TYPES: FoodTruckDocType[] =
  FOOD_TRUCK_PERMIT_REQUIREMENTS.map((p) => p.docType)

export const FOOD_TRUCK_DOC_TYPE_LABELS: Record<FoodTruckDocType, string> = {
  mfu_permit: 'Mobile Food Unit Permit',
  cfm_certificate: 'Certified Food Manager Certificate',
  food_handler_card: "Food Handler's Card",
  fire_safety_certificate: 'Fire Safety Certificate',
  commissary_agreement: 'Commissary Agreement',
}

export const FOOD_TRUCK_PROHIBITED_ITEMS = [
  { item: 'Controlled substances', description: 'Including THC/CBD products regardless of legal status' },
  { item: 'Firearms & ammunition', description: 'Including weapon accessories' },
  { item: 'Explosives & fireworks', description: 'All explosive materials' },
  { item: 'Tobacco & nicotine products', description: 'All tobacco and nicotine products' },
  { item: 'Alcohol', description: 'All alcoholic beverages (unless properly licensed)' },
  { item: 'Food from non-inspected sources', description: 'All food must be prepared in your truck or approved commissary kitchen' },
  { item: 'Recalled or adulterated products', description: 'Products subject to recall, adulterated, or misbranded' },
  { item: 'Counterfeit or trademarked goods', description: 'Unauthorized use of trademarks or counterfeit products' },
] as const

export function getVerticalProhibitedItems(vertical: string) {
  return vertical === 'food_trucks' ? FOOD_TRUCK_PROHIBITED_ITEMS : PROHIBITED_ITEMS
}

// ============================================================
// Badge Configuration — Unified Documents & Certifications
// ============================================================

export interface BadgeConfig {
  icon: string
  label: string
  color: string
  bg: string
}

/** Badge configs for FM gate document types (shown on vendor profile when approved) */
export const FM_DOC_BADGES: Partial<Record<DocType, BadgeConfig>> = {
  cottage_food_ack: { icon: '🏠', label: 'Cottage Food', color: '#d97706', bg: '#fef3c7' },
  dshs_temp_food_permit: { icon: '✓', label: 'Health Dept Approved', color: '#059669', bg: '#d1fae5' },
  processing_facility_compliance: { icon: '✓', label: 'Processing Compliant', color: '#0284c7', bg: '#dbeafe' },
}

/** Badge configs for FT permit types (shown on vendor profile when approved) */
export const FT_PERMIT_BADGES: Record<FoodTruckDocType, BadgeConfig> = {
  mfu_permit: { icon: '🚚', label: 'Licensed Mobile Food Unit', color: '#d97706', bg: '#fef3c7' },
  cfm_certificate: { icon: '👨‍🍳', label: 'Certified Food Manager', color: '#059669', bg: '#d1fae5' },
  food_handler_card: { icon: '🍴', label: 'Food Safety Trained', color: '#0284c7', bg: '#dbeafe' },
  fire_safety_certificate: { icon: '🔥', label: 'Fire Safety Certified', color: '#dc2626', bg: '#fee2e2' },
  commissary_agreement: { icon: '🏪', label: 'Commissary Approved', color: '#7c3aed', bg: '#ede9fe' },
}

/** Badge configs for voluntary certifications (from vendor_profiles.certifications) */
export const VOLUNTARY_CERT_BADGES: Record<string, BadgeConfig> = {
  cottage_goods: { icon: '🏠', label: 'Cottage Food', color: '#d97706', bg: '#fef3c7' },
  organic: { icon: '🌱', label: 'Certified Organic', color: '#059669', bg: '#d1fae5' },
  regenerative: { icon: '♻️', label: 'Regenerative', color: '#0284c7', bg: '#dbeafe' },
  gap_certified: { icon: '✓', label: 'GAP Certified', color: '#7c3aed', bg: '#ede9fe' },
  other: { icon: '📜', label: 'Certified', color: '#6b7280', bg: '#f3f4f6' },
}

/** COI badge — separate because COI is Gate 3 (soft gate) */
export const COI_BADGE: BadgeConfig = { icon: '🛡️', label: 'Insured', color: '#059669', bg: '#d1fae5' }

/**
 * Maps gate doc types to equivalent voluntary cert types for deduplication.
 * On the public profile, if a vendor has both cottage_food_ack (gate approved)
 * and cottage_goods (voluntary cert), show only one badge.
 */
export const GATE_TO_CERT_EQUIV: Record<string, string> = {
  cottage_food_ack: 'cottage_goods',
}
