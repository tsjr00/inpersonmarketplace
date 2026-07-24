# Staging Test — Recent Work (2026-07-23)

Session-specific checklist for work shipped 2026-07-20→23: booth/spot map feature
(mig 205), support pages, logic-testing fixes (A1/A2/S3-1), admin vertical-scope
lockdown. (The broader canonical checklist is `staging_test_checklist.md`.)
Test one section at a time. **Do SETUP first** or several tests won't display right.

## ⚠️ SETUP FIRST
**Accounts (staging):** platform admin (tsjr00/Jen) · FM market manager · FT park operator ·
FM vendor (approved) · FT truck · buyer. Stripe TEST mode (card `4242 4242 4242 4242`).

**One-time data setup (blocks later sections):**
- [ ] BOOTH MAP: FM manager uploads a booth map + FT operator uploads a spot map (have one image AND one PDF ready). Vendor map tests (D/E) show nothing until done.
- [ ] FM market has booth inventory (>= 1 size tier).
- [ ] FT park has >= 1 spot, park_mode = paid.
- [ ] FM vendor has >= 1 existing booth booking; FT truck has >= 1 park booking (for D5/E5 map-link tests).

## A - Marketing/info pages (no login; test FM + FT)
- [ ] /about (FM) community/purpose copy + headings
- [ ] /about (FT) culinary/convenience copy
- [ ] /about in Spanish (flip locale) renders
- [ ] /how-it-works (FM); FT version shows 15-min cancellation grace (not 1hr)
- [ ] /market-manager-program booth-fee example = $25 -> $26.78 / $23.37
- [ ] /features redirects to /how-it-works

## B - FM Market Manager dashboard (login: FM manager)
- [ ] "Booths & this week" -> Booth map card below booth inventory
- [ ] Upload image -> previews inline
- [ ] Replace with PDF -> "View booth map (PDF)" link opens the PDF
- [ ] >3 MB file rejected; non-image/PDF rejected
- [ ] Remove -> confirm dialog -> cleared
- [ ] Re-upload an image (leave in place for Section D)
- [ ] Other manager cards still load

## C - FT Park Operator dashboard (login: FT operator)
- [ ] "Park setup" -> Spot map card below spot inventory
- [ ] Upload image; Replace with PDF; Remove - all work
- [ ] Re-upload a map (leave for Section E)
- [ ] Park mode toggle, spots, schedule cards work

## D - FM Vendor booking + bookings (login: FM vendor; needs B map)
- [ ] "Book a booth" page -> map under "Where your booth will be", above form
- [ ] Book a booth (test card) completes
- [ ] vendor/bookings -> "View booth map" link per mapped-market booking -> opens map
- [ ] Market with no map -> no link, no broken UI

## E - FT Truck booking + bookings (login: FT truck; needs C map)
- [ ] "Book a spot" page -> map under "Where you'll park", above form
- [ ] Book a spot (test card) completes
- [ ] vendor/park-bookings -> "View spot map" link per mapped-park booking -> opens map

## F - Buyer checkout / money (login: buyer; Stripe test)
- [ ] S1-1 stale tip: add items + tip -> Stripe -> back -> set "No tip" -> checkout again -> NOT charged old tip
- [ ] S1-7 cross-vertical: items in both FM + FT carts -> neither checkout falsely blocks the other
- [ ] S1-6 chosen-market: multi-market listing validates against the market actually chosen
- [ ] One normal order completes; vendor sees it

## G - Vendor tier-switch (login: vendor on a paid tier)
- [ ] S8-1: start tier switch (Pro->Boss) -> abandon Stripe page -> still on current paid tier (NOT downgraded, no drafted listings)
- [ ] Complete a switch -> new tier active; old subscription cancelled in Stripe

## H - Admin surfaces (login: platform admin - confirms lockdown didn't break your access)
- [ ] Admin dashboard; error logs/reports; reports/analytics
- [ ] Event ratings, feedback, quality checks open
- [ ] Vendor mgmt: approve/reject/verify/fee-override work
- [ ] Event payments open + editable
- [ ] Admin management: view/add/remove admins + vertical admins
- [ ] Knowledge base: create/edit/delete article (platform-shared + vertical-specific)
- [ ] Markets/listings/order-issues admin pages load

## Advanced/optional (special conditions)
- [ ] S1-11 dashboard full-refund split: Stripe-dashboard full refund on a multi-item order -> per-item refund shows sensibly
- [ ] S2-2 double-refund guard: item in 'ready' -> buyer reports issue -> buyer cancels post-grace -> vendor "issue refund" -> only ONE Stripe refund
- [ ] S5-3 settlement override: only if a vendor has a fee override
- Not manually testable (code/test-verified): S4-1 open-redirect, S1-4 tip-0% direct-API, S3-1 Phase-5 cron timing
