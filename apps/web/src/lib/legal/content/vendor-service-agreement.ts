import type { LegalDocument } from '../types'

export function getVendorServiceAgreement(): LegalDocument {
  return {
    type: 'vendor_service',
    title: 'VENDOR SERVICE AGREEMENT',
    lastUpdated: 'March 2026',
    preamble: [
      'This Vendor Service Agreement ("Vendor Agreement") is entered into between you ("Vendor," "you," "your") and 815 Enterprises ("Company," "we," "us," "our"), effective upon your submission of a vendor application through the Platform located at [PLATFORM_DOMAIN].',
      'This Vendor Agreement supplements and is incorporated into the Platform User Agreement. Capitalized terms not defined herein shall have the meanings ascribed to them in the Platform User Agreement. In the event of any conflict between this Vendor Agreement and the Platform User Agreement, this Vendor Agreement shall control with respect to vendor-specific matters.',
    ],
    sections: [
      {
        id: 'vendor-relationship',
        title: 'ARTICLE 1 — VENDOR RELATIONSHIP AND CONSIDERATION',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'vendor-relationship-1.1',
            title: '1.1 Establishment of Vendor Relationship',
            level: 'section',
            content: [
              'By submitting a vendor application through the Platform, you acknowledge that you are entering into a business relationship with 815 Enterprises that extends beyond the general user relationship established under the Platform User Agreement. This Vendor Relationship carries additional rights, benefits, and obligations as set forth in this Vendor Agreement.',
            ],
          },
          {
            id: 'vendor-relationship-1.2',
            title: '1.2 Benefits and Consideration',
            level: 'section',
            content: [
              'You acknowledge and agree that, in exchange for your agreement to be bound by this Vendor Agreement, the Company provides you with the following valuable benefits and consideration, each of which you acknowledge has independent economic value:\n\n(a) Marketplace Access: Access to an established, technology-enabled marketplace with an active base of shoppers and buyers, providing you with sales channels and revenue opportunities that would be costly and time-consuming to develop independently;\n\n(b) Business Management Tools: Access to proprietary vendor dashboard, inventory management, order processing, scheduling, and analytics tools developed by the Company at substantial cost and representing significant proprietary value;\n\n(c) Payment Infrastructure: Access to integrated payment processing, payout management, and financial reporting systems that enable you to accept payments and receive earnings without the complexity and expense of establishing independent payment infrastructure;\n\n(d) Marketing and Visibility: Inclusion in the Company\'s marketplace, search results, and promotional efforts, providing marketing exposure and customer acquisition value;\n\n(e) Quality and Trust Framework: Participation in the Company\'s vendor verification, quality assurance, and community trust systems, which enhance your credibility and attract customers who value verified marketplace experiences;\n\n(f) Operational Support: Access to [VERTICAL_MARKET_TERM] enrollment, scheduling coordination, and operational logistics tools that simplify the complexity of selling at multiple locations;\n\n(g) Order Management Tools: Access to order confirmation, fulfillment tracking, issue resolution, and post-transaction feedback systems that support your customer service operations; and\n\n(h) Subscription Value and Trial Periods: If applicable, access to paid subscription features at no cost during promotional or trial periods, the value of which is based on the Company\'s published subscription rates.\n\nYou expressly acknowledge and agree that: (i) the foregoing benefits constitute adequate and sufficient consideration for all obligations you assume under this Vendor Agreement; (ii) you have received and continue to receive material economic value from the Company\'s provision of these benefits; and (iii) the Company has invested substantial resources in developing these benefits and the Platform infrastructure that supports them.',
            ],
          },
          {
            id: 'vendor-relationship-1.3',
            title: '1.3 Independent Contractor Status',
            level: 'section',
            content: [
              'Your relationship with the Company is that of an independent contractor. Nothing in this Vendor Agreement creates an employment, partnership, joint venture, or agency relationship between you and the Company. You are solely responsible for your own taxes, insurance, licenses, permits, and compliance with applicable laws.',
            ],
          },
        ],
      },
      {
        id: 'vendor-obligations',
        title: 'ARTICLE 2 — VENDOR OBLIGATIONS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'vendor-obligations-2.1',
            title: '2.1 Eligibility and Approval',
            level: 'section',
            content: [
              'Vendor accounts are subject to a multi-stage verification and approval process, which may include submission of business documentation, applicable permits and certifications, proof of insurance, and payment setup. The Company reserves the right to approve or deny any vendor application at its sole discretion.',
            ],
          },
          {
            id: 'vendor-obligations-2.2',
            title: '2.2 Product Listings',
            level: 'section',
            content: [
              'You agree to:\n\n(a) Provide accurate, complete, and non-misleading descriptions of all products listed on the Platform;\n\n(b) Set pricing that is fair, transparent, and compliant with applicable laws;\n\n(c) Maintain accurate inventory levels to prevent overselling;\n\n(d) Use only images that accurately represent the products being sold;\n\n(e) Comply with all applicable food safety, labeling, health, and regulatory requirements;\n\n(f) Include required quantity and measurement information for all published listings; and\n\n(g) Keep all listing information current and promptly update or remove listings that are no longer accurate or available.',
            ],
          },
          {
            id: 'vendor-obligations-2.3',
            title: '2.3 Prohibited Items',
            level: 'section',
            content: [
              'Certain items and categories are prohibited from being listed or sold on the Platform, including but not limited to controlled substances, firearms, explosives, tobacco products, recalled or adulterated products, and items not produced by you. The complete prohibited items list is presented during the vendor onboarding process and is available on the Platform. You must acknowledge the prohibited items policy before completing onboarding. Listing prohibited items may result in immediate suspension or termination of your vendor account.',
            ],
          },
          {
            id: 'vendor-obligations-2.4',
            title: '2.4 Order Fulfillment',
            level: 'section',
            content: [
              'You are responsible for:\n\n(a) Confirming pending orders within the applicable confirmation window;\n\n(b) Preparing orders accurately, safely, and on time for the designated pickup;\n\n(c) Maintaining product quality, freshness, and safety standards throughout preparation, storage, and pickup;\n\n(d) Being present and operational at the [VERTICAL_MARKET_TERM], venue, or pickup location during your scheduled times;\n\n(e) Responding to order confirmations and fulfillment issues through the Platform\'s order management tools; and\n\n(f) Completing the mutual order handoff confirmation process as required by the Platform.',
            ],
          },
          {
            id: 'vendor-obligations-2.5',
            title: '2.5 Compliance',
            level: 'section',
            content: [
              'You represent, warrant, and agree that you will at all times comply with all applicable federal, state, and local laws, regulations, ordinances, and licensing requirements applicable to your products and business operations, including but not limited to food safety regulations, health department requirements, business licensing requirements, and tax obligations as described in Article 5 of this Agreement.',
            ],
          },
        ],
      },
      {
        id: 'fees-payments',
        title: 'ARTICLE 3 — FEES AND PAYMENTS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'fees-payments-3.1',
            title: '3.1 Vendor Service Fees',
            level: 'section',
            content: [
              'You agree to pay the Company service fees as follows:\n\n(a) Platform-Processed Payment Transactions: A fee of six and one-half percent (6.5%) of the order subtotal is deducted from your payout for each transaction processed through the Platform\'s payment system, plus a flat fee of fifteen cents ($0.15) per order prorated across order items. These fees cover payment processing, platform services, and transaction facilitation.\n\n(b) External Payment Transactions: A reduced fee of three and one-half percent (3.5%) of the order subtotal applies to transactions completed through approved External Payment Methods, reflecting the absence of payment processing costs borne by the Platform.\n\n(c) External Payment Fee Collection: Fees for External Payment transactions are recorded to your vendor fee ledger. Accumulated fees are collected via a separate payment process when your outstanding balance reaches the applicable threshold or aging criteria. External Payment fees are not deducted from Platform-Processed Payment payouts.\n\n(d) Current fee rates are available in your vendor dashboard. The Company reserves the right to modify fee rates upon thirty (30) days\' written notice.',
            ],
          },
          {
            id: 'fees-payments-3.2',
            title: '3.2 Confidentiality of Fee Structures',
            level: 'section',
            content: [
              'You acknowledge that the specific fee percentages, rate structures, fee calculations, and payout methodologies applicable to vendors constitute confidential business information of the Company. You shall not disclose specific fee rates, structures, or calculations to any third party, including but not limited to competing platforms, industry publications, social media, or online forums, except as required by law or with the Company\'s prior written consent.',
            ],
          },
          {
            id: 'fees-payments-3.3',
            title: '3.3 Vendor Payouts',
            level: 'section',
            content: [
              'Payouts for Platform-Processed Payment orders are processed upon mutual confirmation of order fulfillment (handoff between vendor and shopper). Payout amounts equal the order subtotal minus applicable vendor service fees, plus any tip share attributable to product cost. Payouts are transferred to your connected payment account via the Platform\'s payout system.',
            ],
          },
          {
            id: 'fees-payments-3.4',
            title: '3.4 Prepaid Offering Payouts',
            level: 'section',
            content: [
              'For prepaid multi-week offerings ([VERTICAL_BOX_TERM]), the vendor payout is processed upon the buyer\'s initial purchase, not on a per-pickup basis. You are obligated to fulfill all scheduled pickups within the offering regardless of when payout is received.',
            ],
          },
          {
            id: 'fees-payments-3.5',
            title: '3.5 Subscription Plans',
            level: 'section',
            content: [
              'If you elect to subscribe to a paid vendor plan:\n\n(a) Available plans: [VENDOR_TIERS];\n\n(b) Plans are billed on a monthly basis unless otherwise specified;\n\n(c) You authorize recurring charges to your designated payment method at the applicable rate until cancellation;\n\n(d) Cancellation takes effect at the end of the current billing period; no prorated refunds are provided for partial periods;\n\n(e) Downgrading to a lower tier may result in deactivation of listings or features exceeding the lower tier\'s limits at the start of the next billing cycle; and\n\n(f) Plan pricing, features, and limits are displayed on the vendor subscription page and are subject to change with thirty (30) days\' notice.',
            ],
          },
          {
            id: 'fees-payments-3.6',
            title: '3.6 Trial Periods',
            level: 'section',
            content: [
              'The Company may, at its sole discretion, offer promotional trial periods during which you receive access to paid subscription features at no cost. By accepting a trial period, you acknowledge that: (a) the trial provides you with quantifiable economic value based on the Company\'s published subscription rates; (b) the trial is offered as additional consideration for your obligations under this Vendor Agreement; (c) upon expiration of the trial period, a brief transition period may be provided during which features remain accessible; and (d) after the trial and any transition period expire, your account will revert to the applicable free-tier features and limits unless you elect to subscribe to a paid plan.',
            ],
          },
        ],
      },
      {
        id: 'confidentiality',
        title: 'ARTICLE 4 — CONFIDENTIALITY',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'confidentiality-4.1',
            title: '4.1 Confidential Information',
            level: 'section',
            content: [
              'You acknowledge that, through your access to and use of the Platform\'s vendor tools, dashboard, analytics, and management features, you will be exposed to information, systems, processes, and methodologies that are proprietary to and constitute confidential business information of the Company ("Confidential Information"). Confidential Information includes, without limitation:\n\n(a) The design, functionality, features, and capabilities of vendor-side Platform tools, including but not limited to dashboard interfaces, analytics displays, order management workflows, scheduling systems, and reporting features;\n\n(b) Fee structures, pricing strategies, payout methodologies, and financial terms;\n\n(c) Quality assurance processes, vendor monitoring systems, and verification methodologies;\n\n(d) Business strategies, expansion plans, marketplace intelligence, and competitive positioning;\n\n(e) Technical architecture, system designs, and infrastructure details;\n\n(f) Vendor management processes, onboarding procedures, and approval criteria; and\n\n(g) Any information designated as "confidential" or "proprietary" by the Company, or which a reasonable person would understand to be confidential given the circumstances of disclosure.',
            ],
          },
          {
            id: 'confidentiality-4.2',
            title: '4.2 Non-Disclosure Obligations',
            level: 'section',
            content: [
              'You agree that you shall:\n\n(a) Hold all Confidential Information in strict confidence and not disclose, publish, describe, demonstrate, screenshot, record, or otherwise communicate any Confidential Information to any third party without the Company\'s prior written consent;\n\n(b) Use Confidential Information solely for the purpose of operating your vendor account and conducting business through the Platform;\n\n(c) Not use Confidential Information for any purpose that is competitive with, adverse to, or inconsistent with the Company\'s business interests;\n\n(d) Take reasonable measures to protect the confidentiality of Confidential Information, using at least the same degree of care that you use to protect your own confidential information, but in no event less than reasonable care; and\n\n(e) Promptly notify the Company if you become aware of any unauthorized disclosure or use of Confidential Information.',
            ],
          },
          {
            id: 'confidentiality-4.3',
            title: '4.3 Exceptions',
            level: 'section',
            content: [
              'Confidential Information does not include information that: (a) was publicly available at the time of disclosure; (b) becomes publicly available through no fault of yours; (c) was independently developed by you without reference to or use of Confidential Information; or (d) is required to be disclosed by law, provided you give the Company prompt notice and cooperate with the Company\'s efforts to obtain a protective order.',
            ],
          },
          {
            id: 'confidentiality-4.4',
            title: '4.4 Non-Solicitation',
            level: 'section',
            content: [
              'During the term of your vendor account and for a period of twelve (12) months following termination of your account for any reason, you shall not, directly or indirectly:\n\n(a) Use any data, information, or contacts obtained through the Platform (including customer lists, order histories, contact information, or shopping patterns) to solicit, recruit, or divert Platform users to any competing marketplace or service; or\n\n(b) Encourage, induce, or assist any other vendor to terminate their relationship with the Company or to join a competing platform using information obtained through the Platform.',
            ],
          },
          {
            id: 'confidentiality-4.5',
            title: '4.5 Non-Competition Covenant',
            level: 'section',
            content: [
              'You acknowledge that, through your access to the Platform\'s proprietary vendor tools and Confidential Information, you have gained specialized knowledge about the Company\'s business methods and systems. Accordingly, during the term of your vendor account and for a period of twelve (12) months following termination:\n\n(a) You shall not use specific knowledge of the Company\'s proprietary systems, processes, or methods gained through your use of the Platform to develop, design, build, operate, advise on, consult for, or materially contribute to any marketplace platform or service that replicates or substantially imitates the Company\'s proprietary processes;\n\n(b) This covenant is narrowly tailored and does not prohibit you from: (i) selling your products through other existing marketplaces or platforms; (ii) operating your own independent business; or (iii) engaging in any lawful commercial activity that does not involve the use or disclosure of the Company\'s Confidential Information or trade secrets.',
            ],
          },
          {
            id: 'confidentiality-4.6',
            title: '4.6 Reasonableness',
            level: 'section',
            content: [
              'You acknowledge and agree that the restrictions set forth in this Article 4 are reasonable in scope, duration, and geographic extent, and are necessary to protect the Company\'s legitimate business interests, including its Confidential Information, trade secrets, customer relationships, and competitive position. You further acknowledge that the consideration provided under Section 1.2 is adequate to support these restrictions.',
            ],
          },
          {
            id: 'confidentiality-4.7',
            title: '4.7 Survival',
            level: 'section',
            content: [
              'The obligations set forth in this Article 4 shall survive the termination or expiration of this Vendor Agreement and your vendor account for the periods specified herein, or where no period is specified, for a period of two (2) years following termination.',
            ],
          },
        ],
      },
      {
        id: 'sales-tax',
        title: 'ARTICLE 5 — SALES TAX AND TAX COMPLIANCE',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'sales-tax-5.1',
            title: '5.1 Marketplace Facilitator Status',
            level: 'section',
            content: [
              'The Company operates as a marketplace facilitator as defined under Texas Tax Code Section 151.0242. As a marketplace facilitator, the Company is responsible for collecting, reporting, and remitting applicable Texas state and local sales tax on all transactions processed through the Platform. You acknowledge that the Company collects sales tax from buyers at the point of sale and remits it to the Texas Comptroller of Public Accounts on your behalf for marketplace transactions.',
            ],
          },
          {
            id: 'sales-tax-5.2',
            title: '5.2 Tax Calculation',
            level: 'section',
            content: [
              'Sales tax is calculated automatically based on: (a) the product category and taxability classification of each item as determined by the Platform in accordance with Texas tax law; and (b) the applicable state and local tax rate for the pickup location where the transaction occurs. The Company uses commercially reasonable methods to determine correct tax rates and product taxability classifications. Sales tax is displayed as a separate line item to the buyer at checkout and is not included in the product price you set.',
            ],
          },
          {
            id: 'sales-tax-5.3',
            title: '5.3 Vendor Tax Obligations',
            level: 'section',
            content: [
              'Notwithstanding the Company\'s role as marketplace facilitator, you acknowledge and agree that:\n\n(a) You must obtain and maintain a valid Texas sales tax permit from the Texas Comptroller of Public Accounts. You shall provide your sales tax permit number to the Company upon request;\n\n(b) You must report marketplace sales on your Texas sales tax returns as marketplace provider transactions. Although the Company collects and remits the tax, you are required to report these sales to the Comptroller;\n\n(c) You are solely responsible for collecting and remitting sales tax on any sales you make outside the Platform, including walk-up cash sales, direct orders, and transactions at venues or events not processed through the Platform;\n\n(d) You are responsible for ensuring that your product listings are correctly categorized so that the Platform can determine the proper tax treatment. If you believe a product\'s tax classification is incorrect, you must notify the Company promptly;\n\n(e) You must maintain complete and accurate records of all sales, both on-platform and off-platform, for a minimum of four (4) years as required by Texas law; and\n\n(f) You are solely responsible for any federal, state, or local income tax obligations arising from your business activities, including income earned through the Platform.',
            ],
          },
          {
            id: 'sales-tax-5.4',
            title: '5.4 Tax Withholding from Vendor Payouts',
            level: 'section',
            content: [
              'Sales tax collected from buyers on your transactions is not included in your vendor payout. Vendor payouts are calculated based on the product subtotal minus applicable platform fees. The sales tax portion of each transaction is retained by the Company for remittance to the Texas Comptroller. You acknowledge that you have no claim to sales tax amounts collected by the Company on marketplace transactions.',
            ],
          },
          {
            id: 'sales-tax-5.5',
            title: '5.5 Tax Reporting and Information Sharing',
            level: 'section',
            content: [
              'The Company will:\n\n(a) Provide you with access to sales reports through your vendor dashboard showing total sales, taxable sales, non-taxable sales, and tax amounts collected for each period;\n\n(b) Issue IRS Form 1099-K to you for each calendar year in which your gross payments through the Platform meet or exceed the applicable federal reporting threshold;\n\n(c) Report your marketplace transactions to the Texas Comptroller as required by law; and\n\n(d) Maintain transaction records in accordance with applicable federal and state record retention requirements.\n\nYou consent to the Company collecting, storing, and sharing your tax-related information (including your name, address, taxpayer identification number, and transaction data) with tax authorities, payment processors, and tax reporting service providers as required by law or as necessary to fulfill the Company\'s tax obligations.',
            ],
          },
          {
            id: 'sales-tax-5.6',
            title: '5.6 Changes in Tax Law',
            level: 'section',
            content: [
              'Tax laws, rates, and classifications are subject to change. The Company will update its tax calculation methods as required by changes in applicable law. The Company is not liable for any errors in tax calculation resulting from changes in law that have not yet been incorporated into the Platform\'s tax systems, provided that the Company uses commercially reasonable efforts to implement such changes promptly.',
            ],
          },
          {
            id: 'sales-tax-5.7',
            title: '5.7 Record Retention',
            level: 'section',
            content: [
              'The Company maintains records of all marketplace transactions, including sales amounts, tax amounts collected, tax rates applied, product classifications, and payout amounts, for a minimum of four (4) years from the date of the transaction as required by Texas Tax Code. You may access your transaction records through your vendor dashboard for the duration of your account, and you may request copies of historical records by contacting the Company through the Platform\'s support page.',
            ],
          },
        ],
      },
      {
        id: 'vendor-termination',
        title: 'ARTICLE 6 — VENDOR ACCOUNT TERMINATION',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'vendor-termination-6.1',
            title: '6.1 Termination by Vendor',
            level: 'section',
            content: [
              'You may terminate your vendor account at any time through your account settings or by contacting the Company through the Platform\'s support page. Active subscriptions must be separately cancelled.',
            ],
          },
          {
            id: 'vendor-termination-6.2',
            title: '5.2 Termination by Company',
            level: 'section',
            content: [
              'The Company may suspend or terminate your vendor account at any time, with or without cause, at the Company\'s sole discretion, upon notice to you. Grounds for termination include, without limitation: violation of this Vendor Agreement, violation of the Platform User Agreement, fraudulent activity, quality issues, failure to fulfill orders, regulatory non-compliance, business restructuring, or conduct detrimental to the Platform or its users.',
            ],
          },
          {
            id: 'vendor-termination-6.3',
            title: '5.3 Effect of Termination',
            level: 'section',
            content: [
              'Upon termination of your vendor account: (a) your access to vendor tools and features will be deactivated; (b) outstanding order obligations must be fulfilled or properly cancelled; (c) pending payouts will be processed in accordance with normal payout schedules, subject to any holds for disputed transactions; (d) outstanding vendor fee balances must be settled; and (e) your obligations under Article 4 (Confidentiality) shall survive termination for the periods specified therein.',
            ],
          },
        ],
      },
    ],
  }
}
