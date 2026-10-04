# Tax-only event order route — research (started 2026-10-03)

Owner 2026-10-03: host-paid events NOT built before the next Prod push · "there are no live host-paid event" ·
"do a more complete exploration and read of the code / system … then tell me what you plan to change."

## Checklist
- [x] A. Order route `api/events/[token]/order/route.ts` (full read, 134 lines)
- [x] B. RPC body in repo (mig 119, full read) + live column evidence
- [ ] C. ShopClient company-paid + hybrid UI
- [ ] D. Intake: EventRequestForm + `api/event-requests`
- [ ] E. Approval (`event-actions.ts`) + admin events route + waves/reserve + verify-code
- [ ] F. Downstream readers of `payment_model` (fulfill/confirm/reject/resolve-issue/settlement/my-order/dashboards)
- [ ] G. Tests/pins that read these files (BR-1/2/8, flow-integrity 3A/3B, tax Batch 2 pin)
- [ ] H. Attendee-paid event checkout → tax engine; event markets and tax codes
- [ ] I. Docs: Codebase map 14, host-paid design §8, registry/printable rows, flags.ts condition 3

(2026-10-03 later: C–I all done — sections below.)

## C. ShopClient ✅ (read 140-460, 540-1030)
- Company-paid wave flow shows only when `payment_model==='company_paid' && waveOrderingEnabled && accessCodeVerified
  && !companyAllowanceUsed` `:342`; then the normal cart flow is hidden (`!isCompanyPaid` gates `:1022,1078,1276`).
- `handleConfirmOrder` posts `{reservation_id, listing_id, vendor_profile_id, wave_id}` — NO `access_code` `:436-445`;
  the route 403s whenever the event has a code `order/route.ts:65-73`; approval mints a code for every
  company_paid/hybrid event (`event-actions.ts:171-178`, stored `event-requests/route.ts:394-395`,
  `admin/events/[id]/route.ts:402-403`). ⇒ SECOND independent break, ahead of the RPC: confirm always 403s.
