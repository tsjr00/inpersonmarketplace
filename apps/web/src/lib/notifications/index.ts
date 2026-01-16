/**
 * Notification Service
 *
 * This module handles all outbound notifications (email, push, etc.)
 * Currently STUBBED - logs to console instead of sending.
 *
 * To enable email sending:
 * 1. Add email service (Resend, SendGrid, etc.)
 * 2. Update the `sendEmail` function to use the service
 * 3. Add RESEND_API_KEY or similar to .env.local
 */

// Notification event types
export type NotificationEvent =
  | 'order_placed'           // Buyer placed order → notify vendor
  | 'order_confirmed'        // Vendor confirmed → notify buyer
  | 'order_ready'            // Vendor marked ready → notify buyer
  | 'order_fulfilled'        // Pickup complete → notify buyer
  | 'order_cancelled_buyer'  // Buyer cancelled → notify vendor
  | 'order_cancelled_vendor' // Vendor cancelled → notify buyer
  | 'order_expired'          // Order expired → notify both

interface NotificationRecipient {
  email: string
  name: string
}

interface NotificationData {
  orderNumber: string
  orderItemId?: string
  itemTitle?: string
  vendorName?: string
  buyerName?: string
  marketName?: string
  pickupDate?: string
  amount?: number
  reason?: string
}

interface NotificationResult {
  success: boolean
  messageId?: string
  error?: string
}

// Email templates - ready for when email service is added
const TEMPLATES: Record<NotificationEvent, {
  subject: (data: NotificationData) => string
  body: (data: NotificationData) => string
}> = {
  order_placed: {
    subject: (d) => `New Order #${d.orderNumber} Received`,
    body: (d) => `
You have a new order!

Order #${d.orderNumber}
Customer: ${d.buyerName}
Item: ${d.itemTitle}
Pickup: ${d.marketName}${d.pickupDate ? ` on ${d.pickupDate}` : ''}

Please confirm this order in your vendor dashboard.
    `.trim()
  },

  order_confirmed: {
    subject: (d) => `Order #${d.orderNumber} Confirmed by ${d.vendorName}`,
    body: (d) => `
Great news! Your order has been confirmed.

Order #${d.orderNumber}
Vendor: ${d.vendorName}
Item: ${d.itemTitle}
Pickup: ${d.marketName}${d.pickupDate ? ` on ${d.pickupDate}` : ''}

The vendor is preparing your order. We'll notify you when it's ready for pickup.
    `.trim()
  },

  order_ready: {
    subject: (d) => `Order #${d.orderNumber} Ready for Pickup!`,
    body: (d) => `
Your order is ready!

Order #${d.orderNumber}
Vendor: ${d.vendorName}
Item: ${d.itemTitle}
Pickup Location: ${d.marketName}

Head to the vendor's booth and give them your order number: ${d.orderNumber}
    `.trim()
  },

  order_fulfilled: {
    subject: (d) => `Order #${d.orderNumber} Complete`,
    body: (d) => `
Thank you for your purchase!

Order #${d.orderNumber} has been marked as picked up.

We hope you enjoy your ${d.itemTitle} from ${d.vendorName}!

If you have any issues, please contact the vendor or our support team.
    `.trim()
  },

  order_cancelled_buyer: {
    subject: (d) => `Order #${d.orderNumber} Cancelled`,
    body: (d) => `
A customer has cancelled their order.

Order #${d.orderNumber}
Customer: ${d.buyerName}
Item: ${d.itemTitle}
${d.reason ? `Reason: ${d.reason}` : ''}

No action is needed on your part.
    `.trim()
  },

  order_cancelled_vendor: {
    subject: (d) => `Order #${d.orderNumber} Cancelled by Vendor`,
    body: (d) => `
Unfortunately, the vendor was unable to fulfill your order.

Order #${d.orderNumber}
Vendor: ${d.vendorName}
Item: ${d.itemTitle}
${d.reason ? `Reason: ${d.reason}` : ''}

${d.amount ? `A refund of $${(d.amount / 100).toFixed(2)} will be processed.` : 'A refund will be processed.'}

We apologize for any inconvenience.
    `.trim()
  },

  order_expired: {
    subject: (d) => `Order #${d.orderNumber} Expired`,
    body: (d) => `
Your order has expired because it was not confirmed in time.

Order #${d.orderNumber}
Item: ${d.itemTitle}
${d.vendorName ? `Vendor: ${d.vendorName}` : ''}

${d.amount ? `A refund of $${(d.amount / 100).toFixed(2)} will be processed.` : 'A refund will be processed.'}

You can place a new order if you'd still like to purchase this item.
    `.trim()
  }
}

