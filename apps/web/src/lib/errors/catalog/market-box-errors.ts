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
    userGuidance: 'Something went wrong creating your box. Please try again.',
    retryable: true,
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
    userGuidance: 'The pickup time you selected doesn\'t match this market\'s schedule. Please choose a different time.',
    selfResolvable: true,
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
    userGuidance: 'You\'ve reached your limit for boxes. Upgrade your plan or deactivate an existing box to create a new one.',
    selfResolvable: true,
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
    userGuidance: 'This pickup location isn\'t available. Please select a different one.',
    selfResolvable: true,
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
    userGuidance: 'Couldn\'t update this box. Please refresh the page and try again.',
    retryable: true,
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
    userGuidance: 'Please enter a valid price (minimum $1.00).',
    selfResolvable: true,
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
    userGuidance: 'Please fill in all required fields before saving.',
    selfResolvable: true,
    causes: [
      'Form submitted without all required fields',
      'API called with incomplete data',
    ],
    solutions: [
      'Fill in all required fields: name, price, pickup location, day, and time',
    ],
  },
  {
    code: 'ERR_PAYOUT_003',
    title: 'Market Box Payout Record Insert Failed',
    category: 'STRIPE',
    severity: 'high',
    description: 'Could not insert the pending vendor_payouts row for a market box payout. The payout was aborted BEFORE any transfer — the vendor has not been paid and no payout record exists.',
    userGuidance: '',
    causes: [
      'Database constraint violation (other than the 23505 duplicate race, which is ignored)',
      'vendor_payouts schema change not reflected in the insert',
      'Database connection issue',
    ],
    solutions: [
      'Check the insert error message in the log for the failing constraint',
      'Manually process the payout for the subscription in the error message once resolved',
    ],
  },
  {
    code: 'ERR_PAYOUT_004',
    title: 'Market Box Payout Unhandled Error',
    category: 'STRIPE',
    severity: 'high',
    description: 'processMarketBoxPayout threw an unexpected error (catch-all). Payout state depends on where it threw — check for a vendor_payouts row for the subscription.',
    userGuidance: '',
    causes: [
      'Stripe API error outside the guarded transfer block',
      'Unexpected data shape from the database',
    ],
    solutions: [
      'Read the error message for the underlying cause',
      'Check vendor_payouts for the subscription: no row = nothing happened (safe to re-trigger); pending/failed row = follow that status',
    ],
  },
  {
    code: 'ERR_PAYOUT_005',
    title: 'Market Box Payout Transfer Failed',
    category: 'STRIPE',
    severity: 'high',
    description: 'The Stripe transfer for a market box vendor payout failed. The payout record is marked failed; the vendor has not been paid.',
    userGuidance: '',
    causes: [
      'Insufficient platform balance for the transfer',
      'Vendor Stripe account restricted or payouts disabled',
      'Stripe API error',
    ],
    solutions: [
      'Check the vendor_payouts row (status=failed) for the subscription in the error message',
      'Check the vendor Stripe account status, then retry the transfer manually',
    ],
  },
  {
    code: 'ERR_PAYOUT_006',
    title: 'Market Box Payout Offering Not Found',
    category: 'STRIPE',
    severity: 'high',
    description: 'A market box subscription was paid but its offering row could not be found — the payout was aborted and the vendor has not been paid.',
    userGuidance: '',
    causes: [
      'Offering deleted after the subscription was created',
      'Stale or wrong offeringId in the Stripe metadata',
    ],
    solutions: [
      'Look up the subscription and offering IDs from the error message in market_box_subscriptions / market_box_offerings',
      'Manually process the vendor payout once the vendor is identified',
    ],
  },
  {
    code: 'ERR_PAYOUT_007',
    title: 'Market Box Payout Vendor Not Found',
    category: 'STRIPE',
    severity: 'high',
    description: 'A market box subscription was paid but the offering\'s vendor profile could not be found — the payout was aborted and the vendor has not been paid.',
    userGuidance: '',
    causes: [
      'Vendor profile deleted while an offering/subscription still references it',
      'Data integrity issue between market_box_offerings.vendor_profile_id and vendor_profiles',
    ],
    solutions: [
      'Check vendor_profiles for the vendor_profile_id in the error message',
      'Manually process or refund once ownership is resolved',
    ],
  },
]