- No code / wave ordering off → attendee uses the normal cart and pays at checkout ("Don't have a code? You can still
  browse and order — you'll pay at checkout." `:617`) → `checkout/session` → taxed.
- Hybrid: `canUseCompanyAllowance` `:344` is defined and never used; only banners `:623-651`. Hybrid never calls the
  order route (and the route refuses non-company_paid `:57`).

## D. Intake ✅
- Form offers exactly two models: company_paid, attendee_paid (`EventRequestForm.tsx:89-92`); hybrid hidden
  (comment `:393-394`), its cap field renders only for hybrid `:859`.
- API accepts company_paid / attendee_paid / hybrid, anything else → null (`event-requests/route.ts:250,265`).
  null reads as attendee_paid in the shop (`shop-data.ts:371`).

## E. Approval / waves ✅
- Waves generated only by admin: on admin `ready` flip when company_paid (`admin/events/[id]/route.ts:523-532`) and
  the admin generate-waves route (`:84`). Grep of `generateEventWaves` callers = those two + the definition.
  Self-service events never get waves → `wave_ordering_enabled` false → company-paid event behaves as attendee-paid.

## F. Downstream `payment_model === 'company_paid'` branches ✅ (dormant — no such order can exist)
fulfill `:91,100,147,206` · confirm `:114,121` · reject `:185` · resolve-issue `:228` · settlement `:342-351` ·
my-order page `:151` · labels on organizer/vendor/admin pages. None change under the plan.

## G. Tests that read these files ✅
- BR-1 pins mig 112 text `0.065` (`cross-file-business-rules.test.ts:56-61`); BR-2 pins the route string
  `payment_model !== 'company_paid'` `:84-87`; BR-8 pins `sendNotification`, `new_paid_order`, `order_confirmed` in
  the route `:297-306`; flow-integrity 3A pins the RPC name is called in app code `:191`; 3B pins the route file
  exists and contains `company_paid` `:224-229`. ⇒ an early refusal that KEEPS the rest of the route leaves every
  pin green with no test edits. Deleting the route body would trip BR-2/BR-8/3A.
- Tax flag pin `flow-integrity.test.ts:3470-3476` pins the three flag expressions, not the comment text.

## H. Attendee-paid events and tax ✅ (route) / ⚠ gap noted
- Event carts go through `checkout/session` → `computeCheckoutTax` with each item's `market_id` `:770-779`; a market
  that is not tax-ready refuses the checkout `:780-786`.
- ⚠ RELATED GAP (not the order route; Medium — alert path not fully traced): every event creates a NEW market row
  with no codes. The only codes writer is the admin route (`admin/markets/[id]/tax-jurisdictions/route.ts:226`); the
  admin "codes needed" alert fires from the vendor listing-attach route (`vendor/listings/[listingId]/markets/
  route.ts:262`). After the flip, an FT event's checkout refuses until an admin enters codes for that event's market.

## I. Docs ✅
- Map 14 already says the route is a dead path, two breaks (`14_Events.md:34,73,105-114`); its line `:233` says the
  RPC fee math is UNVERIFIED (body unread at mapping time — read now, section B).
- Registry + printable: no company-paid / host-paid / hybrid rows (grep, presence only).
- `flags.ts:14-15` condition 3 = "event order route wired through the seam".
- Host-paid design §8: five open questions; tax on host meals not ruled.

## PLAN presented 2026-10-03 (awaiting the owner's word)
Switch company-paid OFF explicitly, no migration: (1) kill-switch constant, order route refuses first; (2) intake API
stops accepting company_paid/hybrid; (3) intake form — owner picks hide vs "coming soon"; (4) flags.ts condition 3
reworded; (5) pin + route-execution spec; (6) map/registry/printable/decisions.

## A. Order route ✅
- Auth → body `{reservation_id, listing_id, vendor_profile_id, wave_id, access_code}` → event by token in
  approved/ready/active `:46-51` → refuses unless `payment_model === 'company_paid'` `:57-62` (so HYBRID can never
  reach the RPC through this route) → access code check `:65-73` → ONE rpc `create_company_paid_order` `:76-85` →
  RPC error = 500 "Failed to create order" `:87-90` (console.error) → notifications `:98-126`.
- No pricing, no tax, in TS.

## B. RPC ✅ (repo) / live body NOT fingerprinted
- Repo body = mig 119 (latest defining; 149/152/250 = grants only). Reads `l.base_price_cents` `:72`; cap check
  joins `o.user_id`, `o.market_id` `:108-109`; INSERT orders `(user_id, vertical_id, market_id, status,
  payment_model, event_wave_reservation_id, order_number, subtotal_cents, buyer_fee_cents, service_fee_cents,
  total_cents, vendor_payout_cents, platform_fee_cents, created_at)` `:147-161`.
- LIVE Dev export 2026-09-13 (`Schema Refresh/09132026/Supabase Snippet query 1.csv:832-869`) — the full `orders`
  column list: NO `user_id`, `market_id`, `buyer_fee_cents`, `service_fee_cents`, `vendor_payout_cents`;
  `buyer_user_id` NOT NULL `:833`. `base_price_cents` exists live only on `park_spots` (`:904`), not `listings`.
  Snapshot (stamp 261) agrees: `SCHEMA_SNAPSHOT.md:1002-1034` (listings: `price_cents`), `:1541-1581` (orders).
- Signature live 09-13 = the 6-arg mig-119 signature, SECURITY DEFINER (`query 6.csv:116`).
- ⇒ with the repo body, the first statement that touches `l.base_price_cents` raises 42703 → route 500. The path
  cannot create an order. Remaining gap to 100 %: `md5(prosrc)` of the live function on Dev/Staging/Prod (owner
  query) — a drifted, working body is the only way this could be false.
