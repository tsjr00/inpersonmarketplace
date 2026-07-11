/**
 * Season-window helpers.
 *
 * A market's OPERATING WINDOW is `markets.season_start` / `markets.season_end`
 * ('YYYY-MM-DD', inclusive on both ends; NULL = open-ended / year-round).
 * This is the same window already enforced for BUYER product ordering in
 * `get_available_pickup_dates()` (migration 010). These helpers let the
 * vendor booth-booking flow and the manager dashboard honor the SAME window,
 * so a market that isn't operating (out of season) doesn't advertise market
 * days, bookable weeks, or "this week" occupancy for dates it isn't open.
 *
 * NOTE — this is NOT the `market_seasons` table. That table is the Phase E
 * prepay-bundle product (named seasons with refund caps + make-up buffers),
 * layered on top; it does not define when the market operates.
 *
 * All comparisons are on 'YYYY-MM-DD' strings, which sort chronologically —
 * so they're timezone-safe (no Date arithmetic, no UTC drift).
 */

/** True when the market has ANY operating-window bound set. NULL/NULL =
 *  year-round → callers keep their pre-season-window behavior. */
export function hasSeasonWindow(
  seasonStart: string | null,
  seasonEnd: string | null
): boolean {
  return !!(seasonStart || seasonEnd)
}

/** Inclusive on both ends. A NULL bound is open on that side. */
export function isWithinSeason(
  dateYmd: string,
  seasonStart: string | null,
  seasonEnd: string | null
): boolean {
  if (seasonStart && dateYmd < seasonStart) return false
  if (seasonEnd && dateYmd > seasonEnd) return false
  return true
}

/** True when the date falls before the season has started. */
export function isBeforeSeason(dateYmd: string, seasonStart: string | null): boolean {
  return !!(seasonStart && dateYmd < seasonStart)
}

/** True when the date falls after the season has ended. */
export function isAfterSeason(dateYmd: string, seasonEnd: string | null): boolean {
  return !!(seasonEnd && dateYmd > seasonEnd)
}
