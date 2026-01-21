/**
 * Simple pluralization helper for i18n preparation
 *
 * This helper centralizes pluralization logic so it can be easily
 * replaced with proper i18n (next-intl ICU format) later.
 *
 * Usage:
 *   pluralize(count, 'item', 'items')
 *   pluralize(count, 'market', 'markets')
 *   pluralize(count, 'box', 'boxes')  // for irregular plurals
 *
 * Future i18n replacement:
 *   t('items', { count })  // Uses ICU: "{count, plural, one {# item} other {# items}}"
 */

export function pluralize(
  count: number,
  singular: string,
  plural: string
): string {
  return count === 1 ? singular : plural
}

/**
 * Returns the count with pluralized noun
 *
 * Usage:
 *   pluralizeWithCount(3, 'item', 'items')  // "3 items"
 *   pluralizeWithCount(1, 'order', 'orders') // "1 order"
 */
export function pluralizeWithCount(
  count: number,
  singular: string,
  plural: string
): string {
  return `${count} ${pluralize(count, singular, plural)}`
}

/**
 * Common pluralizations used throughout the app
 * Centralized here for easy i18n conversion later
 */
export const plurals = {
  item: (count: number) => pluralizeWithCount(count, 'item', 'items'),
  order: (count: number) => pluralizeWithCount(count, 'order', 'orders'),
  listing: (count: number) => pluralizeWithCount(count, 'listing', 'listings'),
  vendor: (count: number) => pluralizeWithCount(count, 'vendor', 'vendors'),
  market: (count: number) => pluralizeWithCount(count, 'market', 'markets'),
  product: (count: number) => pluralizeWithCount(count, 'product', 'products'),
  marketBox: (count: number) => pluralizeWithCount(count, 'market box', 'market boxes'),
}
