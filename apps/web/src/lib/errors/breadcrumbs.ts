/**
 * Breadcrumb Trail Management
 *
 * Uses AsyncLocalStorage to maintain request-scoped breadcrumb trails.
 * Breadcrumbs capture the execution path leading to an error, making
 * it easier to understand what happened before the error occurred.
 */

import { AsyncLocalStorage } from 'async_hooks'
import { Breadcrumb } from './types'

// Maximum breadcrumbs to keep per request (prevent memory issues)
const MAX_BREADCRUMBS = 50

// AsyncLocalStorage for request-scoped breadcrumbs
const breadcrumbStorage = new AsyncLocalStorage<Breadcrumb[]>()

/**
 * Check if breadcrumbs are disabled via environment variable
 */
function isDisabled(): boolean {
  return process.env.DISABLE_BREADCRUMBS === 'true'
}

/**
 * Start a new breadcrumb trail for a request
 * Wraps an async function with a fresh breadcrumb context
 */
export function startBreadcrumbTrail<T>(fn: () => Promise<T>): Promise<T> {
  if (isDisabled()) {
    return fn()
  }
  return breadcrumbStorage.run([], fn)
}

/**
 * Add a breadcrumb to the current trail
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: Breadcrumb['level'] = 'info'
): void {
  if (isDisabled()) return

  const trail = breadcrumbStorage.getStore()
  if (trail) {
    trail.push({
      timestamp: Date.now(),
      category,
      message,
      data,
      level,
    })

    // Limit trail length to prevent memory issues
    if (trail.length > MAX_BREADCRUMBS) {
      trail.shift()
    }
  }
}

/**
 * Get current breadcrumb trail
 */
export function getBreadcrumbs(): Breadcrumb[] {
  if (isDisabled()) return []
  return breadcrumbStorage.getStore() || []
}

/**
 * Clear all breadcrumbs in current context
 */
export function clearBreadcrumbs(): void {
  const trail = breadcrumbStorage.getStore()
  if (trail) {
    trail.length = 0
  }
}

/**
 * Convenience helpers for common breadcrumb types
 *
 * Usage:
 *   crumb.api('/api/buyer/orders', 'GET')
 *   crumb.supabase('select', 'orders', { userId: 'abc' })
 *   crumb.auth('User authenticated', userId)
 */
export const crumb = {
  /**
   * API route entry point
   */
  api: (route: string, method: string) =>
    addBreadcrumb('api', `${method} ${route}`, { route, method }),

  /**
   * Supabase database operation
   */
  supabase: (operation: string, table: string, data?: Record<string, unknown>) =>
    addBreadcrumb('supabase', `${operation} on ${table}`, { operation, table, ...data }),

  /**
   * Authentication event
   */
  auth: (message: string, userId?: string) =>
    addBreadcrumb('auth', message, userId ? { userId } : undefined),

  /**
   * Stripe payment event
   */
  stripe: (message: string, data?: Record<string, unknown>) =>
    addBreadcrumb('stripe', message, data),

  /**
   * Validation step
   */
  validate: (message: string, data?: Record<string, unknown>) =>
    addBreadcrumb('validation', message, data),

  /**
   * Business logic checkpoint
   */
  logic: (message: string, data?: Record<string, unknown>) =>
    addBreadcrumb('logic', message, data),

  /**
   * Custom category breadcrumb
   */
  custom: (category: string, message: string, data?: Record<string, unknown>) =>
    addBreadcrumb(category, message, data),

  /**
   * Error breadcrumb (for caught errors that are handled)
   */
  error: (message: string, error?: unknown) =>
    addBreadcrumb('error', message, { error: String(error) }, 'error'),

  /**
   * Warning breadcrumb
   */
  warning: (message: string, data?: Record<string, unknown>) =>
    addBreadcrumb('warning', message, data, 'warning'),

  /**
   * Debug breadcrumb (only in development)
   */
  debug: (message: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      addBreadcrumb('debug', message, data, 'debug')
    }
  },
}
