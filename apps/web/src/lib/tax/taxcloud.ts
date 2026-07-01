/**
 * TaxCloud API Client
 *
 * Certified Service Provider (CSP) under SSUTA.
 * Handles sales tax calculation, reporting, and filing for all US states
 * including Texas (non-SSUTA — TaxCloud files TX returns via ACH).
 *
 * API docs: https://docs.taxcloud.com
 * TIC codes: https://app.taxcloud.com/tic (requires login)
 *
 * Env vars required:
 *   TAXCLOUD_API_LOGIN_ID — from TaxCloud dashboard
 *   TAXCLOUD_API_KEY       — from TaxCloud dashboard
 */

const TAXCLOUD_API_BASE = 'https://api.taxcloud.net/1.0/TaxCloud'

// ── Types ────────────────────────────────────────────────────────────────

export interface TaxCloudAddress {
  Address1: string
  Address2?: string
  City: string
  State: string
  Zip5: string
  Zip4?: string
}

export interface TaxCloudCartItem {
  Index: number
  ItemID: string      // Our listing ID or a stable product identifier
  TIC: number         // Taxability Information Code — determines tax treatment
  Price: number       // Unit price in dollars (not cents)
  Qty: number
}

export interface TaxCloudLookupRequest {
  apiLoginID: string
  apiKey: string
  customerID: string          // Buyer user ID
  cartID: string              // Our cart ID or order ID
  deliveredBySeller: boolean  // true for marketplace pickup (seller hands to buyer)
  origin: TaxCloudAddress     // Platform/vendor address
  destination: TaxCloudAddress // Pickup market address (same as origin for in-person)
  cartItems: TaxCloudCartItem[]
}

export interface TaxCloudCartItemResponse {
  CartItemIndex: number
  TaxAmount: number   // Tax in dollars for this line item
}

export interface TaxCloudLookupResponse {
  CartID: string
  CartItemsResponse: TaxCloudCartItemResponse[]
  ResponseType: number  // 3 = SUCCESS
  Messages: string[]
}

export interface TaxCloudCaptureRequest {
  apiLoginID: string
  apiKey: string
  customerID: string
  cartID: string
  orderID: string     // Our order ID — TaxCloud uses this for filing
  dateAuthorized: string  // ISO date
  dateCaptured: string    // ISO date
}

export interface TaxCloudReturnRequest {
  apiLoginID: string
  apiKey: string
  orderID: string
  cartItems: TaxCloudCartItem[]  // Items being returned
  returnedDate: string           // ISO date
}

export interface TaxCloudBaseResponse {
  ResponseType: number  // 3 = SUCCESS
  Messages: string[]
}

// ── Credentials ──────────────────────────────────────────────────────────

function getCredentials(): { apiLoginID: string; apiKey: string } {
  const apiLoginID = process.env.TAXCLOUD_API_LOGIN_ID
  const apiKey = process.env.TAXCLOUD_API_KEY

  if (!apiLoginID || !apiKey) {
    throw new Error(
      'TaxCloud credentials not configured. Set TAXCLOUD_API_LOGIN_ID and TAXCLOUD_API_KEY environment variables.'
    )
  }

  return { apiLoginID, apiKey }
}

// ── API Methods ──────────────────────────────────────────────────────────

/**
 * Lookup: Calculate tax for a set of cart items.
 *
 * Call this at checkout BEFORE creating the Stripe session.
 * Returns tax per line item so we can display it to the buyer
 * and include it in the Stripe charge total.
 *
 * For in-person pickup: origin and destination are the SAME address
 * (the market/pickup location). This is correct for tax jurisdiction —
 * TX sales tax is based on point of sale, which is the pickup location.
 */
export async function lookupTax(params: {
  customerID: string
  cartID: string
  pickupAddress: TaxCloudAddress
  items: TaxCloudCartItem[]
}): Promise<TaxCloudLookupResponse> {
  const { apiLoginID, apiKey } = getCredentials()

  const body: TaxCloudLookupRequest = {
    apiLoginID,
    apiKey,
    customerID: params.customerID,
    cartID: params.cartID,
    deliveredBySeller: true, // In-person pickup = seller delivers to buyer at market
    origin: params.pickupAddress,
    destination: params.pickupAddress, // Same for in-person — tax jurisdiction = pickup location
    cartItems: params.items,
  }

  const response = await fetch(`${TAXCLOUD_API_BASE}/Lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`TaxCloud Lookup failed: ${response.status} ${response.statusText}`)
  }

  const data: TaxCloudLookupResponse = await response.json()

  if (data.ResponseType !== 3) {
    throw new Error(`TaxCloud Lookup error: ${data.Messages?.join(', ') || 'Unknown error'}`)
  }

  return data
}

/**
 * AuthorizedWithCapture: Report a completed transaction to TaxCloud.
 *
 * Call this AFTER Stripe payment succeeds (in checkout/success or webhook).
 * TaxCloud uses this data to file tax returns on our behalf.
 */
export async function captureTransaction(params: {
  customerID: string
  cartID: string
  orderID: string
}): Promise<TaxCloudBaseResponse> {
  const { apiLoginID, apiKey } = getCredentials()

  const now = new Date().toISOString()

  const body: TaxCloudCaptureRequest = {
    apiLoginID,
    apiKey,
    customerID: params.customerID,
    cartID: params.cartID,
    orderID: params.orderID,
    dateAuthorized: now,
    dateCaptured: now,
  }

  const response = await fetch(`${TAXCLOUD_API_BASE}/AuthorizedWithCapture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`TaxCloud Capture failed: ${response.status} ${response.statusText}`)
  }

  const data: TaxCloudBaseResponse = await response.json()

  if (data.ResponseType !== 3) {
    console.error('[TaxCloud] Capture error:', data.Messages)
    // Don't throw — capture failure shouldn't block the order.
    // TaxCloud retries can be handled via their dashboard.
  }

  return data
}

/**
 * Returned: Report a refund/return to TaxCloud.
 *
 * Call this when an order is refunded (vendor reject, buyer cancel, etc.).
 * TaxCloud adjusts the tax filing accordingly.
 */
export async function reportReturn(params: {
  orderID: string
  items: TaxCloudCartItem[]
}): Promise<TaxCloudBaseResponse> {
  const { apiLoginID, apiKey } = getCredentials()

  const body: TaxCloudReturnRequest = {
    apiLoginID,
    apiKey,
    orderID: params.orderID,
    cartItems: params.items,
    returnedDate: new Date().toISOString(),
  }

  const response = await fetch(`${TAXCLOUD_API_BASE}/Returned`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`TaxCloud Return failed: ${response.status} ${response.statusText}`)
  }

  const data: TaxCloudBaseResponse = await response.json()

  if (data.ResponseType !== 3) {
    console.error('[TaxCloud] Return error:', data.Messages)
  }

  return data
}

/**
 * Helper: Convert cents to dollars for TaxCloud (which uses dollar amounts).
 */
export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100
}

/**
 * Helper: Convert TaxCloud dollar tax amount to cents for our system.
 */
export function taxDollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}