/**
 * Send an email notification
 * STUBBED: Currently logs to console. Replace with actual email service.
 */
async function sendEmail(
  to: NotificationRecipient,
  subject: string,
  body: string
): Promise<NotificationResult> {
  // STUB: Log to console instead of sending
  console.log('\n========== EMAIL NOTIFICATION (STUBBED) ==========')
  console.log(`To: ${to.name} <${to.email}>`)
  console.log(`Subject: ${subject}`)
  console.log('---')
  console.log(body)
  console.log('==================================================\n')

  // When ready to send real emails, replace above with:
  //
  // import { Resend } from 'resend'
  // const resend = new Resend(process.env.RESEND_API_KEY)
  //
  // const { data, error } = await resend.emails.send({
  //   from: 'FastWrks <noreply@fastwrks.com>',
  //   to: to.email,
  //   subject,
  //   text: body,
  // })
  //
  // if (error) {
  //   return { success: false, error: error.message }
  // }
  // return { success: true, messageId: data?.id }

  return { success: true, messageId: `stub-${Date.now()}` }
}

/**
 * Send a notification for a specific event
 */
export async function sendNotification(
  event: NotificationEvent,
  recipient: NotificationRecipient,
  data: NotificationData
): Promise<NotificationResult> {
  const template = TEMPLATES[event]
  if (!template) {
    console.error(`Unknown notification event: ${event}`)
    return { success: false, error: 'Unknown event type' }
  }

  const subject = template.subject(data)
  const body = template.body(data)

  return sendEmail(recipient, subject, body)
}

/**
 * Helper to notify vendor of a new order
 */
export async function notifyVendorNewOrder(
  vendorEmail: string,
  vendorName: string,
  data: NotificationData
): Promise<NotificationResult> {
  return sendNotification('order_placed', { email: vendorEmail, name: vendorName }, data)
}

/**
 * Helper to notify buyer of order confirmation
 */
export async function notifyBuyerOrderConfirmed(
  buyerEmail: string,
  buyerName: string,
  data: NotificationData
): Promise<NotificationResult> {
  return sendNotification('order_confirmed', { email: buyerEmail, name: buyerName }, data)
}

/**
 * Helper to notify buyer order is ready
 */
export async function notifyBuyerOrderReady(
  buyerEmail: string,
  buyerName: string,
  data: NotificationData
): Promise<NotificationResult> {
  return sendNotification('order_ready', { email: buyerEmail, name: buyerName }, data)
}

/**
 * Helper to notify buyer of vendor cancellation
 */
export async function notifyBuyerOrderCancelled(
  buyerEmail: string,
  buyerName: string,
  data: NotificationData
): Promise<NotificationResult> {
  return sendNotification('order_cancelled_vendor', { email: buyerEmail, name: buyerName }, data)
}

/**
 * Helper to notify vendor of buyer cancellation
 */
export async function notifyVendorOrderCancelled(
  vendorEmail: string,
  vendorName: string,
  data: NotificationData
): Promise<NotificationResult> {
  return sendNotification('order_cancelled_buyer', { email: vendorEmail, name: vendorName }, data)
}

/**
 * Helper to notify about expired order
 */
export async function notifyOrderExpired(
  email: string,
  name: string,
  data: NotificationData
): Promise<NotificationResult> {
  return sendNotification('order_expired', { email, name }, data)
}
