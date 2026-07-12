# Sales Tax Readiness — Stripe Tax (calculation) + TaxCloud (filing)

**Created:** 2026-06-21. **Status:** PRIORITY BACKLOG (finish current in-flight features first). **Source:** Stripe + TaxCloud published docs, fetched 2026-06-21 (URLs at bottom).
**Plan owner decision:** Stripe Tax does per-jurisdiction **calculation/collection**; TaxCloud does the **filing** (pulls collected-tax data from Stripe monthly). This reframes the unfinished "sales tax module" — we are **not building a calculator**, we're **wiring two services + fixing payout withholding + classifying products**.

> **Confidence key:** **[DOC]** = stated in the vendor's published docs (high confidence). **[VERIFY]** = must confirm directly with TaxCloud / a tax advisor before building — do not assume.

---

## 1. The model (confirmed [DOC])

- **Stripe Tax** calculates + collects tax at checkout (`automatic_tax[enabled]=true`), **only in jurisdictions where we've added registrations**. Fee ~0.5%/transaction **[VERIFY exact rate on the pricing page]**.
- **TaxCloud** connects to our Stripe account (OAuth "Link Account" → "Go Live"), **pulls sales monthly, tracks collected tax by jurisdiction, and files returns**. As a Streamlined Sales Tax (SST) **Certified Service Provider**, filing is **free in SST member states** (~24 — the "SSUTA vouchers") and **paid in non-SST states like Texas** **[VERIFY Texas is non-SST + the current member-state list]**.

---

## 2. What this means for OUR app (the parts that matter)

### 2a. We are the Merchant of Record (marketplace facilitator) [DOC]
For a Connect marketplace, **the platform** calculates/collects/remits tax using **the platform's** registrations — connected accounts (vendors) do **not** collect or file, and their tax info is ignored by Stripe Tax. So tax is ONE centralized obligation on us, not per-vendor. Stripe explicitly says to **consult a tax advisor** to confirm nexus + facilitator obligations.

### 2b. ⚠️ Tax must be withheld from vendor payouts — touches CRITICAL-PATH money code
With destination charges, the platform receives the full amount **including tax**, and must **NOT** transfer the tax portion to the vendor. Stripe's guidance: reverse the tax amount from the transfer (or transfer gross-minus-tax). Today `pricing.ts` + checkout/transfer logic splits buyer-paid into vendor payout + platform fee with **no tax line**. Adding tax means: buyer pays subtotal + our fees **+ tax**; the vendor's cut must **exclude** the tax.
- **Affected (all protected/critical-path — careful, gated work):** `src/lib/pricing.ts`, `api/checkout/session`, `api/checkout/external`, market-box + booth-rental checkout creators, `src/lib/stripe/payments.ts`, `src/lib/stripe/webhooks.ts`, vendor payout/transfer logic.
- Per-file approval required for each (change-discipline Rule 3). Real money — measure twice.

### 2c. Product tax codes — material for our verticals [DOC + domain judgment]
Stripe calculates using a **tax code per product**. Not cosmetic for us: **fresh produce/groceries are often exempt or reduced-rate** (FM); **prepared food is taxable** (FT). A blanket code would over/under-charge real buyers (real-numbers integrity). Need to map listings → correct Stripe tax codes (likely via our existing categories): `txcd_…` groceries vs prepared food. **[VERIFY the exact codes for each food category.]**

---

## 3. Readiness checklist

### Stripe side (config, no app code)
- [ ] Set Tax Settings (head office location) — Dashboard or `POST /v1/tax/settings`.
- [ ] Add **registrations per nexus state** — Dashboard or `POST /v1/tax/registrations` (`country=US`, `state=XX`, `type=standard`).
- [ ] Assign **product tax codes** (preset default + per-category overrides for food).
- [ ] Enable on every Checkout Session creator: `automatic_tax[enabled]=true`, `automatic_tax[liability][type]=self`, `invoice_creation[enabled]=true` + `invoice_creation[invoice_data][issuer][type]=self`.

### TaxCloud side (account, no app code)
- [ ] Business Profile: legal name, **FEIN**, addresses, contact email.
- [ ] Locations & States: origin address + **every nexus state** marked active.
- [ ] **TIC code(s)** per what we sell.
- [ ] **Link Stripe** (Integrations → Add Connection → Stripe → grant access) → **Go Live**.
- [ ] API auth = `X-API-KEY` header + a `ConnectionID` (UUID). Separate **test vs production** connections (no separate sandbox).

### Our code (the real build)
- [ ] Tax-withholding payout change (2b) — exclude tax from vendor transfers. **Critical-path.**
- [ ] Add `automatic_tax` + `liability=self` + `issuer=self` to all checkout-session creators.
- [ ] Product → tax-code classification (2c) — map categories to Stripe tax codes.
- [ ] Capture `total_details.amount_tax` through webhooks/order records for reconciliation.
- [ ] Code-stability Rule 2.1: record before/after on any payout math change; never let the vendor's net move silently.

---

## 4. Verify before building (open questions)

1. **THE CRUX:** does TaxCloud's Stripe integration **file off the tax Stripe already collected**, or re-derive via its **TIC**? If both calculate, Stripe tax-codes and TaxCloud TICs must agree or filings won't reconcile. Confirm TaxCloud consumes Stripe-collected tax (no double-calc).
2. Does TaxCloud's Stripe integration support the **Connect/marketplace (platform-level) model** — pulling the platform account's transactions, not per-connected-account?
3. **Nexus + facilitator obligations** per state (tax advisor) — which states we register in.
4. **Correct tax codes** for our food categories (FM exempt produce vs FT prepared food).
5. Exact **Stripe Tax fee** + **TaxCloud pricing** for non-SST states (Texas).

---

## 5. Scope note
This **shrinks** the long-pending sales-tax module: calculation is Stripe's, filing is TaxCloud's. Our remaining build is (a) the payout-withholding fix, (b) checkout `automatic_tax` wiring, (c) product tax-code classification, (d) webhook tax capture — plus the account/registration setup (no code). The risk concentrates in (a) because it touches the money path.

---

## Sources (fetched 2026-06-21)
- Stripe Tax for marketplaces: https://docs.stripe.com/tax/tax-for-marketplaces
- Use Stripe Tax with Connect: https://docs.stripe.com/tax/connect
- Merchant of record (Connect): https://docs.stripe.com/connect/merchant-of-record
- Collect tax with Checkout: https://docs.stripe.com/tax/checkout
- Tax Registrations API: https://docs.stripe.com/api/tax/registrations
- Set up Stripe Tax: https://docs.stripe.com/tax/set-up
- TaxCloud API setup & authentication: https://docs.taxcloud.com/guides/getting-started/setup-and-authentication
- TaxCloud Stripe integration (announcement): https://taxcloud.com/blog/taxcloud-releases-new-integration-with-stripe/
- TaxCloud Stripe help category: https://support.taxcloud.com/category/170-stripe
