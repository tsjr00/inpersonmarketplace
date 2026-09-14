# Test Charters — pick one, set a timer, use the app, tell us what happened

**You do not need to be a tester.** Use the app the way you would if it were real. Twenty minutes per charter is
plenty. Stop when the timer ends even if you are mid-task — tell us where you got stuck.

## How to report (four lines, your own words)

```
Where:  the page you were on (paste the URL) and the card/button you were using
Did:    what you did, step by step, as you remember it
Saw:    what actually happened (a screenshot helps a lot)
Wanted: what you expected or wished it had done — and any thoughts on how it should work
```
Add your device (e.g. iPhone Safari, Windows Chrome) once at the top of your message.

**Report it even if you think we already know.** Matching reports to known issues is our job, not yours.
Do not rate severity. Do not decide whether something is a bug. Confusion counts — "I didn't know what this button
did" is one of the most useful things you can send.

Send reports to the owner, who pastes them into the project log. Anything is fine: a text, an email, a note.

---

## Priority areas right now (owner sets; updated 2026-09-14)

1. **Market bundles** — buying one, collecting one, cancelling one (as buyer, as vendor, as market manager)
2. **Events** — invitations, menu approval, the organizer's dashboard, the shop
3. **Market boxes** — finding them on browse, buying, the weekly pickup
4. **Anything on a phone** — layout, wrapping, buttons that are hard to tap

---

## Charters by role

### Buyer

**B-1 First visit, no account.** Open the site on your phone. Find something to buy near you without signing in.
Does the location step make sense? Change the distance. Does the list change the way you'd expect?

**B-2 Buy one thing.** Sign up, add one listing to your cart, check out with the test card, and follow it to
pickup: acknowledge when the vendor says it's ready, and note the timing rule you're shown.

**B-3 Buy a market box.** Find a market box (a recurring box, not a one-time listing). Was it easy to find? Buy it.
Then look at your orders and subscriptions pages — do the two agree about your pickups?

**B-4 Buy a market bundle.** On a market's page, find the bundles section. Buy one. Note what the success screen
tells you about where to collect. Then wait for the "ready" message and count how many messages you receive.

**B-5 Cancel something.** Cancel an order before the vendor confirms; then try cancelling a different one after
the vendor has confirmed. Note the refund amounts you're shown and whether the warning text made sense.

**B-6 Get lost on purpose.** Use the filters on the browse page. Try to find "everything I can order right now."
Try to find market boxes. Tell us where you looked first.

### Vendor

**V-1 Set up shop.** Sign up as a vendor, complete onboarding, publish two listings with photos. Where did you
hesitate?

**V-2 Your week.** On your markets page, look at your next two weeks. Does it show where you'll be? Join a second
market on a day you already have one. What happened?

**V-3 Fulfil an order.** With a buyer's help: mark ready, then complete the 30-second handoff. Then do one where the
buyer is slow. What did each of you see?

**V-4 Market box week.** Skip a week on a market-box subscription. What did the buyer receive?

**V-5 Say yes to an event.** Accept an event invitation. Check your markets page for the event date. Try to book
something else on that date.

### Market manager

**M-1 Curate a bundle.** Create a bundle from two vendors' listings, submit it for approval, and after approval,
collect it on market day: the vendor handoff, then the buyer handoff. Note every message you received.

**M-2 Cancel a market date.** Cancel a date and read the result card. Do the counts look truthful?

### Event organizer

**E-1 Run an event.** Request an event, invite trucks, approve a menu (try removing an item), open pre-orders, and
watch the dashboard. What did you need that wasn't there?

### Admin

**A-1 Morning check.** Open the admin hub. Tap every card and tile at the top. Which ones take you somewhere,
which don't, and what did you want to see?

**A-2 Events board.** Open the events board, find a specific event, and see whether you can tell at a glance who is
in, who is on the bench, and whether market sales are blocked for anyone.

---

Exact step-by-step scripts, if you want them: `docs/Beta_Testing_Program.md` and
`apps/web/docs/staging_test_checklist.md`.
