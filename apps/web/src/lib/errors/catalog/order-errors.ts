import type { ErrorCatalogEntry } from '../types'

export const ORDER_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'ERR_ORDER_001',
    title: 'Order Item Not Found',
    category: 'ORDER',
    severity: 'medium',
    description: 'The specified order item could not be found.',
    userGuidance: 'We couldn\'t find this order. It may have been removed. Please check your orders page.',
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
    userGuidance: 'This order can\'t be cancelled in its current status.',
    selfResolvable: true,
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
    userGuidance: 'This order can\'t be confirmed right now. It may not be ready for pickup yet.',
    causes: [
      'Item is not in ready/fulfilled status',
      'Buyer has already acknowledged receipt',
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
    userGuidance: 'Handoff confirmation failed. Please make sure the buyer has confirmed receipt first.',
    causes: [
      'Buyer has not acknowledged receipt yet',
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
    userGuidance: 'You have pending pickup confirmations that need to be resolved first. Check your dashboard.',
    causes: [
      'Buyer acknowledged receipt but vendor did not counter-confirm within 8 hours',
      'Multiple pending confirmations exist',
    ],
    solutions: [
      'Vendor must resolve pending confirmations before fulfilling other orders',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_ORDER_006',
    title: 'Confirmation Window Expired',
    category: 'ORDER',
    severity: 'low',
    description: 'The 30-second confirmation window has expired.',
    userGuidance: 'The confirmation window has expired. Please ask the buyer to confirm receipt again.',
    selfResolvable: true,
    causes: [
      'Vendor did not click Fulfill within 30 seconds of buyer acknowledging',
      'Network delay caused timeout',
    ],
    solutions: [
      'Ask buyer to acknowledge receipt again',
      'Vendor should fulfill immediately after buyer acknowledges',
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
    userGuidance: 'Your cart total is below the $10.00 minimum. Add more items to continue.',
    selfResolvable: true,
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
    userGuidance: 'We couldn\'t start the checkout process. Please try again in a moment.',
    retryable: true,
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
    userGuidance: 'We couldn\'t verify your payment. If you were charged, don\'t worry — our team will make sure it\'s handled. Please contact support if needed.',
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
    userGuidance: 'Your refund couldn\'t be processed automatically. Our team will handle this manually — no action needed from you.',
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
