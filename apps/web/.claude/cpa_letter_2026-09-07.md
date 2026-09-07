# CPA / SALT Counsel Letter — email-ready (2026-09-07)

Replaces the 8/2 chat-only draft (never saved). Q1–Q7 from sales_tax_readiness.md §6;
Q8–Q11 added after the September platform changes. Owner sends; answers get filed back
into the plan against each question number.

---

Subject: Texas sales tax questions — online marketplace for farmers markets & food trucks (11 questions)

Dear [CPA/SALT counsel],

We operate an online marketplace where buyers pre-order from local farmers-market vendors
and food trucks and pick up in person. We hold a Texas sales tax permit (assigned monthly
filing) and, as a marketplace provider under Tex. Tax Code §151.0242, we will collect and
remit on our sellers' behalf. Payments run through Stripe; there is NO shipping anywhere
on the platform — every order is picked up at a market, food-truck location, or vendor
pickup point. Before we build the collection system, we need your read on the following.
For each question we state our working assumption; we will build to your answers.

**Q1 — Sourcing (design-blocking).** Orders are placed online in advance and picked up in
person. Our assumption: the PICKUP LOCATION's combined rate governs each sale (we treat
the market's address as the place of business / point of possession). Because we are
pickup-only, that is a small fixed set of addresses. If sourcing instead follows the
buyer's address or our office, our rate logic and the payout-withholding math change —
please confirm before we build.

**Q2 — Voluntary "chip-in" contributions and tips.** At checkout a buyer may add an
optional, separately stated contribution to a local cause; it is disclosed as
not-tax-deductible and 100% is remitted to the organization (we keep none). Assumption:
not part of the taxable sales price. Also please address buyer TIPS (optional, separately
stated, passed to the vendor) — we understand Pub. 94-117's mandatory-gratuity rule may
be the closest analogue.

**Q3 — Event admission fees (before we design ticketing).** Pub. 96-211 says admission
fees are taxable and the promoter collects. Ticketing is under consideration, not built.
If we would be the promoter (or facilitator for one), that is a new taxable stream we
need to design for from the start — please advise before we design.

**Q4 — Our commission under 34 TAC §3.330(b)(5) (eff. 10/1/2025).** The rule appears to
tax marketplace-provider services as data processing (80% base). (a) Does it reach our
commission? (b) Does it reach our cut of booth/vendor-space rent, where the underlying
transaction is a nontaxable real-property license? (c) Current status of the ITFA /
rulemaking-authority challenges? Our posture: if taxable, we collect from the vendor
rather than absorb.

**Q5 — Food-truck vendor spaces: taxable parking or nontaxable vending space?** Rule
3.315(h) presumes parking-facility leases taxable; (h)(1) carves out flea-market-style
vending space when the lessor retains documentation of the non-parking purpose. Our
platform generates a signed clause stating the truck books selling space during posted
service hours — no overnight use or storage — and our copy avoids "parking" throughout.
Does that satisfy (h)(1), and what else should the operator retain?

**Q6 — Subscriptions: confirm the 80/20 data-processing treatment.** Our vendor tiers
($25/$50 monthly) and consumer buyer membership ($9.99). Assumption: taxable as data
processing with the 20% statutory exemption (§151.351, Rule 3.330, Pub. 96-259 01/2026),
for both vendor and consumer subscriptions.

**Q7 — Return-level totals for a marketplace provider.** The long form asks for total
sales / taxable sales / taxable purchases above the per-jurisdiction List Supplement.
What counts as OUR "total sales" — gross marketplace sales by our vendors, our own
revenue, or both?

**Q8 — Curated bundles (NEW; live feature).** A market manager may assemble items from
several vendors into one bundle sold at a single price = the items' live prices plus the
manager's assembly margin (which we pay to the market). Contents are fixed and displayed;
nothing is transformed — e.g., a basket of exempt groceries stays a basket of exempt
groceries. OUR POSITION (please confirm): taxability follows each item through the bundle
— exempt components exempt, taxable components taxable; combining items without changing
their form or characteristics does not create taxability. Sub-questions: (a) is that
position sound against any bundled-transaction doctrine, given the single stated price?
(b) How is the manager's assembly MARGIN treated — does it follow the contents (pro-rata),
stand alone as a service, or become taxable only when contents are taxable? (c) A bundle
may donate a stated share of the margin to a community cause — any effect?

**Q9 — Event vendor fees (NEW).** An event organizer may charge food trucks a fee to
participate in an event, collected through the platform and paid to the organizer.
Is that fee nontaxable like booth/space rent (Pub. 96-211), or a taxable service? Also:
some event orders are paid by a sponsoring company rather than individual buyers — we
assume those are ordinary taxable sales with the company as purchaser.

**Q10 — Market-box subscriptions (NEW to this list).** Buyers subscribe to a recurring
box of farm goods picked up weekly. We assume this is a recurring sale of the FOOD
(taxable/exempt by contents, sourced at the pickup market) — NOT a data-processing
service. Confirm, and advise when tax attaches (at each charge vs each pickup).

**Q11 — Our buyer-side platform fees (NEW).** Buyers pay our service fees (a percentage
plus small flat fees) as part of the order total. As the marketplace facilitator, are
our fees part of the taxable sales price of the underlying items (following each item's
taxability), or a separately taxable/non-taxable service charge?

Where useful, we can provide transaction samples, our fee math, and screenshots. Q1 and
Q8(b) gate active development — we'd value those first if answers come piecemeal.

Thank you,
[Owner]

---
**Internal routing on answers:** Q1→Phase 3 withholding build unblocks · Q2→checkout
taxable-base config · Q3→ticketing design gate · Q4→stream 4 posture · Q5→operator
records guidance · Q6→Phase 2 config confirm · Q7→filing report totals · Q8→bundle calc
allocation (build ships pro-rata; adjust) · Q9→event fee stream classification ·
Q10→market-box stream config · Q11→fee-line tax codes.
