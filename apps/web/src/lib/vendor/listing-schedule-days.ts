/**
 * Listing save → the vendor's market days, one day at a time (owner 2026-10-09).
 *
 * Saving a listing at an UNMANAGED traditional market declares the vendor for
 * every active day of that market (vendor_market_schedules). Until 2026-10-09
 * that was ONE batch upsert, and the conflict trigger refusing one day
 * (check_vendor_schedule_conflict — the vendor is at another market at an
 * overlapping time, mig 253/262) failed the whole batch: the listing saved,
 * every day at that market was silently dropped, and the vendor was never told.
 *
 * Now each day is written on its own; a day refused for a schedule conflict is
 * skipped and REPORTED — the form carries a one-line notice to the page it
 * redirects to. Any other failure is logged as before and not reported here
 * (nothing about it is the vendor's to fix).
 *
 * Pure helpers here (unit-tested); the form does the I/O.
 */
import { dayOfWeekName } from '@/lib/utils/schedule-overlap'

export interface SkippedListingDay {
  marketName: string
  dayOfWeek: number
  /** The other market named by the conflict trigger, when its message carries one. */
  conflictWith: string | null
}

/** The trigger's message ends `… with "<market>" on the same day…`; pull the name out. */
export function conflictMarketName(message: string | null | undefined): string | null {
  const m = (message || '').match(/with "([^"]+)" on the same day/)
  return m ? m[1]! : null
}

export function isScheduleConflictError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  // P0020 since mig 262; the message test keeps working on an environment that still runs 253.
  return error.code === 'P0020' || !!error.message?.includes('Schedule conflict')
}

/** One sentence for the vendor, or '' when nothing was skipped. */
export function skippedListingDaysNotice(skipped: SkippedListingDay[]): string {
  if (skipped.length === 0) return ''
  const byMarket = new Map<string, SkippedListingDay[]>()
  for (const s of skipped) byMarket.set(s.marketName, [...(byMarket.get(s.marketName) ?? []), s])
  const parts: string[] = []
  for (const [marketName, days] of byMarket) {
    const sorted = [...days].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    const names = sorted.map((d) => dayOfWeekName(d.dayOfWeek))
    const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    const elsewhere = [...new Set(sorted.map((d) => d.conflictWith).filter((x): x is string => !!x))]
    const because = elsewhere.length > 0 ? ` because you're already at ${elsewhere.join(' and ')} then` : ' because you\'re scheduled at another market at that time'
    parts.push(`${list} at ${marketName}${because}`)
  }
  const plural = skipped.length > 1
  return `Saved. ${plural ? 'These days were' : 'This day was'} not added: ${parts.join('; ')}. To attend ${plural ? 'them' : 'it'} too, free the other schedule or tick "I can staff more than one location at the same time" in your profile, then add ${plural ? 'the days' : 'the day'} on your Markets page.`
}

/** Query-string key the form uses to hand the notice to the page it redirects to. */
export const SCHEDULE_NOTICE_PARAM = 'schedule_note'
