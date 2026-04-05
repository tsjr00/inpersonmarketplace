# Current Task: Session 67 — Wrap Up + Next Session Plan
Updated: 2026-04-04

## Status: Major event system build complete. Form redesign + vendor invitation rework next.

## Session 67 Commits (18 on staging, not yet on prod)
1. FM landing page redesign (3 rounds of corrections)
2. FK disambiguation (PostgREST market_vendors ↔ vendor_profiles)
3. Staging email URL fix (VERCEL_ENV)
4. Wave-based ordering (full system: DB + RPCs + APIs + shop page UI)
5. Admin wave generation + settlement report company-paid support
6. Organizer event cancel API
7. FM notification language fixes (types.ts)
8. Select page vertical awareness (15 edits)
9. Email audit fixes (cancel route branding + vendor message fallback)
10. Event request form overhaul (selections, skip logic, dedup)
11. Attendee my-order page with QR code
12. Vendor event prep sheet
13. Settlement notification payout amount fix
14. Organizer event card enhancement (waves, participation, value)
15. Vendor Pickup Mode event tab

## NOT YET ON PROD — 18 commits ahead of origin/main

## Next Session: Event Intake Redesign + Vendor Invitation Rework

### 1. Quick-Start Event Form (slim down from 38 fields to ~7)
**Keep on the public form:**
- Company/organizer name
- Contact email
- Event date
- Estimated headcount
- City + State
- Indoor / Outdoor / Either
- Vendor categories (checkbox pills)

**Move everything else to the organizer event card on dashboard.**

**Confirmation screen shows:** "Based on your event details, we found **45 qualified vendors** in your area. Sign in to your event dashboard to narrow your options."

**Architecture changes needed:**
- Simplify `EventRequestForm.tsx` to 7 fields
- Run preliminary vendor match on submit (city + categories) and return count
- New endpoint: `PATCH /api/events/[token]/details` for progressive updates from dashboard
- Expand organizer event card with collapsible detail sections + completion progress bar
- Auto-redirect organizers to event card on login
- Gate vendor matching on data thresholds (location + type + budget = full match)

### 2. Vendor Event Invitation Rework
**File:** `src/app/[vertical]/vendor/events/[marketId]/page.tsx`

Three changes:
- **Revenue estimate — show the math:** Instead of "could generate $X-$Y" show the equation:
  - "Total guests: 200 ÷ 4 vendors = ~50 servings for you"
  - "At your average item price of $12.50 × 50 servings = $625 estimated gross"
  - "Platform fee: 6.5% = ~$41 | Your estimated payout: ~$584"
- **24hr clock → 12hr AM/PM:** `event_start_time` and `event_end_time` currently show as "11:00 — 14:00". Change to "11:00 AM — 2:00 PM"
- **Consolidate 4 info cards into Event Details section:** The 4 separate cards (Date, Headcount, Time, Location) take up too much space. Merge into the Event Details section as compact rows within one card.

### 3. Organizer Login → Event Dashboard
- Check if user has organizer_user_id on any active catering_request
- If yes, scroll to / prioritize event card on dashboard
- Or redirect to a dedicated event management section

## Key Decisions Made This Session
- Wave ordering: 30-min fixed waves, 1 item per attendee, company-paid MVP, walk-ups fill next available
- QR codes: client-side rendering via `qrcode` package, displayed on my-order page
- Pickup Mode: Daily/Events tab toggle, not separate page
- Organizer dashboard: enhance existing card, not separate page
- Event form redesign: quick-start + progressive dashboard collection (not big upfront form)
- Vendor invitation: show revenue math explicitly, consolidate top cards

## Migrations Applied This Session
| Migration | Dev | Staging | Prod |
|-----------|-----|---------|------|
| 110 — event_waves schema | ✅ | ✅ | ❌ |
| 111 — wave RPC functions | ✅ | ✅ | ❌ |
| 112 — fix company-paid payout (6.5% fee) | ✅ | ✅ | ❌ |

**Schema snapshot:** Changelog updated for 110-112. Structured tables STALE — need REFRESH_SCHEMA.SQL results to rebuild.
