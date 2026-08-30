/**
 * Custom HTML email rendering for post-market survey requests.
 *
 * Why custom (instead of just using sendNotification's standard
 * branded email): the user spec calls for the MARKET'S logo (if the
 * manager uploaded one via mig 140) inline in the email, plus a
 * date-aware subject + "prior pending" prompt when applicable. The
 * platform-wide email template in src/lib/notifications/service.ts
 * uses the FM brand logo and doesn't accept a per-call logo override.
 *
 * The cron route (`src/app/api/cron/surveys/route.ts`) sends in-app
 * notifications via sendNotification (standard registry path) and
 * sends THIS custom email separately via Resend. Two channels, one
 * surface — matches the existing intake-route pattern.
 */

/**
 * Inline HTML escape (no existing helper). Mirrors the small helper
 * in src/app/api/market-manager/intake/route.ts. Defensive against
 * injection through market_name + vendor_name + URLs.
 */
import { term } from '@/lib/vertical'

/** Sender brand for the footer — the survey email is vertical-agnostic
 *  otherwise, but "Sent by Farmers Marketing" under a food-truck park
 *  survey was wrong (R3-1, 2026-08-27). */
function brandName(vertical: string): string {
  return vertical === 'food_trucks' ? "Food Truck'n" : 'Farmers Marketing'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface VendorSurveyEmailInput {
  /** Vertical slug for nouns (FT: Location/Spot/Park Manager) + the sender
   *  brand in the footer. Optional so older callers keep working; defaults
   *  to farmers_market. */
  vertical?: string
  vendorName: string | null // for greeting; "Hi {name}" or generic
  marketName: string
  marketLogoUrl: string | null
  marketDateDisplay: string // "Saturday, May 17, 2026"
  surveyUrl: string // absolute URL to the survey form page
  priorPendingCount: number
  priorPendingUrl: string | null // null when priorPendingCount=0
  expiresAtDisplay: string // "Jun 16, 2026"
}

interface BuyerSurveyEmailInput extends VendorSurveyEmailInput {
  unsubscribeUrl: string // one-click unsubscribe for buyer email channel
}

const BRAND_GREEN = '#2d5016'
const SOFT_BG = '#fffaf0'
const BORDER = '#e5d4a8'

/** Generic email shell. Body inserted between the logo banner and the
 *  unsubscribe footer. Returns the full HTML doc as a string. */
function shell(args: {
  marketLogoUrl: string | null
  marketName: string
  innerHtml: string
  footerHtml: string
}): string {
  const logoBlock = args.marketLogoUrl
    ? `<img src="${escapeHtml(args.marketLogoUrl)}" alt="${escapeHtml(args.marketName)}" style="max-width:120px;max-height:80px;display:block;margin:0 auto 8px;border-radius:6px"/>`
    : ''
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;padding:24px 0;color:#333">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:10px;overflow:hidden">
        <div style="padding:20px 24px 8px;text-align:center;background:${SOFT_BG};border-bottom:1px solid ${BORDER}">
          ${logoBlock}
          <div style="font-size:14px;color:#666">${escapeHtml(args.marketName)}</div>
        </div>
        <div style="padding:24px">
          ${args.innerHtml}
        </div>
        <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #eee;font-size:12px;color:#777;text-align:center;line-height:1.5">
          ${args.footerHtml}
        </div>
      </div>
    </div>
  `
}

function buttonHtml(url: string, label: string): string {
  return `
    <div style="text-align:center;margin:24px 0">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">
        ${escapeHtml(label)}
      </a>
    </div>
  `
}

function priorPendingNoteHtml(count: number, url: string | null): string {
  if (count <= 0 || !url) return ''
  const noun = count === 1 ? 'survey' : 'surveys'
  return `
    <p style="margin:16px 0 0;padding:12px 14px;background:#fff8dc;border:1px solid #ffd57a;border-radius:6px;font-size:13px;color:#664d03;line-height:1.5">
      You have <strong>${count} other ${noun}</strong> pending from prior market days. <a href="${escapeHtml(url)}" style="color:${BRAND_GREEN}">See all pending surveys →</a>
    </p>
  `
}

export function buildVendorSurveyEmailSubject(args: VendorSurveyEmailInput): string {
  return `Quick survey — ${args.marketName} on ${args.marketDateDisplay}`
}

export function buildVendorSurveyEmailHtml(args: VendorSurveyEmailInput): string {
  const vertical = args.vertical || 'farmers_market'
  const manager = term(vertical, 'manager').toLowerCase()
  const vendors = term(vertical, 'vendors').toLowerCase()
  const greeting = args.vendorName ? `Hi ${args.vendorName},` : 'Hi,'
  const inner = `
    <p style="margin:0 0 12px;font-size:16px">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55">
      Thanks for setting up at <strong>${escapeHtml(args.marketName)}</strong> on ${escapeHtml(args.marketDateDisplay)}.
      Would you take 30 seconds to share how the day went for you? Your ratings go straight to the ${escapeHtml(manager)}, so the next day you sell there can run better.
    </p>
    <p style="margin:0;font-size:14px;color:#555;line-height:1.5">
      You'll rate five short things (foot traffic, sales, layout &amp; signage, site access &amp; support, overall) and have a place to leave a comment. Your individual answers are visible to the ${escapeHtml(manager)} + platform admin only — never to other ${escapeHtml(vendors)}.
    </p>
    ${buttonHtml(args.surveyUrl, 'Take the survey')}
    ${priorPendingNoteHtml(args.priorPendingCount, args.priorPendingUrl)}
    <p style="margin:24px 0 0;font-size:12px;color:#777;line-height:1.5">
      This survey closes on ${escapeHtml(args.expiresAtDisplay)} (30 days after the day).
    </p>
  `
  const footer = `Sent by ${brandName(vertical)} for ${escapeHtml(args.marketName)}.`
  return shell({
    marketLogoUrl: args.marketLogoUrl,
    marketName: args.marketName,
    innerHtml: inner,
    footerHtml: footer,
  })
}

export function buildBuyerSurveyEmailSubject(args: BuyerSurveyEmailInput): string {
  return `How was your visit to ${args.marketName} on ${args.marketDateDisplay}?`
}

export function buildBuyerSurveyEmailHtml(args: BuyerSurveyEmailInput): string {
  const vertical = args.vertical || 'farmers_market'
  const inner = `
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55">
      Thanks for stopping by <strong>${escapeHtml(args.marketName)}</strong> on ${escapeHtml(args.marketDateDisplay)}.
      Would you share a few quick ratings? Your feedback helps ${escapeHtml(args.marketName)} keep getting better.
    </p>
    <p style="margin:0;font-size:14px;color:#555;line-height:1.5">
      Six short ratings (variety, quality, atmosphere, layout, accessibility, overall) plus a place to leave a comment. Takes under a minute. Your answers stay anonymous — only aggregate scores are shared.
    </p>
    ${buttonHtml(args.surveyUrl, 'Take the survey')}
    ${priorPendingNoteHtml(args.priorPendingCount, args.priorPendingUrl)}
    <p style="margin:24px 0 0;font-size:12px;color:#777;line-height:1.5">
      This survey closes on ${escapeHtml(args.expiresAtDisplay)} (30 days after the day).
    </p>
  `
  const footer = `
    Sent by ${brandName(vertical)} for ${escapeHtml(args.marketName)}.<br/>
    <a href="${escapeHtml(args.unsubscribeUrl)}" style="color:#777">Don't email me surveys</a>
  `
  return shell({
    marketLogoUrl: args.marketLogoUrl,
    marketName: args.marketName,
    innerHtml: inner,
    footerHtml: footer,
  })
}

/**
 * Send a custom-HTML survey email via Resend. Returns success/failure
 * descriptor (never throws — survey email failure should not abort
 * cron generation, which is the canonical record).
 */
/**
 * Weekly digest (cadence.ts, owner 2026-08-29): ONE email per person per week
 * listing each place with its own survey link. Replaces the per-market-day
 * email for vendors and for buyers past their second purchase.
 */
export function buildWeeklySurveyEmail(args: {
  vertical: string
  kind: 'vendor' | 'buyer'
  recipientName: string | null
  weekDisplay: string
  places: Array<{ marketName: string; surveyUrl: string }>
  listUrl: string
  expiresAtDisplay: string
  unsubscribeUrl: string | null
}): { subject: string; html: string } {
  const isVendor = args.kind === 'vendor'
  const placeNoun = args.vertical === 'food_trucks' ? 'spot' : 'market'
  const n = args.places.length
  const subject = isVendor
    ? `Your week in review — ${n} ${placeNoun}${n === 1 ? '' : 's'} to rate (${args.weekDisplay})`
    : `How was your week? ${n} ${placeNoun}${n === 1 ? '' : 's'} to rate (${args.weekDisplay})`
  const greeting = args.recipientName ? `Hi ${escapeHtml(args.recipientName.split(' ')[0]!)},` : 'Hi,'
  const list = args.places.map((p) => `
      <li style="margin:0 0 8px">
        <a href="${escapeHtml(p.surveyUrl)}" style="color:${BRAND_GREEN};font-weight:600">${escapeHtml(p.marketName)}</a>
      </li>`).join('')
  const innerHtml = `
    <p style="margin:0 0 12px">${greeting}</p>
    <p style="margin:0 0 12px;line-height:1.6">
      ${isVendor
        ? `Once a week we ask how each place you set up at went for you — traffic, sales, layout, site access. This week (${escapeHtml(args.weekDisplay)}) that's:`
        : `Once a week we ask how the places you picked up from went. This week (${escapeHtml(args.weekDisplay)}) that's:`}
    </p>
    <ul style="margin:0 0 12px;padding-left:20px">${list}</ul>
    <p style="margin:0 0 12px;line-height:1.6">
      Each one is 30 seconds. ${isVendor ? 'Only the organizer and platform admin see your ratings.' : 'Your answers stay anonymous, and if there are other places you wish were on the app, there is a spot to tell us.'}
    </p>
    <p style="margin:0 0 4px"><a href="${escapeHtml(args.listUrl)}" style="color:${BRAND_GREEN}">See all your surveys</a></p>
    <p style="margin:0;font-size:12px;color:#666">Surveys close ${escapeHtml(args.expiresAtDisplay)}.</p>
  `
  const footerHtml = `Sent by ${brandName(args.vertical)}.${args.unsubscribeUrl ? `<br/><a href="${escapeHtml(args.unsubscribeUrl)}" style="color:#666">Unsubscribe from survey emails</a>` : ''}`
  return { subject, html: shell({ marketLogoUrl: null, marketName: brandName(args.vertical), innerHtml, footerHtml }) }
}

export async function sendSurveyEmail(args: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY not set; email skipped.' }
  }
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: 'Farmers Marketing <updates@mail.farmersmarketing.app>',
      to: args.to,
      subject: args.subject,
      html: args.html,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
