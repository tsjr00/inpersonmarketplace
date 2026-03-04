# Layered Business Relationship Strategy
## Confidential — Internal Reference Document

**Status:** DRAFT — Requires attorney review before implementation
**Created:** 2026-03-04
**Purpose:** Define a progressive business relationship framework that protects platform innovations, trade secrets, and competitive advantages while maintaining appropriate transparency with users.

---

## Executive Summary

815 Enterprises operates multi-vertical marketplace platforms (farmersmarketing.app, foodtruckn.app) that incorporate proprietary business processes, payment systems, vendor management tools, and marketplace innovations. To protect these innovations from competitive misappropriation while maintaining trust with users, we employ a three-tier business relationship model where obligations escalate proportionally to the user's depth of access to proprietary systems.

This strategy is **not advertised** — it is woven naturally into the terms, conditions, and agreements that users accept at each stage of their relationship with the platform. The goal is to create legal deterrents and actionable protections if a competitor attempts to reverse-engineer platform innovations.

---

## The Three Tiers

### TIER 1: Platform User Agreement
**Triggered by:** Using the website (browsing, creating an account, making a purchase)
**Applies to:** All buyers, all visitors
**Legal classification:** Standard Terms of Service / Click-wrap Agreement

**What the user sees/knows at this level:**
- Public marketplace features (browsing, searching, ordering)
- Standard payment processing (Stripe checkout, buyer fees)
- Basic knowledge that external payment options exist for vendors
- Platform branding, pricing, and public-facing features

**Obligations at this level:**
- Standard ToS compliance
- **Limited confidentiality**: User agrees not to scrape, reverse-engineer, or systematically collect platform data, business methods, or processes
- **Intellectual property acknowledgment**: All platform features, processes, workflows, and user interfaces are proprietary to 815 Enterprises
- **Prohibition on competitive misuse**: Information gained through use of the platform shall not be used to develop, enhance, or assist any competing service
- **Data restrictions**: No systematic extraction of vendor data, pricing data, marketplace data, or operational data for competitive purposes

**Disclosure about external payments (Tier 1 level):**
- "Vendors may offer external payment options including cash, check, or other direct payment methods. When using external payment methods, the platform's standard buyer protections may not apply. External payment transactions are conducted directly between buyer and vendor."
- No details about HOW external payments are facilitated, fee structures, or the technical/business process

**Key legal concepts:**
- Browse-wrap / click-wrap enforceability
- Standard IP protection
- Data scraping prohibition (supports Computer Fraud and Abuse Act claims)
- Anti-competitive use clause

---

### TIER 2: Vendor Service Agreement
**Triggered by:** Submitting a vendor application
**Applies to:** All vendor applicants (pending, approved, rejected)
**Legal classification:** Service Agreement / Independent Contractor Agreement

**What the user sees/knows at this level:**
- Vendor dashboard and management tools
- Listing creation and management processes
- Basic understanding of fee structures (buyer fee %, vendor fee %, service fee)
- Subscription tier features and pricing
- Market enrollment and scheduling systems
- Order management workflows
- Quality check systems

**Additional obligations at this level (cumulative with Tier 1):**
- **Confidentiality of platform tools**: Vendor agrees that the vendor management tools, dashboards, analytics, and business processes they access are proprietary and confidential
- **Non-disclosure of business methods**: Vendor shall not disclose, describe, demonstrate, or otherwise communicate the specific features, processes, workflows, or capabilities of vendor-side platform tools to any third party, particularly competing platforms or their representatives
- **Non-solicitation of platform users**: Vendor shall not use platform data (customer lists, order histories, contact information) to solicit users for competing platforms
- **Fee structure confidentiality**: Specific fee percentages, structures, and calculations are confidential business information
- **Non-compete (narrow scope)**: During the term of vendor's active account and for [X] months after termination, vendor shall not use specific knowledge gained through the platform to assist in developing or operating a competing marketplace platform
  - **NOTE FOR ATTORNEY**: Scope must be carefully calibrated. Vendors CAN sell on other platforms. They CANNOT take our specific processes/systems and help someone build a competitor.

**Disclosure about external payments (Tier 2 level):**
- Vendor learns that external payment options are available
- Vendor sees the fee differential (e.g., 3.5% vs 6.5%)
- Basic operational information about how to enable/manage external payments
- BUT: The technical architecture, strategic reasoning, and innovative process design are not revealed until Tier 3

**Key legal concepts:**
- Executed agreement (not just browse-wrap)
- Independent contractor relationship established
- Consideration exists (access to marketplace, tools, customer base)
- Non-solicitation is generally more enforceable than non-compete
- Trade secret acknowledgment strengthens Defend Trade Secrets Act (DTSA) claims

