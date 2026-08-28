/**
 * "Continue shopping" should return an attendee to the EVENT SHOP they came
 * from, not dump them on /browse (owner testing 2026-08-28: removing the
 * only item from the cart landed on the checkout empty state, whose button
 * went to /browse — T-83 had only fixed the drawer while an event item was
 * still in the cart).
 *
 * The shop page remembers itself per vertical in sessionStorage; the cart
 * drawer and the checkout empty state prefer that path when it is set.
 * sessionStorage is per-tab and dies with it — exactly the lifetime of "the
 * event I was just shopping". Every access is guarded: private mode and
 * some previews throw on the accessor.
 */

const KEY_PREFIX = 'ipm:last-event-shop:'

export function rememberEventShop(vertical: string, token: string): void {
  try {
    window.sessionStorage.setItem(`${KEY_PREFIX}${vertical}`, `/${vertical}/events/${token}/shop`)
  } catch {
    // storage unavailable — continue-shopping falls back to /browse
  }
}

export function lastEventShopHref(vertical: string): string | null {
  try {
    const v = window.sessionStorage.getItem(`${KEY_PREFIX}${vertical}`)
    return v && v.startsWith(`/${vertical}/events/`) ? v : null
  } catch {
    return null
  }
}

/** Where "Continue shopping" goes: the remembered event shop, else browse. */
export function continueShoppingHref(vertical: string): string {
  return lastEventShopHref(vertical) ?? `/${vertical}/browse`
}
