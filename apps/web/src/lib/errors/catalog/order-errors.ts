import type { ErrorCatalogEntry } from '../types'

export const ORDER_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'ERR_ORDER_001',
    title: 'Order Item Not Found',
    category: 'ORDER',
    severity: 'medium',
    description: 'The specified order item could not be found.',
    causes: [
      'Invalid order item ID',
      'RLS policy blocking access to order_items',
      'Order item belongs to a different user',
    ],
    solutions: [
      'Verify the order_item ID exists in the database',
      'Check order_items RLS policies for buyer/vendor access',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_ORDER_002',
    title: 'Order Not Cancellable',
    category: 'ORDER',
    severity: 'low',
    description: 'The order cannot be cancelled in its current state.',
    causes: [
      'Order has already been fulfilled or completed',
      'Order has already been cancelled',
    ],
    solutions: [
      'Check order_items.status — only pending/confirmed/ready can be cancelled',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_ORDER_003',
    title: 'Confirmation Not Allowed',
    category: 'ORDER',
    severity: 'medium',
    description: 'The order item cannot be confirmed in its current state.',
    causes: [
      'Item is not in ready/fulfilled status',
      'Buyer has already confirmed receipt',
      'Issue has already been reported',
    ],
    solutions: [
      'Check order_items.status and buyer_confirmed_at fields',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_ORDER_004',
    title: 'Vendor Handoff Confirmation Failed',
    category: 'ORDER',
    severity: 'high',
    description: 'Vendor could not confirm the handoff.',
    causes: [
      'Buyer has not confirmed receipt yet',
      'Vendor has already confirmed',
      'Stripe transfer failed',
    ],
    solutions: [
      'Check buyer_confirmed_at is set before vendor confirms',
      'Check Stripe account status for the vendor',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_ORDER_005',
    title: 'Vendor Lockdown Active',
    category: 'ORDER',
    severity: 'medium',
    description: 'Vendor has unresolved pickup confirmations blocking other actions.',
    causes: [
      'Buyer confirmed receipt but vendor did not counter-confirm within 5 minutes',
      'Multiple pending confirmations exist',
    ],
    solutions: [
      'Vendor must resolve pending confirmations before fulfilling other orders',
    ],
    pgCodes: [],
  },
]

export const CHECKOUT_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'ERR_CHECKOUT_001',
    title: 'Below Minimum Order',
    category: 'ORDER',
    severity: 'low',
    description: 'Cart total is below the minimum order amount.',
    causes: [
      'Subtotal is less than $10.00',
    ],
    solutions: [
      'Add more items to cart to meet minimum',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_CHECKOUT_002',
    title: 'Checkout Session Creation Failed',
    category: 'STRIPE',
    severity: 'high',
    description: 'Failed to create Stripe checkout session.',
    causes: [
      'Stripe API error',
      'Invalid order data',
      'Missing Stripe configuration',
    ],
    solutions: [
      'Check STRIPE_SECRET_KEY environment variable',
      'Check Stripe dashboard for API errors',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_CHECKOUT_003',
    title: 'Payment Verification Failed',
    category: 'STRIPE',
    severity: 'high',
    description: 'Could not verify payment status with Stripe.',
    causes: [
      'Invalid session_id',
      'Payment was not completed',
      'Stripe API unreachable',
    ],
    solutions: [
      'Check Stripe dashboard for the payment status',
      'Verify STRIPE_SECRET_KEY is correct',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_CHECKOUT_004',
    title: 'Refund Failed',
    category: 'STRIPE',
    severity: 'high',
    description: 'Stripe refund could not be processed.',
    causes: [
      'Payment intent not found',
      'Refund amount exceeds original charge',
      'Stripe account issue',
    ],
    solutions: [
      'Check Stripe dashboard for the payment',
      'Manually process refund if automated refund fails',
    ],
    pgCodes: [],
  },
]