---

### TIER 3: Vendor Partner Agreement
**Triggered by:** Completing all 4 gates of vendor onboarding AND being approved
**Applies to:** Fully approved, active vendors
**Legal classification:** Confidential Business Partnership / Technology Access Agreement

**What the user sees/knows at this level:**
- Full external payment system and how it operates
- Advanced analytics and business intelligence tools
- Proprietary vendor management features
- Internal operational processes
- Payout systems and financial workflows
- Quality scoring algorithms and criteria
- Geographic intelligence and marketplace expansion strategies (as they become available)
- Any beta features or upcoming capabilities

**Additional obligations at this level (cumulative with Tiers 1 and 2):**
- **Full NDA provisions**: Vendor acknowledges access to trade secrets and confidential business information. All proprietary systems, processes, methods, algorithms, and business strategies accessed through the platform are subject to non-disclosure obligations that survive termination of the vendor relationship
- **Trade secret acknowledgment**: Vendor explicitly acknowledges that the following constitute trade secrets under the Defend Trade Secrets Act (18 U.S.C. 1836) and applicable state trade secret laws:
  - External payment facilitation processes and systems
  - Vendor payout calculation methods and timing systems
  - Quality scoring algorithms and criteria
  - Geographic marketplace intelligence systems
  - Subscription tier feature differentiation strategy
  - Marketplace matching and recommendation systems
  - Any feature marked as "proprietary" or "confidential" in the platform
- **Enhanced non-compete**: Vendor shall not, during the term and for [X] months following termination:
  - Develop, assist in developing, advise, consult for, or invest in any marketplace platform that replicates or substantially imitates the proprietary processes accessed through 815 Enterprises' platforms
  - Share, describe, or demonstrate proprietary platform features or processes with competing platforms or their representatives
  - Use trade secrets or confidential information to recruit vendors or buyers away from 815 Enterprises' platforms
- **Cooperation obligation**: In the event of suspected trade secret misappropriation by a third party, vendor agrees to cooperate with 815 Enterprises' investigation and enforcement efforts
- **Injunctive relief consent**: Vendor acknowledges that breach of confidentiality obligations would cause irreparable harm and consents to injunctive relief as a remedy (no bond requirement)
- **Survival clause**: Confidentiality and non-disclosure obligations survive termination for [X] years

**Disclosure about external payments (Tier 3 level):**
- Full disclosure of external payment process, fee structure, and operational details
- How the platform facilitates external payments
- Fee differential explanation and business rationale
- Vendor responsibilities in external payment transactions

**Key legal concepts:**
- Executed NDA/confidentiality agreement with specific consideration
- Trade secret identification and acknowledgment (strengthens DTSA claims)
- Injunctive relief provision
- Survival provisions
- Business partnership duties

---

## Implementation Points

### Where Each Agreement is Presented

| Tier | Trigger Point | UI Location | Acceptance Method |
|------|--------------|-------------|-------------------|
| 1 | First visit / account creation | Footer link + registration checkbox | Browse-wrap + click-wrap |
| 2 | Vendor application submission | Vendor signup form | Checkbox + "I agree" before submission |
| 3 | Final onboarding step (documentation submission) | Onboarding completion modal | Explicit acknowledgment + digital signature |

### What's Already Built vs What Needs Building

**Currently exists:**
- Terms page at `/{vertical}/terms` (51KB, needs restructuring)
- Vendor signup flow with basic terms acceptance
- 4-gate onboarding system
- External payment system (built, documented)

**Needs to be built/modified:**
- [ ] Restructure terms page to clearly delineate Tier 1 (buyer) and Tier 2 (vendor) terms
- [ ] Add Tier 3 agreement as a separate document/acceptance during final onboarding gate
- [ ] Add explicit trade secret acknowledgment to Tier 3 acceptance flow
- [ ] Store agreement versions and acceptance timestamps in database
- [ ] Ensure external payment details are only shown to Tier 3 vendors (already gated behind vendor approval)
- [ ] Per-vertical language adjustments (FM vs FT terminology)

### Database Considerations

Consider adding:
```
user_agreement_acceptances:
  id, user_id, agreement_type (tier_1|tier_2|tier_3),
  agreement_version, accepted_at, ip_address, user_agent
```

This creates an audit trail proving each user accepted each tier of agreement, which is critical for enforcement.

---

## Vertical-Specific Adjustments

### Farmers Marketing (farmersmarketing.app)
- "Market" terminology throughout
- Agricultural-specific compliance references (organic certification, food safety)
- State agricultural exemptions where applicable
- Market box subscription-specific terms

