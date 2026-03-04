import type { LegalDocument } from '../types'

export function getVendorPartnerAgreement(): LegalDocument {
  return {
    type: 'vendor_partner',
    title: 'VENDOR PARTNER AGREEMENT',
    subtitle: 'Confidential Business Partnership Terms',
    lastUpdated: 'March 2026',
    preamble: [
      'This Vendor Partner Agreement ("Partner Agreement") is entered into between you ("Vendor Partner," "you," "your") and 815 Enterprises ("Company," "we," "us," "our"), effective upon your completion of the vendor onboarding process and acceptance of this Partner Agreement through the Platform located at [PLATFORM_DOMAIN].',
      'IMPORTANT: This Partner Agreement contains binding confidentiality, non-disclosure, non-competition, and trade secret provisions. Please read it carefully before accepting.',
      'This Partner Agreement supplements and is incorporated into the Platform User Agreement and the Vendor Service Agreement (collectively, the "Prior Agreements"). Capitalized terms not defined herein shall have the meanings ascribed to them in the Prior Agreements. In the event of conflict, this Partner Agreement shall control.',
    ],
    sections: [
      {
        id: 'partner-relationship',
        title: 'ARTICLE 1 — PARTNER RELATIONSHIP AND ENHANCED CONSIDERATION',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'partner-relationship-1.1',
            title: '1.1 Establishment of Partner Relationship',
            level: 'section',
            content: [
              'By completing the vendor onboarding process and accepting this Partner Agreement, you acknowledge that you are entering into a deepened business relationship with the Company. This relationship is akin to a business partnership in which the Company grants you access to its proprietary systems, trade secrets, and confidential business processes in exchange for your agreement to the enhanced obligations set forth herein. You understand that this Partner Relationship represents the highest level of trust and access within the Company\'s business relationship framework.',
            ],
          },
          {
            id: 'partner-relationship-1.2',
            title: '1.2 Enhanced Benefits and Consideration',
            level: 'section',
            content: [
              'In addition to the benefits set forth in the Vendor Service Agreement, you acknowledge and agree that, by entering into this Partner Agreement, the Company provides you with the following additional valuable benefits and consideration:\n\n(a) Approved Vendor Status: Verification and approval by the Company, which carries reputational value, signals trustworthiness to consumers, and provides access to a curated marketplace from which unapproved vendors are excluded;\n\n(b) Full Platform Access: Unrestricted access to the Company\'s complete suite of proprietary vendor management tools, including advanced analytics, performance metrics, quality monitoring insights, and business intelligence features;\n\n(c) External Payment Facilitation: Access to the Company\'s proprietary External Payment facilitation system, which enables you to offer customers flexible payment options and is detailed in Article 3 below;\n\n(d) Integrated Payout System: Access to the Company\'s automated payout processing system, including direct deposit capabilities, payout tracking, and financial reporting;\n\n(e) [VERTICAL_MARKET_TERM] Network Access: The ability to enroll in, schedule at, and sell through the Company\'s network of verified [VERTICAL_MARKET_TERM]s, venues, events, and pickup locations;\n\n(f) Quality Monitoring: Participation in the Company\'s quality assurance program, which monitors and supports product quality, vendor reliability, and customer satisfaction;\n\n(g) Trial and Promotional Value: If applicable, complimentary access to paid subscription features during promotional or trial periods, representing quantifiable economic value equal to the Company\'s published subscription rates for the applicable period;\n\n(h) Ongoing Platform Investment: The benefit of the Company\'s ongoing investment in Platform development, marketing, customer acquisition, and community building, which continuously enhances the value of your marketplace participation; and\n\n(i) Business Partnership Benefits: The aggregate benefits of operating within the Company\'s ecosystem, including brand association, technology infrastructure, customer base access, operational support, and the cumulative network effects of a growing marketplace.\n\nYou expressly acknowledge and agree that: (i) the benefits described in this Section 1.2 and in Section 1.2 of the Vendor Service Agreement constitute substantial, adequate, and independently sufficient consideration for all obligations you assume under this Partner Agreement, including the trade secret, non-disclosure, non-competition, and injunctive relief provisions set forth herein; (ii) you have received, are receiving, and will continue to receive material economic value from the Company\'s provision of these benefits; (iii) the economic value of these benefits is not less than the burden of the obligations imposed upon you; and (iv) you enter into this Partner Agreement voluntarily, with full knowledge and understanding of its terms, and after having had the opportunity to seek independent legal counsel.',
            ],
          },
        ],
      },
      {
        id: 'trade-secrets',
        title: 'ARTICLE 2 — TRADE SECRET ACKNOWLEDGMENT AND PROTECTION',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'trade-secrets-2.1',
            title: '2.1 Trade Secret Acknowledgment',
            level: 'section',
            content: [
              'You acknowledge and agree that, through your access to the Platform as an approved Vendor Partner, you have been granted access to, and will continue to have access to, trade secrets of the Company as defined by the Texas Uniform Trade Secrets Act, Tex. Civ. Prac. & Rem. Code Ann. Chapter 134A ("TUTSA"), and the federal Defend Trade Secrets Act of 2016, 18 U.S.C. 1836 et seq. ("DTSA"). You acknowledge that these trade secrets:\n\n(a) Derive independent economic value, actual or potential, from not being generally known to, and not being readily ascertainable through proper means by, other persons who can obtain economic value from their disclosure or use;\n\n(b) Are the subject of efforts by the Company that are reasonable under the circumstances to maintain their secrecy, including but not limited to the layered access controls, confidentiality agreements, and restricted disclosure practices employed by the Company; and\n\n(c) Represent substantial investment by the Company in research, development, testing, and refinement.',
            ],
          },
          {
            id: 'trade-secrets-2.2',
            title: '2.2 Enumeration of Trade Secrets',
            level: 'section',
            content: [
              'Without limiting the generality of Section 2.1, you acknowledge that the following constitute trade secrets of the Company:\n\n(a) The Company\'s proprietary External Payment facilitation system, including the processes, methods, workflows, fee structures, vendor instructions, and technical implementation by which the Platform enables vendors to offer and manage external payment options;\n\n(b) The Company\'s vendor payout calculation methodologies, including timing algorithms, fee deduction sequences, proration methods, and automated payout processing systems;\n\n(c) The Company\'s quality assurance monitoring systems, alert criteria, and automated quality check methodologies;\n\n(d) The Company\'s geographic marketplace intelligence systems, including location-based matching algorithms, market expansion strategies, and geographic analysis methodologies;\n\n(e) The Company\'s subscription tier architecture, including the specific feature differentiation strategy, limit calculations, upgrade/downgrade logic, and trial-to-paid conversion systems;\n\n(f) The Company\'s vendor onboarding gate system, including the verification workflow, approval criteria, documentation requirements, and multi-stage qualification process;\n\n(g) The Company\'s marketplace recommendation and matching systems, including search algorithms, vendor ranking methodologies, and personalization features;\n\n(h) The Company\'s order lifecycle management system, including the confirmation, fulfillment, mutual handoff verification, and automated expiration workflows; and\n\n(i) Any additional systems, processes, methods, or features that the Company designates as proprietary or trade secret, or that a reasonable person in the industry would recognize as constituting trade secrets.',
            ],
          },
          {
            id: 'trade-secrets-2.3',
            title: '2.3 Duty of Secrecy',
            level: 'section',
            content: [
              'You agree to maintain the secrecy of all trade secrets identified in this Article 2 and shall not, directly or indirectly, disclose, publish, disseminate, describe, demonstrate, reverse engineer, or otherwise make available any trade secret to any person or entity not authorized by the Company to receive such information. This duty of secrecy applies regardless of the medium of disclosure and regardless of whether the disclosure is intentional or negligent.',
            ],
          },
          {
            id: 'trade-secrets-2.4',
            title: '2.4 Permitted Use',
            level: 'section',
            content: [
              'You may use the Company\'s trade secrets solely for the purpose of operating your vendor account and conducting business through the Platform in accordance with the terms of this Partner Agreement and the Prior Agreements. Any use of trade secrets for any purpose not expressly authorized herein is strictly prohibited.',
            ],
          },
        ],
      },
      {
        id: 'external-payments',
        title: 'ARTICLE 3 — EXTERNAL PAYMENT SYSTEM DISCLOSURE',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'external-payments-3.1',
            title: '3.1 Confidential Disclosure',
            level: 'section',
            content: [
              'The following information regarding the Company\'s External Payment Facilitation System is disclosed to you as a Vendor Partner on a confidential basis and constitutes trade secret information subject to the protections set forth in Article 2:\n\n(a) System Description: The Platform enables approved vendors to offer external payment options (including cash, Venmo, Cash App, PayPal, and other direct payment methods) as alternatives to Platform-Processed Payments. Orders placed by customers are tracked through the Platform regardless of payment method, enabling integrated order management and fulfillment tracking.\n\n(b) Fee Structure: Transactions completed via External Payment Methods are subject to a reduced vendor service fee of three and one-half percent (3.5%) of the order subtotal, compared to six and one-half percent (6.5%) for Platform-Processed Payment transactions. This reduced rate reflects the absence of payment processing costs borne by the Platform.\n\n(c) Vendor Responsibilities: When accepting External Payments, you are responsible for: (i) collecting payment directly from the customer at the point of pickup or via the applicable external payment service; (ii) confirming receipt of payment through the Platform\'s order management system; and (iii) settling applicable vendor service fees through the Platform\'s fee collection process as they accrue on your vendor fee ledger.\n\n(d) Customer Interface: External Payment options are presented to customers through the Platform\'s checkout experience. You shall not independently advertise, promote, or solicit External Payment arrangements outside of the Platform\'s designated checkout processes.',
            ],
          },
          {
            id: 'external-payments-3.2',
            title: '3.2 Confidentiality of External Payment System',
            level: 'section',
            content: [
              'The External Payment facilitation system described in Section 3.1 — including its design, implementation, fee structure, workflow, and the specific methods by which the Platform integrates external payments into its marketplace operations — constitutes a trade secret and Confidential Information of the Company. You shall not disclose the operational details of this system to any third party, competing platform, industry publication, or public forum.',
            ],
          },
        ],
      },
      {
        id: 'enhanced-nda',
        title: 'ARTICLE 4 — ENHANCED NON-DISCLOSURE AND NON-COMPETITION',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'enhanced-nda-4.1',
            title: '4.1 Enhanced Non-Disclosure',
            level: 'section',
            content: [
              'In addition to the non-disclosure obligations set forth in the Vendor Service Agreement, you agree that:\n\n(a) You shall treat all information obtained through your access to the Platform\'s vendor partner features — including but not limited to the trade secrets enumerated in Article 2, the External Payment system details disclosed in Article 3, and any beta features, development previews, or upcoming capabilities shared with you — as strictly confidential;\n\n(b) You shall not, during the term of this Partner Agreement or at any time thereafter, disclose, describe, demonstrate, screenshot, record, or otherwise communicate any trade secret or Confidential Information to any person or entity, except as expressly authorized by the Company in writing;\n\n(c) You shall not use any trade secret or Confidential Information for any purpose other than the operation of your vendor account on the Platform; and\n\n(d) Upon termination of your vendor account for any reason, you shall promptly return or destroy all materials, documents, files, and records containing or reflecting trade secrets or Confidential Information, and shall certify such return or destruction to the Company upon request.',
            ],
          },
          {
            id: 'enhanced-nda-4.2',
            title: '4.2 Enhanced Non-Competition',
            level: 'section',
            content: [
              'You acknowledge that the trade secrets and Confidential Information to which you have access as a Vendor Partner, combined with the substantial consideration provided to you by the Company, support the following enhanced non-competition covenant:\n\nDuring the term of your vendor account and for a period of twenty-four (24) months following termination of your account for any reason, you shall not, directly or indirectly:\n\n(a) Use any trade secret or Confidential Information of the Company to develop, design, build, operate, manage, advise on, consult for, invest in, or materially contribute to any marketplace platform, application, or service that competes with any aspect of the Platform;\n\n(b) Share, describe, demonstrate, or otherwise communicate the Company\'s proprietary systems, processes, methods, or trade secrets with any entity that operates or intends to operate a competing marketplace platform;\n\n(c) Serve as an employee, contractor, consultant, advisor, board member, or investor of any competing marketplace platform where your role involves or could reasonably be expected to involve the use or disclosure of the Company\'s trade secrets or Confidential Information;\n\n(d) Use any data, analytics, insights, or business intelligence obtained through the Platform to assist any competing marketplace platform in developing its features, processes, or business strategies; or\n\n(e) Recruit, solicit, or induce any vendor, shopper, or employee of the Company to terminate their relationship with the Company for the benefit of a competing marketplace platform.',
            ],
          },
          {
            id: 'enhanced-nda-4.3',
            title: '4.3 Scope Limitations',
            level: 'section',
            content: [
              'The non-competition covenant in Section 4.2 is narrowly tailored to protect the Company\'s legitimate business interests and expressly does NOT prohibit you from:\n\n(a) Selling your products or services through any existing marketplace, platform, farmers market, food truck park, or commercial venue;\n\n(b) Operating your own independent business, including maintaining your own website or social media presence;\n\n(c) Engaging in any lawful commercial activity that does not involve the use, disclosure, or misappropriation of the Company\'s trade secrets or Confidential Information; or\n\n(d) Participating in general industry knowledge-sharing, educational events, or professional associations, provided you do not disclose the Company\'s specific trade secrets or Confidential Information.',
            ],
          },
          {
            id: 'enhanced-nda-4.4',
            title: '4.4 Enforceability Under Texas Law',
            level: 'section',
            content: [
              'This non-competition covenant is ancillary to and part of an otherwise enforceable agreement, namely this Partner Agreement and the Prior Agreements, which provide for the exchange of valuable consideration as set forth in Section 1.2. This covenant complies with the Texas Business and Commerce Code Section 15.50 et seq., and you acknowledge that it is reasonable in scope, duration, and activity restrictions. If a court of competent jurisdiction determines that any restriction is overbroad, you agree that the court shall reform the restriction to the maximum extent enforceable rather than invalidating it entirely, in accordance with Tex. Bus. & Com. Code Section 15.51(c).',
            ],
          },
        ],
      },
      {
        id: 'remedies',
        title: 'ARTICLE 5 — REMEDIES',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'remedies-5.1',
            title: '5.1 Irreparable Harm',
            level: 'section',
            content: [
              'You acknowledge and agree that a breach or threatened breach of Articles 2, 3, or 4 of this Partner Agreement would cause the Company irreparable harm that cannot be adequately compensated by monetary damages alone.',
            ],
          },
          {
            id: 'remedies-5.2',
            title: '5.2 Injunctive Relief',
            level: 'section',
            content: [
              'In the event of a breach or threatened breach of this Partner Agreement, the Company shall be entitled to seek temporary, preliminary, and permanent injunctive relief, specific performance, and other equitable remedies, in addition to all other remedies available at law or in equity, without the necessity of proving actual damages. You hereby consent to the issuance of such injunctive relief and waive any requirement for the posting of a bond or other security as a condition of such relief to the maximum extent permitted by applicable law.',
            ],
          },
          {
            id: 'remedies-5.3',
            title: '5.3 Monetary Damages',
            level: 'section',
            content: [
              'In addition to equitable remedies, the Company shall be entitled to recover monetary damages for any breach of this Partner Agreement, including but not limited to: (a) actual damages suffered by the Company; (b) disgorgement of any profits or benefits obtained by you or any third party as a result of the breach; and (c) recovery of the Company\'s reasonable attorneys\' fees, expert witness fees, court costs, and other expenses incurred in enforcing this Partner Agreement.',
            ],
          },
          {
            id: 'remedies-5.4',
            title: '5.4 Cumulative Remedies',
            level: 'section',
            content: [
              'The remedies set forth in this Article 5 are cumulative and not exclusive. The exercise of any remedy shall not preclude the exercise of any other remedy available under this Partner Agreement, at law, or in equity.',
            ],
          },
          {
            id: 'remedies-5.5',
            title: '5.5 Federal and State Claims',
            level: 'section',
            content: [
              'You acknowledge that misappropriation of the Company\'s trade secrets may give rise to claims under the federal Defend Trade Secrets Act (18 U.S.C. 1836) and the Texas Uniform Trade Secrets Act (Tex. Civ. Prac. & Rem. Code Chapter 134A), and may also constitute a criminal offense under federal and state law. The Company reserves all rights to pursue any available federal and state remedies.',
            ],
          },
        ],
      },
      {
        id: 'survival',
        title: 'ARTICLE 6 — SURVIVAL AND TERMINATION',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'survival-6.1',
            title: '6.1 Survival',
            level: 'section',
            content: [
              'The following provisions of this Partner Agreement shall survive the termination or expiration of your vendor account and this Partner Agreement, regardless of the reason for termination:\n\n(a) Article 1, Section 1.2 (Benefits and Consideration acknowledgment) — indefinite survival;\n\n(b) Article 2 (Trade Secret Acknowledgment and Protection) — survives for as long as the information qualifies as a trade secret under applicable law;\n\n(c) Article 3 (External Payment System Disclosure) — survives for as long as the information qualifies as a trade secret under applicable law;\n\n(d) Article 4 (Enhanced Non-Disclosure and Non-Competition) — non-disclosure survives indefinitely for trade secrets, and for three (3) years for other Confidential Information; non-competition survives for twenty-four (24) months; non-solicitation survives for twelve (12) months;\n\n(e) Article 5 (Remedies) — indefinite survival; and\n\n(f) Article 7 (General Provisions) — indefinite survival.',
            ],
          },
          {
            id: 'survival-6.2',
            title: '6.2 Acknowledgment Upon Termination',
            level: 'section',
            content: [
              'Upon termination of your vendor account, the Company may require you to execute a written acknowledgment confirming your understanding of your continuing obligations under this Partner Agreement, including the return or destruction of Confidential Information and the duration of surviving obligations.',
            ],
          },
        ],
      },
      {
        id: 'partner-general',
        title: 'ARTICLE 7 — GENERAL PROVISIONS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'partner-general-7.1',
            title: '7.1 Governing Law and Jurisdiction',
            level: 'section',
            content: [
              'This Partner Agreement shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of law principles. Subject to the arbitration provisions in the Platform User Agreement, the exclusive jurisdiction and venue for any dispute arising under this Partner Agreement shall be the state and federal courts located in the State of Texas. You hereby irrevocably consent to the personal jurisdiction and venue of such courts.',
            ],
          },
          {
            id: 'partner-general-7.2',
            title: '7.2 Entire Agreement',
            level: 'section',
            content: [
              'This Partner Agreement, together with the Platform User Agreement, the Vendor Service Agreement, and the Privacy Policy, constitutes the entire agreement between you and the Company regarding the subject matter hereof.',
            ],
          },
          {
            id: 'partner-general-7.3',
            title: '7.3 Severability',
            level: 'section',
            content: [
              'If any provision of this Partner Agreement is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. If a court determines that any restrictive covenant is overbroad, the court shall reform the covenant to the maximum extent enforceable rather than void it, consistent with Texas Business and Commerce Code Section 15.51(c).',
            ],
          },
          {
            id: 'partner-general-7.4',
            title: '7.4 No Third-Party Beneficiaries',
            level: 'section',
            content: [
              'This Partner Agreement is for the sole benefit of the parties hereto and does not create any rights in any third party.',
            ],
          },
          {
            id: 'partner-general-7.5',
            title: '7.5 Headings',
            level: 'section',
            content: [
              'Section headings are for convenience only and do not affect the interpretation of this Partner Agreement.',
            ],
          },
          {
            id: 'partner-general-7.6',
            title: '7.6 Counterparts and Electronic Acceptance',
            level: 'section',
            content: [
              'This Partner Agreement may be accepted electronically in accordance with the E-SIGN Act and the Texas Uniform Electronic Transactions Act. Your electronic acceptance of this Partner Agreement shall have the same legal effect as a handwritten signature. The Company will maintain records of your acceptance, including the date, time, and IP address of acceptance.',
            ],
          },
          {
            id: 'partner-general-7.7',
            title: '7.7 Cooperation',
            level: 'section',
            content: [
              'In the event the Company reasonably suspects that a third party has misappropriated any of the Company\'s trade secrets or Confidential Information, you agree to cooperate in good faith with the Company\'s investigation and, if necessary, enforcement efforts, including providing truthful testimony and relevant documents.',
            ],
          },
          {
            id: 'partner-general-7.8',
            title: '7.8 Company Information',
            level: 'section',
            content: [
              '815 Enterprises is operated by VIIIXV LLC, a Texas limited liability company doing business as 815 Enterprises and [PLATFORM_NAME]. All references to "815 Enterprises" or "the Company" in this Partner Agreement and the Prior Agreements refer to VIIIXV LLC, d/b/a 815 Enterprises. Any legal disputes arising under this Partner Agreement shall be subject to the exclusive jurisdiction of the courts located in Potter County, Texas.',
            ],
          },
        ],
      },
    ],
  }
}
