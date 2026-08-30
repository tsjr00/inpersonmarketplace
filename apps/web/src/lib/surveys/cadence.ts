/**
 * Survey cadence (owner decision 2026-08-29 — "survey fatigue").
 *
 * Before: one survey per person per market DAY. A truck at a daily park was
 * asked to rate the park every single day; a lunch regular likewise.
 *
 * After:
 *   VENDORS — once a week: one ask covering each place they were at that
 *             week (one market_surveys row per place, same week, surfaced as
 *             one page + ONE notification / ONE email).
 *   BUYERS  — a survey after their 1st and 2nd fulfilled purchases (the
 *             existing per-day flow), then once a week, only in weeks they
 *             bought something, one section per place they bought from, plus
 *             a free-text "other places you'd like to see" ask.
 *
 * A week is Monday → Sunday, market-local. The weekly batch fires Sunday at
 * WEEKLY_FIRE_HOUR local (the same 18:00 the per-day rule already uses for
 * early-closing markets); any later run (the daily cron, or a person opening
 * the app) evaluates the most recently ENDED week, and the per-row UNIQUE
 * keys on market_surveys make every path idempotent.
 *
 * Pure date math only — no DB, unit-tested in __tests__/cadence.test.ts.
 */

import { formatYMD, parseYMD } from './cron-helpers'

export const WEEKLY_FIRE_HOUR = 18

/** "first and second purchases" get the immediate per-day survey. */
export const EARLY_BUYER_MAX_ORDERS = 2

export interface WeekWindow {
  /** Monday, YYYY-MM-DD */
  weekStart: string
  /** Sunday, YYYY-MM-DD */
  weekEnd: string
}

/**
 * The most recent Monday→Sunday week whose Sunday WEEKLY_FIRE_HOUR has
 * passed, given "now" as a market-local ISO string (no offset — the shape
 * `nowInTimezoneAsLocalIso` returns). Null only on unparseable input.
 */
export function lastEndedWeek(nowLocalIso: string): WeekWindow | null {
  const m = nowLocalIso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})/)
  if (!m) return null
  const today = parseYMD(m[1]!)
  if (!today) return null
  const hour = parseInt(m[2]!, 10)
  const dow = today.getDay() // 0 = Sunday
  const end = new Date(today)
  if (dow === 0) {
    // Sunday: this week has ended only once the fire hour has passed.
    if (hour < WEEKLY_FIRE_HOUR) end.setDate(end.getDate() - 7)
  } else {
    end.setDate(end.getDate() - dow)
  }
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return { weekStart: formatYMD(start), weekEnd: formatYMD(end) }
}

/** Every date in the window (inclusive), oldest first. */
export function datesInWindow(window: WeekWindow): string[] {
  const start = parseYMD(window.weekStart)
  const end = parseYMD(window.weekEnd)
  if (!start || !end) return []
  const out: string[] = []
  const d = new Date(start)
  while (d.getTime() <= end.getTime()) {
    out.push(formatYMD(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/**
 * The LAST date in the window that falls on one of the given days of week
 * (0–6), or null. This is the `market_date` a weekly row is stored against.
 */
export function lastDateOnDows(window: WeekWindow, dows: Iterable<number>): string | null {
  const wanted = new Set(dows)
  let last: string | null = null
  for (const ymd of datesInWindow(window)) {
    const d = parseYMD(ymd)
    if (d && wanted.has(d.getDay())) last = ymd
  }
  return last
}

/** Buyers with this many fulfilled orders (or fewer) are still "early". */
export function isEarlyBuyerCount(fulfilledOrderCount: number): boolean {
  return fulfilledOrderCount <= EARLY_BUYER_MAX_ORDERS
}

/** "Aug 24 – Aug 30" for headings, emails and notifications. */
export function formatWeekDisplay(window: WeekWindow): string {
  const s = parseYMD(window.weekStart)
  const e = parseYMD(window.weekEnd)
  if (!s || !e) return `${window.weekStart} – ${window.weekEnd}`
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}