### Food Truck'n (foodtruckn.app)
- "Park" and "location" terminology
- Mobile food vendor-specific compliance (health permits, mobile food licenses)
- Chef Box subscription-specific terms
- Event-specific terms for temporary venues

### Shared Core
- Fee structures (6.5% buyer + 6.5% vendor Stripe, 3.5% vendor external)
- Platform service fee ($0.15/order)
- Subscription tier model
- External payment system
- Payout processes
- Quality and verification systems

---

## What Constitutes a "Trade Secret" (for attorney reference)

For trade secret protection to apply under DTSA and state Uniform Trade Secrets Act (UTSA):

1. **The information must derive independent economic value** from not being generally known
2. **Reasonable efforts must be made to maintain secrecy** — this is why the layered gating matters
3. **The information must not be readily ascertainable** by proper means

### Platform innovations that likely qualify:
- External payment facilitation process (novel approach to in-person payment flexibility)
- Vendor payout timing and calculation methodology
- Quality scoring algorithm and criteria weighting
- Geographic marketplace intelligence system
- Tiered subscription feature differentiation strategy
- Vendor onboarding gate system and verification workflow
- Market-vendor-listing relationship architecture

### What likely does NOT qualify (publicly visible):
- That the platform exists and is a marketplace
- That vendors pay subscription fees
- That buyers pay a service fee
- General UI/UX patterns (these are common across marketplaces)
- That external payment options exist (but HOW they work could qualify)

---

## Enforcement Strategy

**Deterrence (primary):** The existence of layered agreements, explicit trade secret acknowledgments, and injunctive relief consent provisions creates significant deterrence. Most competitors will seek easier targets.

**Detection:** Monitor for:
- New marketplace platforms in the same vertical with suspiciously similar processes
- Former vendors appearing as advisors/founders of competing platforms
- Job listings from competitors seeking people with experience on our platform
- Social media or industry discussions revealing proprietary processes

**Response escalation:**
1. Cease and desist letter (cite specific agreement provisions)
2. Demand for injunctive relief (pre-consented in Tier 3)
3. DTSA federal claim (trade secret misappropriation)
4. State UTSA claims
5. Breach of contract claims (specific agreement provisions)

---

## Critical Notes for Attorney Review

1. **Non-compete duration**: Must be reasonable. 12-24 months is typical for technology agreements. Some jurisdictions (CA) won't enforce at all — need state-by-state analysis or choice-of-law provision.

2. **Choice of law / forum selection**: Consider Illinois law (815 Enterprises' home state?) with mandatory arbitration or specific court jurisdiction.

3. **Consideration for Tier 3**: The continued access to the platform and its proprietary tools IS the consideration. But stronger consideration (explicit benefit) makes the agreement more enforceable. The subscription discount / trial period could serve as additional consideration.

4. **Severability clauses**: Essential in every tier. If one provision is struck down, the rest survive.

5. **Consumer protection compliance**: Tier 1 terms can't be unconscionable. Review under FTC guidelines and state consumer protection statutes.

6. **Data minimization**: Any data we collect for enforcement must comply with privacy policy. Don't over-collect.

7. **Right to modify**: Reserve the right to update terms with notice. Changes to material terms should require re-acceptance.

8. **Electronic signatures**: Ensure compliance with E-SIGN Act and UETA for Tier 2 and 3 acceptances.

---

## Summary

| Aspect | Tier 1 (Buyer) | Tier 2 (Vendor Applicant) | Tier 3 (Approved Vendor) |
|--------|---------------|--------------------------|-------------------------|
| **Agreement name** | Platform User Agreement | Vendor Service Agreement | Vendor Partner Agreement |
| **Trigger** | Use website / create account | Submit vendor application | Complete onboarding + approval |
| **Acceptance** | Browse-wrap + click-wrap | Checkbox + submit | Explicit acknowledgment |
| **Confidentiality** | Basic (no scraping/reverse engineering) | Platform tools & fee structures | Full NDA + trade secrets |
| **Non-compete** | Competitive misuse prohibition | Narrow (can't help build competitor) | Enhanced (specific process protection) |
| **Non-disclosure** | Limited (public-facing info) | Vendor tools & processes | All proprietary systems |
| **Non-solicitation** | None | Platform user data | Platform users + vendors |
| **External payments** | "External options exist" | Fee differential visible | Full process disclosure |
| **Survival** | During use | Account term + [X] months | Termination + [X] years |
| **Injunctive relief** | Standard | Standard | Pre-consented |
| **Trade secret ack** | No | General | Specific + enumerated |
