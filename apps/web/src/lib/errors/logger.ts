/**
 * Error Logger
 *
 * Logs TracedErrors to the database for analysis and debugging.
 * Uses service role client to bypass RLS for inserting error logs.
 */

import { createClient } from '@supabase/supabase-js'
import { TracedError } from './traced-error'

/**
 * Create a service role client for logging
 * This bypasses RLS to allow inserting error logs
 */
function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[ErrorLogger] Missing Supabase service role credentials')
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Log a TracedError to the database
 * Silently fails if logging fails (don't break the app for logging)
 */
export async function logErrorToDb(error: TracedError): Promise<void> {
  try {
    const supabase = createServiceClient()
    if (!supabase) {
      console.warn('[ErrorLogger] Cannot log to DB - no service client')
      return
    }

    const { error: insertError } = await supabase.from('error_logs').insert({
      trace_id: error.traceId,
      error_code: error.code,
      message: error.message,
      context: error.context,
      breadcrumbs: error.context?.breadcrumbs || [],
      user_id: error.context?.userId || null,
      route: error.context?.route || null,
      method: error.context?.method || null,
      pg_code: error.context?.pgCode || null,
      severity: error.severity,
    })

    if (insertError) {
      // Log to console but don't throw - error logging shouldn't break the app
      console.error('[ErrorLogger] Failed to log error to DB:', insertError.message)
    }
  } catch (err) {
    // Silently fail - logging shouldn't break the app
    console.error('[ErrorLogger] Exception while logging to DB:', err)
  }
}

/**
 * Check if database logging is enabled
 */
export function isDbLoggingEnabled(): boolean {
  return process.env.LOG_ERRORS_TO_DB !== 'false'
}

/**
 * Send an email alert to the admin for high-severity errors.
 * Silently fails if Resend is not configured.
 */
async function sendAdminAlert(error: TracedError): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_ALERT_EMAIL
  if (!apiKey || !adminEmail) return

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: 'alerts@farmersmarketing.app',
      to: adminEmail,
      subject: `[${error.severity.toUpperCase()}] ${error.code}: ${error.message}`,
      html: [
        `<h2>${error.code}</h2>`,
        `<p><strong>Message:</strong> ${error.message}</p>`,
        `<p><strong>Trace ID:</strong> ${error.traceId}</p>`,
        error.context?.route ? `<p><strong>Route:</strong> ${error.context.method} ${error.context.route}</p>` : '',
        error.context?.userId ? `<p><strong>User:</strong> ${error.context.userId}</p>` : '',
        error.context?.breadcrumbs?.length
          ? `<h3>Breadcrumbs</h3><ol>${error.context.breadcrumbs.map((b) => `<li>[${b.category}] ${b.message}</li>`).join('')}</ol>`
          : '',
      ].filter(Boolean).join('\n'),
    })
  } catch {
    // Admin alerting should never break the app
  }
}

/**
 * Log error to both console and database
 */
export async function logError(error: TracedError): Promise<void> {
  // Always log to console
  error.log()

  // Log to database if enabled
  if (isDbLoggingEnabled()) {
    await logErrorToDb(error)
  }

  // Email admin for high-severity errors
  if (error.severity === 'high') {
    await sendAdminAlert(error)
  }
}
