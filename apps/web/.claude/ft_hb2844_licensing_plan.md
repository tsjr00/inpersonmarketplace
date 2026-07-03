# FT Vertical — HB 2844 DSHS Licensing Feature Plan (basis)

**Created:** 2026-06-21. **Status:** 🅱️ **BACKLOGGED** (deferred behind more urgent work — e.g. sales tax). **Vertical:** food_trucks (Texas).

> ## ⭐ DIRECTION DECIDED (2026-06-21): Option C — Hybrid
> - **`texasfoodtrucklaw.com` (owned)** = the public SEO funnel + the heavy/volatile, truck-owner-facing compliance tooling (the law explained, classification wizard, document checklist, deadline countdown, license lookup). Keeps the volatile rules-logic + liability OFF the core marketplace.
> - **The app** gets only a **thin, durable compliance-*status* layer** that serves the **food-truck-park-manager "premium destination" thesis**: truck doc vault + renewal reminder, the park-dashboard **"X of Y trucks license-ready"** signal (reuses the FM manager-views-vendor-docs pattern), a **"DSHS-licensed" trust badge**, and auto-including the park in each truck's §437B.154 location list (we already own the schedule).
> - **Principle:** **App = source of truth for identity + the durable compliance status; TFTL = mostly public/stateless.** Volatile compliance logic lives on TFTL where it can change safely.
> - **Coupling (v1, loosest-that-works):** TFTL→app **deep-link handoff + pre-fill token** (convert SEO traffic to a pre-filled vendor signup); app owns the status fields; possibly shared Supabase auth = one identity. **No live sync in v1.** Bidirectional status sync / shared license-lookup service = LATER, only once proven. Do NOT put TFTL on the core marketplace tables.
> - **Why the data weight is fine:** none of F1–F5 carries heavy data (reuses existing vendor-docs + location/schedule data). The cost was never bytes — it's volatility + liability + audience, all of which Option C pushes onto the standalone domain.
> - **Cheap next steps when un-backlogged:** (1) validate `texasfoodtrucklaw.com` search volume (checklist C); (2) scope which thin app-side signals reuse existing FM-manager components 1:1.
**Sources:** (a) `food truck law.docx` — research conversation (mostly *inferences*, flagged below); (b) the **authoritative** HB 2844 bill analysis (Tex. Health & Safety Code **Chapter 437B**) + DSHS pages, fetched 2026-06-21 (URLs at bottom). **NOT** sourced from the misnamed `HB2844.docx` file.

> **Confidence key used throughout:** **[STATUTE]** = in the enacted bill (high confidence). **[DSHS-RULE]** = deferred by the statute to executive-commissioner rules (adopted by May 1 2026) — exact values must be verified, do NOT hardcode. **[INFERRED]** = the conversation's guess from local guidance/portal behavior — plausible, verify against the real portal before building.

---

## 1. The law (what's actually true)

**[STATUTE]** HB 2844 (89th Texas Legislature, signed 2025-06-20) created **Chapter 437B** — a single statewide **DSHS Mobile Food Vendor license** that replaces local health permits.
- **Mandatory July 1, 2026.** DSHS stops issuing temp food-dealer permits to mobile vendors after 2026-06-30. Applications opened ~June 2026 via DSHS **Online Licensing Services** (Tyler Technologies-hosted).
- **One license per food-vending vehicle**; must display license + inspection certificate (§437B.051, .103). License **valid 1 year** from issuance (§437B.055), **non-transferable** (§437B.057), renewable with pre-expiry notice (§437B.056). **One application can cover all of an operator's vehicles** (§437B.052).
- **Three risk-based classifications** (§437B.151) — confirms the conversation's Type I/II/III inference:
  - **Type I** — prepackaged foods, low risk.
  - **Type II** — food requiring **limited** handling/preparation.
  - **Type III** — prepares, cooks, holds, and serves food.
  - **[DSHS-RULE]** The exact food categories per type, the classification questions, the fees, and inspection frequency are set by DSHS rule — **verify before encoding any wizard logic.**
- **Inspections:** pre-licensing inspection within **14 days** of a complete application; fail → denial (§437B.054). Ongoing **randomized** inspections **based on classification** (§437B.153), by DSHS or a local authority under a collaborative agreement.
- **Fees** (§437B.058): application + license/renewal **by classification**; initial inspection fee; annual inspection fee = avg cost × required annual inspections per class. **[DSHS-RULE]** exact $ amounts in the rules.
- **⭐ Itinerary / location reporting (§437B.154):** vendors must **make available a list of all locations they intend to operate**, via social media, website, **or a DSHS-prescribed submission**; DSHS keeps it in a **statewide database** (§437B.060). *This is the provision the conversation under-weighted, and it maps directly onto data our app already holds.*
- **[INFERRED]** Document-driven application packet (from local-jurisdiction prep guidance): local permit (if any), vehicle registration, liability insurance, food **manager** certificate, food **handler** cards, menu, equipment info, water/wastewater info, commissary/CPF info, unit photos, operational/process info. (§437B.104 ties food-safety certs to Chapter 438 — so manager/handler certs are real; the rest of the packet is portal-prep guidance, verify.)

