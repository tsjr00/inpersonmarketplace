import type { ErrorCatalogEntry } from '../types'

export const CART_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'ERR_CART_001',
    title: 'Market Not Linked to Listing',
    category: 'CART',
    severity: 'medium',
    description: 'The selected pickup market is not associated with this listing in listing_markets.',
    causes: [
      'Listing is not available at the selected market',
      'listing_markets row does not exist for this listing+market pair',
      'Market dropdown showed a market from a different data source than the validation check',
    ],
    solutions: [
      'Verify listing_markets table has a row for this listing_id + market_id',
      'Check that the listing page market dropdown and cart validation use the same data source',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_CART_002',
    title: 'Inventory Unavailable',
    category: 'CART',
    severity: 'medium',
    description: 'Item not available or insufficient inventory for the requested quantity.',
    causes: [
      'Listing is out of stock',
      'Requested quantity exceeds available inventory',
      'Listing has been unpublished or deactivated',
    ],
    solutions: [
      'Check listing status and quantity in the listings table',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_CART_003',
    title: 'Orders Closed for Market',
    category: 'CART',
    severity: 'low',
    description: 'The market cutoff time has passed and orders are no longer being accepted.',
    causes: [
      'Current time is past the market cutoff window',
      'Market schedule or cutoff_hours configuration',
    ],
    solutions: [
      'Check market_schedules and cutoff_hours for this market',
      'Buyer should try a different pickup location or check back later',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_CART_004',
    title: 'Cart Operation Failed',
    category: 'CART',
    severity: 'high',
    description: 'A database operation on the cart failed unexpectedly.',
    causes: [
      'RLS policy blocking cart access',
      'Database connection issue',
      'Foreign key constraint violation',
    ],
    solutions: [
      'Check cart_items RLS policies',
      'Verify the cart_id and listing_id exist',
    ],
    pgCodes: ['42501', '23503'],
  },
  {
    code: 'ERR_CART_005',
    title: 'Missing Required Fields',
    category: 'CART',
    severity: 'low',
    description: 'Required fields were not provided in the add-to-cart request.',
    causes: [
      'No vertical or listingId in request body',
      'No market selected',
    ],
    solutions: [
      'Ensure the frontend sends vertical, listingId, and marketId',
    ],
    pgCodes: [],
  },
]
