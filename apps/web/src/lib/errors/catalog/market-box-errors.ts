/**
 * Market Box Error Catalog
 *
 * Error codes for market box creation, updates, and subscription operations.
 */

import { ErrorCatalogEntry } from '../types'

export const MARKET_BOX_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'ERR_MBOX_001',
    title: 'Market box creation failed',
    category: 'VENDOR',
    severity: 'medium',
    description: 'Failed to insert market box offering into the database.',
    causes: [
      'Database constraint violation',
      'RLS policy blocking insert',
      'Invalid vendor_profile_id or vertical_id',
      'Database connection issue',
    ],
    solutions: [
      'Verify vendor profile exists and is approved',
      'Check that the pickup_market_id exists and vendor has access',
      'Verify all required fields are provided',
    ],
    pgCodes: ['23503', '42501'], // FK violation, insufficient privilege
  },
  {
    code: 'ERR_MBOX_002',
    title: 'Invalid pickup schedule for traditional market',
    category: 'VENDOR',
    severity: 'low',
    description: 'The selected pickup day/time does not match any of the traditional market\'s operating schedules.',
    causes: [
      'Vendor selected a day/time outside market operating hours',
      'Market schedule was changed after selection',
      'API manipulation bypassing frontend validation',
    ],
    solutions: [
      'Select a pickup day/time that matches the market\'s published schedule',
      'Refresh the page to see updated market schedules',
    ],
  },
  {
    code: 'ERR_MBOX_003',
    title: 'Market box limit reached',
    category: 'VENDOR',
    severity: 'low',
    description: 'Vendor has reached their tier limit for market box offerings.',
    causes: [
      'Standard tier vendor trying to create more than allowed market boxes',
      'All active market box slots are in use',
    ],
    solutions: [
      'Upgrade to premium tier for more market boxes',
      'Deactivate or delete an existing market box',
    ],
  },
  {
    code: 'ERR_MBOX_004',
    title: 'Market not found or inaccessible',
    category: 'VENDOR',
    severity: 'medium',
    description: 'The specified pickup market does not exist or vendor cannot access it.',
    causes: [
      'Market ID is invalid or deleted',
      'Vendor trying to use a market they don\'t have access to',
      'Traditional market not in vendor\'s allowed markets',
    ],
    solutions: [
      'Select a market from the available options',
      'Ensure you have selected a home market or upgraded to premium',
    ],
  },
  {
    code: 'ERR_MBOX_005',
    title: 'Market box update failed',
    category: 'VENDOR',
    severity: 'medium',
    description: 'Failed to update an existing market box offering.',
    causes: [
      'Market box no longer exists',
      'RLS policy blocking update',
      'Trying to update another vendor\'s market box',
    ],
    solutions: [
      'Verify you own this market box',
      'Refresh the page and try again',
    ],
    pgCodes: ['42501'],
  },
  {
    code: 'ERR_MBOX_006',
    title: 'Invalid price',
    category: 'VENDOR',
    severity: 'low',
    description: 'One or more price values are invalid.',
    causes: [
      'Price is less than minimum ($1.00)',
      'Price is not a valid number',
      '8-week price provided without 4-week price',
    ],
    solutions: [
      'Ensure all prices are at least $1.00',
      'Enter valid numeric price values',
    ],
  },
  {
    code: 'ERR_MBOX_007',
    title: 'Missing required fields',
    category: 'VENDOR',
    severity: 'low',
    description: 'One or more required fields are missing from the request.',
    causes: [
      'Form submitted without all required fields',
      'API called with incomplete data',
    ],
    solutions: [
      'Fill in all required fields: name, price, pickup location, day, and time',
    ],
  },
]