---

## 2. Why this matters for our FT vertical (value thesis)

Every Texas food truck now **must** obtain and **annually maintain** a DSHS license, assemble a document packet, get classified, pass inspections, and **publish their operating locations**. That's a universal, recurring, deadline-driven pain — exactly the kind of "operating system" utility that makes an app sticky. And we already own most of the adjacent infrastructure:
- vendor **document upload + verification** (COI, food-truck permit, certifications),
- vendor **locations / markets / schedules** data (the itinerary §437B.154 wants),
- a **notification** system (renewals/expiry),
- an **onboarding-wizard** + **dashboard-card** grammar to mirror.

So the build is largely *re-pointing* existing capabilities at a new, legally-mandated job — high value, comparatively low new surface.

---

## 3. Feature set (organized; statute-grounded)

| # | Feature | What it does | Statute hook | Build risk |
|---|---------|--------------|--------------|------------|
| **F1** | **DSHS Document Vault + renewal tracking** | Vendor uploads the packet once; app tracks expirations, missing items, and renewal reminders (license = 1-yr). | §437B.052, .055, .104; [INFERRED] doc list | **Low** — reuses existing doc infra; no dependency on unpublished rules |
| **F2** | **Itinerary / Location-list generator** | Auto-build the "where I intend to operate" list from the vendor's existing markets/schedules/locations; export/share (website embed, or the DSHS-prescribed submission). | **§437B.154** | **Low–Med** — reuses our location data; submission mechanism TBD |
| **F3** | **Classification Wizard (Type I/II/III)** | 5–10 questions → "likely DSHS classification" + expected fees + inspection frequency + required docs. **Framed as guidance, not a determination.** | §437B.151, .058, .153 | **Med–High** — depends on [DSHS-RULE] criteria/fees; build AFTER verifying |
| **F4** | **Application / Inspection Readiness tracker** | Status pipeline: Documents uploaded → Inspection-ready → Waiting on inspection → Licensed. Pre-fill/organize what DSHS asks for. | §437B.054, .153 | **Med** — needs the real portal field map |
| **F5** | **Renewal + inspection reminders** | Notifications keyed to license expiry (1-yr) and randomized-inspection readiness. | §437B.055, .056 | **Low** — reuses notification system |

**Sequencing logic:** F1, F2, F5 depend only on things we already have + the *statute* (stable). F3 and F4 depend on **[DSHS-RULE]** + the actual portal screens — gate them behind verification.

---

## 3b. Additional FT compliance items to document (running list — beyond the DSHS HB 2844 packet)
Items a TX food truck must maintain that are **separate from** the DSHS Chapter 437B license (typically fire-code / local fire-marshal). Track as documents in the F1 vault (upload + expiry + renewal reminder) and/or surface as park-manager agreement statements (`ft_park_manager_design.md` P5). VERIFY each against the authoritative source before encoding — this is a to-document checklist, not verified statute.
- **Propane / LP-gas inspection** (added 2026-07-02) — LP-gas system inspection/certificate (fire-marshal / NFPA 58). Food trucks running propane cooking must pass and carry proof; renewable. Confirm TX/local cadence + issuing authority before building.

## 4. Reuse candidates (VERIFY before building — not yet re-read this session)

- FT document upload/verification: `FoodTruckPermitUpload`, `COIUpload`, `CertificationsForm`, `CategoryDocumentUpload`, the vendor-documents bucket + signed-URL flow (seen referenced in the mig-151 work). → F1.
- Document **expiry** handling (COI already has expiry concepts?) → F1/F5.
- Vendor **locations / market_vendors / schedules / weekly_booth_rentals** → F2 itinerary.
- **Notification** registry + cron → F5.
- **Onboarding wizard** + **ManagerCard/dashboard-card** patterns → F3/F4 UX.
- *(Each marked "verify" — confirm the component/column exists and its shape before designing on top of it.)*

---

## 5. Open questions / verify-before-build (compliance caution)

1. **[DSHS-RULE]** Exact Type I/II/III food categories + the official classification questions + fees + inspection frequencies — from the adopted DSHS rules (due May 1 2026) and the live portal. **Do not hardcode the conversation's guessed questions.**
2. **[INFERRED]** The exact required-document list + accepted formats — confirm against the actual application, not local prep pages.
3. **§437B.154 submission mechanism** — is there an API / structured submission, or only "publish a list (website/social) or a DSHS form"? Determines whether F2 can *submit* or only *generate*.
4. **Compliance framing (mandatory):** we are a **readiness/organization tool**, not the licensing authority and not legal advice. The Classification Wizard outputs a **"likely"** class as guidance — the statute makes DSHS/its rules the determiner (§437B.151). UX must say so explicitly.
5. **Scope:** Texas-only today. Other states differ — keep the module state-scoped so it doesn't leak assumptions into non-TX FT vendors.

---

## 6. Next intelligence (verification tasks, before F3/F4)

- Pull the **adopted DSHS rules** (post May 1 2026) for Type categories, fees, inspection cadence.
- Map the **Texas Regulatory Services / Online Licensing** portal screens (the conversation's Option A: test account) — exact fields, uploads, classification branch, inspection/itinerary capture.
- Confirm the **§437B.154** location-list submission channel.

---

## Information gaps — revisit checklist

What we DON'T yet know, needed to build F1–F5. Status: ⬜ unknown · ✅ found. Re-check on each revisit (DSHS rules were due ~May 1 2026; the live portal is the other source). "Blocks" = which features can't be finalized without it.

### A. DSHS rules / statewide law mechanics (external — DSHS rules + live portal)
- ⬜ **Exact Type I/II/III food-category boundaries** — the precise line between "limited handling" (II) and "prepares/cooks/holds/serves" (III). *Blocks F3, F4.*
- ⬜ **Official classification questions** the portal asks to assign a type. *Blocks F3.*
- ⬜ **Fee schedule** — $ for application, license, renewal, initial inspection, annual inspection, per type. *Blocks F3.*
- ⬜ **Inspection frequency per type** (# of annual inspections each class requires). *Blocks F3, F4.*
- ⬜ **Required-document list (authoritative)** + accepted file formats/specs — vs the [INFERRED] local-prep list. *Blocks F1, F4.*
- ⬜ **§437B.154 location-list submission channel** — API? structured feed? a DSHS form? or just "publish on website/social"? Determines whether F2 can *submit* or only *generate/publish*. *Blocks F2.*
- ⬜ **Public license-lookup / verification** — is there a public way (page or API) to confirm a truck's license # + status? Enables a "verified licensed" trust badge for parks/buyers. *Enables a park-manager trust feature.*
- ⬜ **DSHS statewide database (§437B.060) — any public/API surface** for license data or itinerary. *Blocks F2 submission, the trust badge.*
- ⬜ **License-term trigger — CONFLICT to resolve:** statute §437B.055 says "first anniversary of **issuance**"; a DSHS-sourced summary said "one year from the **pre-licensing inspection**." Pin down which. *Blocks F5 reminder math.*
- ⬜ **Renewal mechanics** — notice timing, grace period, whether renewal triggers re-inspection. *Blocks F5.*
- ⬜ **"Complete application" definition** — what set of fields/uploads starts the 14-day inspection clock (§437B.054). *Blocks F4.*
- ⬜ **Multi-vehicle + vehicle-substitution specifics** — how one application covers many trucks; how a swapped vehicle is handled in the record. *Blocks F1, F4.*
- ⬜ **Commissary/CPF + water/wastewater** — are these required fields/uploads, and in what form? *Blocks F1, F4.*

### B. Our own codebase (internal — verify before reuse; cheap to answer)
- ⬜ Do our existing vendor-document records carry **expiry dates** (COI/permit/cert), and is there any expiry-reminder cron already? *Reuse for F1/F5.*
- ⬜ Exact shape of the **FT vendor doc components/tables** (`FoodTruckPermitUpload`, `COIUpload`, certifications, vendor-documents bucket) — confirm before extending. *F1.*
- ⬜ The **location/schedule data model** for FT (markets/market_vendors/schedules/booth rentals in food_trucks) — confirm it holds enough to generate a §437B.154 itinerary. *F2.*
- ⬜ Whether the **notification system** can key a reminder off an arbitrary expiry date. *F5.*

### C. Strategy / business (for the in-app vs standalone-domain decision)
- ⬜ **Search-volume validation** for `texasfoodtrucklaw.com` terms (is the funnel thesis real — how much HB 2844 / "texas food truck license" traffic?).
- ⬜ **Legal review** of offering compliance "guidance" (classification wizard especially) — liability + required disclaimers.
- ⬜ **Other-state trajectory** — are other states copying HB 2844? (scalability of the compliance angle beyond TX.)

## Sources (fetched 2026-06-21)
- HB 2844 bill analysis (Chapter 437B): https://capitol.texas.gov/tlodocs/89R/analysis/html/HB02844S.htm
- DSHS Mobile Food Vendors: https://www.dshs.texas.gov/retail-food-establishments/permits-retail-food-establishments/mobile-food-vendors
- DSHS HB 2844 overview (PDF — not text-extractable in this pass; re-pull for fee/type specifics): https://www.dshs.texas.gov/sites/default/files/phfpcommittee/docs/phfpc-hb-2844-overview-10.08.2025.pdf
- News (timeline/July 1 mandate): KSAT 2026-06-05; KVIA 2026-06-04
